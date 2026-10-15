(() => {
  const PROJECT_URL = "https://lrstzjsxobqifqxryvxk.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_6O02Z2O0_sdApKGPmyoZOg_wt7Rp1wl";
  const status = document.querySelector("#sync-status");
  const dialog = document.querySelector("#sync-dialog");
  const form = document.querySelector("#sync-form");
  const emailInput = document.querySelector("#sync-email");
  const emailLabel = document.querySelector("#sync-email-label");
  const sendButton = document.querySelector("#sync-send-link");
  const signOutButton = document.querySelector("#sync-signout");
  const importFile = document.querySelector("#sync-import-file");
  const conflictPanel = document.querySelector("#sync-conflict");
  let supabaseClient;
  let currentUser = null;
  let ready = false;
  let pendingConflict = null;
  let saveTimer = 0;
  let pullTimer = 0;
  let pullInProgress = false;
  let lastPulledAt = "";
  const markerKey = (userId) => `reading-room-sync-v1:${userId}`;
  const revisionKey = "reading-room-local-revision-v1";

  function setStatus(message, tone = "") {
    status.textContent = message;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  }
  function marker() {
    try { return JSON.parse(localStorage.getItem(markerKey(currentUser.id)) || "null"); }
    catch { return null; }
  }
  function saveMarker(updatedAt) {
    const localRevision = Number(localStorage.getItem(revisionKey) || 0);
    localStorage.setItem(markerKey(currentUser.id), JSON.stringify({ updatedAt, localRevision }));
  }
  function hasMeaningfulLocalState(value) {
    if (!value) return false;
    return Boolean((value.books || []).length || (value.notes || []).length || (value.highlights || []).length || (value.profileBooks || []).length || (value.chapters || []).some((chapter) => chapter.read) || value.profile?.quote || value.profile?.name !== "Reader" || value.club?.name !== "The Reading Room" || JSON.stringify(value.club?.members || []) !== JSON.stringify(["Reese", "Morgan"]));
  }
  function updateAccountUI() {
    const button = document.querySelector("#sync-open");
    const signedIn = Boolean(currentUser);
    button.setAttribute("aria-label", signedIn ? "Manage device sync" : "Set up device sync");
    button.innerHTML = signedIn ? "☁ <span>Synced</span>" : "↗ <span>Sync</span>";
    emailLabel.hidden = signedIn;
    sendButton.hidden = signedIn;
    signOutButton.hidden = !signedIn;
    if (signedIn && emailInput) emailInput.required = false;
    if (!signedIn && emailInput) emailInput.required = true;
  }
  function setSyncStatus(message, tone) {
    setStatus(message, tone);
    updateAccountUI();
  }
  function openDialog() {
    conflictPanel.hidden = true;
    if (!dialog.open) dialog.showModal();
    if (currentUser) setSyncStatus(`Signed in as ${currentUser.email || "your account"}. Changes sync to your other devices.`, "success");
  }
  function updateRemote(state, updatedAt = new Date().toISOString()) {
    return supabaseClient.from("reading_room_state").upsert({ user_id: currentUser.id, state, updated_at: updatedAt }, { onConflict: "user_id" }).select("updated_at").single();
  }
  function downloadBackup() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!state || typeof state !== "object") {
        setSyncStatus("There is no saved reading room on this device to back up yet.", "error");
        return;
      }
      const backup = { app: "the-reading-room", version: 1, exportedAt: new Date().toISOString(), state };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reading-room-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSyncStatus("Backup downloaded. Keep it somewhere you can find it on this device.", "success");
    } catch (error) {
      setSyncStatus(`Could not make a backup: ${error.message || "please try again"}`, "error");
    }
  }
  async function restoreBackup(file) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      const restoredState = backup?.app === "the-reading-room" ? backup.state : backup;
      if (!restoredState || typeof restoredState !== "object" || Array.isArray(restoredState)) throw new Error("That file is not a Reading Room backup.");
      if (!window.confirm("Restore this backup on this device? It will replace the reading room currently saved here.")) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredState));
      localStorage.setItem(revisionKey, String(Date.now()));
      setSyncStatus("Backup restored on this device. Reloading your reading room…", "success");
      setTimeout(() => location.reload(), 250);
    } catch (error) {
      setSyncStatus(`Could not restore that backup: ${error.message || "please choose a valid JSON backup"}`, "error");
    } finally {
      importFile.value = "";
    }
  }
  async function pushLocalState() {
    if (!currentUser || !ready || pullInProgress) return;
    try {
      const result = await updateRemote(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
      if (result.error) throw result.error;
      const savedAt = result.data.updated_at;
      saveMarker(savedAt);
      setSyncStatus(`Synced just now · ${currentUser.email || "your account"}`, "success");
    } catch (error) {
      setSyncStatus(`Sync could not save: ${error.message || "check the table setup"}`, "error");
    }
  }
  function queueSave() {
    localStorage.setItem(revisionKey, String(Date.now()));
    if (!currentUser || !ready || pullInProgress) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushLocalState, 650);
  }
  function applyCloudState(remote) {
    if (!remote?.state || typeof remote.state !== "object") return;
    pullInProgress = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote.state));
    localStorage.setItem(revisionKey, String(Date.now()));
    saveMarker(remote.updated_at);
    lastPulledAt = remote.updated_at;
    location.reload();
  }
  function resolveConflict(choice) {
    if (!pendingConflict) return;
    const remote = pendingConflict;
    pendingConflict = null;
    conflictPanel.hidden = true;
    if (choice === "cloud") applyCloudState(remote);
    else void pushLocalState();
  }
  async function reconcile(session) {
    const user = session?.user;
    if (!user) {
      currentUser = null;
      ready = false;
      clearInterval(pullTimer);
      setSyncStatus("Not connected yet", "");
      return;
    }
    if (currentUser?.id === user.id && ready) return;
    currentUser = user;
    ready = false;
    updateAccountUI();
    setSyncStatus("Checking your saved reading room…", "");
    try {
      const { data: remote, error } = await supabaseClient.from("reading_room_state").select("state,updated_at").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      const localRaw = localStorage.getItem(STORAGE_KEY);
      const localState = localRaw ? JSON.parse(localRaw) : null;
      const previous = marker();
      const localRevision = Number(localStorage.getItem(revisionKey) || 0);
      if (remote) {
        const localChanged = hasMeaningfulLocalState(localState) && (!previous || localRevision > Number(previous.localRevision || 0));
        const remoteChanged = !previous || new Date(remote.updated_at) > new Date(previous.updatedAt || 0);
        if (!localRaw || !hasMeaningfulLocalState(localState)) {
          applyCloudState(remote);
          return;
        }
        if (localChanged && remoteChanged) {
          pendingConflict = remote;
          conflictPanel.hidden = false;
          ready = true;
          setSyncStatus("Both copies have changes. Choose which one should be kept.", "");
          return;
        }
        if (remoteChanged && !localChanged) {
          applyCloudState(remote);
          return;
        }
        ready = true;
        if (localChanged) await pushLocalState();
        else {
          saveMarker(remote.updated_at);
          setSyncStatus(`Synced · ${user.email || "your account"}`, "success");
        }
      } else {
        ready = true;
        await pushLocalState();
      }
      clearInterval(pullTimer);
      pullTimer = setInterval(pullLatest, 30000);
    } catch (error) {
      ready = false;
      setSyncStatus(`Could not connect to your saved data: ${error.message || "check the table setup"}`, "error");
    }
  }
  async function pullLatest() {
    if (!currentUser || !ready || document.hidden || pullInProgress) return;
    try {
      const { data, error } = await supabaseClient.from("reading_room_state").select("state,updated_at").eq("user_id", currentUser.id).maybeSingle();
      if (error) throw error;
      if (!data || data.updated_at === lastPulledAt) return;
      const previous = marker();
      if (!previous || new Date(data.updated_at) > new Date(previous.updatedAt || 0)) {
        if (Number(localStorage.getItem(revisionKey) || 0) > Number(previous?.localRevision || 0)) {
          pendingConflict = data;
          conflictPanel.hidden = false;
          openDialog();
          setSyncStatus("This device and your other device both changed. Choose which copy to keep.", "");
          return;
        }
        applyCloudState(data);
      }
    } catch (error) {
      setSyncStatus(`Sync check failed: ${error.message || "please try again"}`, "error");
    }
  }
  function boot() {
    if (!window.supabase?.createClient) {
      setSyncStatus("Sync library did not load. Check your connection and reload.", "error");
      return;
    }
    supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { currentUser = null; ready = false; clearInterval(pullTimer); setSyncStatus("Signed out. This device still keeps its local copy.", ""); }
      else if (session) setTimeout(() => { void reconcile(session); }, 0);
    });
    void supabaseClient.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (data.session) return reconcile(data.session);
      setSyncStatus("Not connected yet", "");
    }).catch((error) => setSyncStatus(`Could not check sign-in: ${error.message || "try reloading"}`, "error"));
  }

  document.querySelector("#sync-open").addEventListener("click", openDialog);
  document.querySelector("#sync-export").addEventListener("click", downloadBackup);
  document.querySelector("#sync-import-open").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => { void restoreBackup(importFile.files?.[0]); });
  document.querySelector("#sync-use-device").addEventListener("click", () => resolveConflict("device"));
  document.querySelector("#sync-use-cloud").addEventListener("click", () => resolveConflict("cloud"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentUser) return;
    const email = emailInput.value.trim();
    if (!email) return;
    sendButton.disabled = true;
    setSyncStatus("Sending a secure sign-in link…", "");
    try {
      const redirectTo = `${location.origin}${location.pathname}`;
      const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      setSyncStatus(`Check ${email} for your sign-in link, then open it on this device.`, "success");
    } catch (error) {
      setSyncStatus(`Could not send the link: ${error.message || "please try again"}`, "error");
    } finally { sendButton.disabled = false; }
  });
  signOutButton.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) setSyncStatus(`Could not sign out: ${error.message}`, "error");
    else setSyncStatus("Signed out. This device still keeps its local copy.", "");
  });
  window.addEventListener("focus", () => { void pullLatest(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void pullLatest(); });
  window.BookClubSync = { boot, queueSave };
})();

