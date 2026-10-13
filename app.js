const STORAGE_KEY = "reading-room-v1";
const starter = {
  book: { title: "The Paper Garden", author: "Your next favorite author", description: "A story for slow evenings, underlined sentences, and conversations that keep going after the last page." },
  chapters: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `Chapter ${i + 1}`, read: false })),
  notes: []
};
let state;
try { state = { ...starter, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
catch { state = structuredClone(starter); }
let activeNoteChapter = null;
let toastTimeout;
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function showToast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("show"), 2200); }
function chapterNumber(id) { return state.chapters.findIndex((chapter) => chapter.id === id); }
function isUnlocked(id) { const index = chapterNumber(id); return index >= 0 && state.chapters.slice(0, index + 1).every((chapter) => chapter.read); }
function readableDate(value) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

function render() {
  const readCount = state.chapters.filter((chapter) => chapter.read).length;
  const total = state.chapters.length;
  const percentage = total ? Math.round(readCount / total * 100) : 0;
  $("#book-title").textContent = state.book.title;
  $("#book-author").textContent = state.book.author;
  $("#book-description").textContent = state.book.description;
  $("#cover-title").innerHTML = escapeHTML(state.book.title).replace(/\s+/g, "<br />");
  $("#cover-author").textContent = state.book.author.toUpperCase();
  $("#chapter-total").textContent = `${total} ${total === 1 ? "chapter" : "chapters"}`;
  $("#progress-percent").textContent = `${percentage}%`;
  $("#progress-fill").style.width = `${percentage}%`;
  $("#progress-count").textContent = `${readCount} of ${total}`;
  const notesCount = state.notes.length;
  $("#note-count").textContent = notesCount;
  $("#notes-pill").textContent = `${notesCount} ${notesCount === 1 ? "note" : "notes"}`;

  $("#chapter-list").innerHTML = state.chapters.map((chapter) => {
    const unlocked = isUnlocked(chapter.id);
    return `<div class="chapter-row ${chapter.read ? "read" : ""}">
      <button class="chapter-check" data-toggle="${chapter.id}" aria-label="Mark ${escapeHTML(chapter.title)} ${chapter.read ? "unread" : "read"}" aria-pressed="${chapter.read}">${chapter.read ? "✓" : ""}</button>
      <div class="chapter-text"><div class="chapter-name">${escapeHTML(chapter.title)}</div><div class="chapter-sub">${chapter.read ? "Chapter read · notes unlocked" : unlocked ? "Ready for your thoughts" : "Read the chapters before this to unlock notes"}</div></div>
      <button class="chapter-action ${unlocked ? "" : "locked"}" data-note="${chapter.id}" ${unlocked ? "" : "disabled"}>${unlocked ? "＋ Add a note" : "⌑ Locked"}</button>
    </div>`;
  }).join("");

  const visibleNotes = state.notes.filter((note) => isUnlocked(note.chapterId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $("#notes-content").innerHTML = visibleNotes.length ? visibleNotes.map((note) => {
    const chapter = state.chapters.find((item) => item.id === note.chapterId);
    if (!chapter) return "";
    return `<article class="note-card"><div class="note-card-header"><span class="note-card-chapter">${escapeHTML(chapter.title.toUpperCase())}</span><span class="note-date">${readableDate(note.createdAt)}</span></div><p>${escapeHTML(note.body).replace(/\n/g, "<br>")}</p><div class="note-author">left by <strong>${escapeHTML(note.name || "Reader")}</strong></div></article>`;
  }).join("") : `<div class="empty-notes"><span class="empty-illustration">✎</span><strong>Your margins are waiting.</strong><p>When you’ve read a chapter, leave a little note here for your book club.</p><span class="empty-note-unlock">✳ Notes open as you read</span></div>`;
}

function openBookDialog() {
  const form = $("#book-form"); form.elements.title.value = state.book.title; form.elements.author.value = state.book.author; form.elements.description.value = state.book.description; form.elements.chapters.value = state.chapters.length; $("#book-dialog").showModal();
}
$("#edit-book-open").addEventListener("click", openBookDialog);
$("#edit-book-inline").addEventListener("click", openBookDialog);
$("#book-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = event.currentTarget; const count = Number(form.elements.chapters.value);
  state.book = { title: form.elements.title.value.trim(), author: form.elements.author.value.trim(), description: form.elements.description.value.trim() };
  if (count < state.chapters.length) {
    const removedIds = new Set(state.chapters.slice(count).map((chapter) => chapter.id));
    state.notes = state.notes.filter((note) => !removedIds.has(note.chapterId));
    state.chapters = state.chapters.slice(0, count);
  } else while (state.chapters.length < count) state.chapters.push({ id: Date.now() + state.chapters.length, title: `Chapter ${state.chapters.length + 1}`, read: false });
  save(); render(); $("#book-dialog").close(); showToast("Book details updated");
});

$("#chapter-list").addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-toggle]");
  if (toggleButton) {
    const index = chapterNumber(Number(toggleButton.dataset.toggle)); const chapter = state.chapters[index];
    chapter.read = !chapter.read;
    if (!chapter.read) state.chapters.slice(index + 1).forEach((later) => { later.read = false; });
    save(); render(); showToast(chapter.read ? "Chapter marked read · notes unlocked" : "Progress updated"); return;
  }
  const noteButton = event.target.closest("[data-note]");
  if (noteButton) {
    activeNoteChapter = Number(noteButton.dataset.note); const chapter = state.chapters.find((item) => item.id === activeNoteChapter);
    if (!chapter || !isUnlocked(activeNoteChapter)) return;
    $("#note-chapter-label").textContent = `${chapter.title.toUpperCase()} · A NOTE IN THE MARGIN`; $("#note-form").reset(); $("#note-dialog").showModal();
  }
});
$("#note-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = event.currentTarget;
  state.notes.push({ id: crypto.randomUUID(), chapterId: activeNoteChapter, name: form.elements.name.value.trim(), body: form.elements.body.value.trim(), createdAt: new Date().toISOString() });
  save(); render(); $("#note-dialog").close(); showToast("Your note has been tucked into the margins");
});
$("#add-chapter").addEventListener("click", () => { $("#chapter-form").reset(); $("#confirm-dialog").showModal(); });
$("#chapter-form").addEventListener("submit", (event) => {
  event.preventDefault(); const title = event.currentTarget.elements.title.value.trim();
  state.chapters.push({ id: Date.now(), title, read: false }); save(); render(); $("#confirm-dialog").close(); showToast("Chapter added to your reading list");
});
$("#reset-progress").addEventListener("click", () => {
  if (!state.chapters.some((chapter) => chapter.read)) { showToast("Your reading progress is already clear"); return; }
  state.chapters.forEach((chapter) => { chapter.read = false; }); save(); render(); showToast("Reading progress reset");
});
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
render();

