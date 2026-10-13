const STORAGE_KEY = "reading-room-v1";
const starter = {
  book: { title: "The Paper Garden", author: "Your next favorite author", description: "A story for slow evenings, underlined sentences, and conversations that keep going after the last page.", isbn: "" },
  chapters: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `Chapter ${i + 1}`, read: false })),
  notes: [],
  books: [],
  club: { name: "The Reading Room", members: ["Reese", "Morgan"] },
  profile: { name: "Reader", avatar: "ghost-reading.png", avatarLook: { hat: "none", pet: "none", bookColor: "paper" }, quote: "", quoteBook: "" },
  profileBooks: []
};
let state;
try { state = { ...starter, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
catch { state = structuredClone(starter); }
state.book = { ...starter.book, ...(state.book || {}) };
state.books = Array.isArray(state.books) ? state.books : [];
state.club = { ...starter.club, ...(state.club || {}) };
state.club.members = Array.isArray(state.club.members) ? state.club.members : starter.club.members;
state.profile = { ...starter.profile, ...(state.profile || {}) };
if (state.profile.avatar === "ghost-reading.svg") state.profile.avatar = "ghost-reading.png";
state.profile.avatarLook = { ...starter.profile.avatarLook, ...(state.profile.avatarLook || {}) };
state.profileBooks = Array.isArray(state.profileBooks) ? state.profileBooks.slice(0, 9) : [];
state.shelfStyle = { wood: "oak", edge: "straight", ...(state.shelfStyle || {}) };
let recoveredBookCount = 0;
if (!state.books.length) {
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index); if (!key || key === STORAGE_KEY) continue;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(saved?.books) && saved.books.some((book) => book && String(book.title || "").trim())) {
        state.books = saved.books; recoveredBookCount = state.books.length; break;
      }
    } catch { /* Ignore unrelated local storage values. */ }
  }
}
let activeNoteChapter = null;
let activeShelfBook = null;
let activeBookContext = "history";
let pendingBooks = [];
let renderedShelfSignature = "";
let toastTimeout;
let searchDelay;
let activePage = "club";
let profileBookSearchResults = [];
let pendingAvatarLook = { ...state.profile.avatarLook };
let pendingAvatarLookChanged = false;
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function showToast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("show"), 2200); }
function chapterNumber(id) { return state.chapters.findIndex((chapter) => chapter.id === id); }
function isUnlocked(id) { const index = chapterNumber(id); return index >= 0 && state.chapters.slice(0, index + 1).every((chapter) => chapter.read); }
function readableDate(value) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
function normalizedBookKey(book) { return `${(book.title || "").trim().toLocaleLowerCase()}|${(book.author || "").trim().toLocaleLowerCase()}`; }
function hasBook(book) { const key = normalizedBookKey(book); return state.books.some((saved) => normalizedBookKey(saved) === key); }
function addShelfBook(book, { refresh = false } = {}) {
  if (!book.title?.trim()) return false;
  const title = book.title.trim(); const author = (book.author || "").trim();
  const existing = state.books.find((saved) => normalizedBookKey(saved) === normalizedBookKey({ title, author }));
  if (existing) {
    if (!refresh) return false;
    existing.id ||= crypto.randomUUID(); existing.title ||= title; existing.author ||= author;
    existing.dateRead ||= book.dateRead || ""; existing.isbn ||= cleanISBN(book.isbn);
    existing.coverUrl ||= safeCoverUrl(book.coverUrl); existing.source ||= book.source || "manual";
    return "updated";
  }
  state.books.unshift({ id: crypto.randomUUID(), title, author, dateRead: book.dateRead || "", isbn: cleanISBN(book.isbn), coverUrl: safeCoverUrl(book.coverUrl), source: book.source || "manual" });
  return "added";
}
function cleanISBN(value) {
  const isbn = String(value || "").replace(/[^0-9xX]/g, "").toUpperCase();
  return isbn.length === 10 || isbn.length === 13 ? isbn : "";
}
function safeCoverUrl(value) {
  try { const url = new URL(String(value || "")); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}
function coverURL(book) {
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(String(book.coverUrl || ""))) return book.coverUrl;
  const direct = safeCoverUrl(book.coverUrl); if (direct) return direct;
  const isbn = cleanISBN(book.isbn); return isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false` : "";
}

function renderShelf(force = false) {
  const books = Array.isArray(state.books) ? state.books.filter((book) => book && String(book.title || "").trim()) : [];
  state.books = books;
  books.forEach((book) => { book.id ||= crypto.randomUUID(); });
  const empty = $("#bookshelf-empty"); const track = $("#bookshelf-books"); const viewport = $("#bookshelf-window");
  const signature = JSON.stringify(books.map(({ id, title, author, dateRead, isbn, coverUrl }) => [id, title, author, dateRead, isbn, coverUrl]));
  $("#bookshelf-count").textContent = `${books.length} ${books.length === 1 ? "book" : "books"}`;
  empty.hidden = books.length > 0;
  if (!books.length) { track.innerHTML = ""; track.style.animation = "none"; renderedShelfSignature = signature; return; }
  if (!force && signature === renderedShelfSignature && track.firstElementChild) return;
  renderedShelfSignature = signature;

  const bookMarkup = books.map((book, index) => {
    const cover = coverURL(book);
    return `<button class="shelf-book shelf-tone-${index % 6}" data-shelf-book="${escapeHTML(book.id)}" aria-label="${escapeHTML(book.title)} by ${escapeHTML(book.author || "Unknown author")}${book.dateRead ? `, finished ${escapeHTML(book.dateRead)}` : ""}" title="${escapeHTML(book.title)}${book.author ? ` · ${escapeHTML(book.author)}` : ""}"><span class="shelf-cover-fallback"><span class="shelf-cover-title">${escapeHTML(book.title)}</span><span class="shelf-cover-rule"></span><span class="shelf-cover-author">${escapeHTML(book.author || "BOOK CLUB")}</span></span>${cover ? `<img class="shelf-cover-image" src="${escapeHTML(cover)}" alt="" loading="lazy" />` : ""}</button>`;
  }).join("");
  const oneLoop = `<div class="bookshelf-loop">${bookMarkup}</div>`;
  track.style.animation = "none";
  track.innerHTML = oneLoop;
  const setWidth = track.firstElementChild.getBoundingClientRect().width;
  const copies = Math.max(2, Math.ceil((viewport.clientWidth + setWidth) / Math.max(setWidth, 1)) + 1);
  track.innerHTML = oneLoop.repeat(copies);
  track.style.setProperty("--shelf-distance", `${setWidth}px`);
  track.style.setProperty("--shelf-duration", `${Math.max(45, setWidth / 16)}s`);
  track.style.animation = "shelf-loop var(--shelf-duration) linear infinite";
  track.querySelectorAll(".shelf-cover-image").forEach((image) => image.addEventListener("error", () => image.remove(), { once: true }));
}
function applyShelfStyle() {
  document.body.dataset.shelfWood = state.shelfStyle.wood;
  document.body.dataset.shelfEdge = state.shelfStyle.edge;
}

function setPage(page) {
  activePage = page;
  document.body.dataset.activePage = page;
  document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === page));
  document.querySelectorAll("[data-page]").forEach((section) => { section.hidden = section.dataset.page !== page; });
  $(".breadcrumb b").textContent = ({ club: "BOOK CLUB", profile: "PROFILE", discover: "DISCOVER" })[page];
  if (page === "profile") renderProfile();
  if (page === "discover") renderFriends();
}
document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.tab)));

function renderClub() {
  $("#club-name-display").textContent = state.club.name;
  $("#club-member-list").innerHTML = state.club.members.map((name, index) => `<span class="member-chip"><i class="member-avatar avatar-${index % 4}">${escapeHTML(name.trim().charAt(0).toUpperCase() || "R")}</i>${escapeHTML(name)}</span>`).join("");
  $(".reader-avatars").setAttribute("aria-label", `${state.club.members.length} club members`);
  $(".reader-avatars").innerHTML = state.club.members.slice(0, 3).map((name, index) => `<i class="avatar-${index % 4}">${escapeHTML(name.trim().charAt(0).toUpperCase() || "R")}</i>`).join("");
}
function renderProfile() {
  $("#profile-name-display").textContent = state.profile.name;
  const usesGhostDrawing = !state.profile.avatar || ["ghost-reading.svg", "ghost-reading.png"].includes(state.profile.avatar);
  $("#profile-avatar").src = usesGhostDrawing ? ghostAvatarURL(state.profile.avatarLook) : state.profile.avatar;
  $("#profile-avatar").classList.toggle("avatar-drawing", usesGhostDrawing);
  const quote = state.profile.quote?.trim();
  $("#profile-quote-display").textContent = quote ? `“${quote}”${state.profile.quoteBook ? ` — ${state.profile.quoteBook}` : ""}` : "";
  $("#profile-quote-display").hidden = !quote;
  $("#profile-book-count").textContent = `${state.profileBooks.length} of 9 books selected`;
  $("#profile-book-grid").innerHTML = Array.from({ length: 9 }, (_, index) => {
    const book = state.profileBooks[index];
    const cover = book ? coverURL(book) : "";
    return `<div class="profile-shelf-slot">${book ? `<button class="profile-book-cover" data-profile-book="${escapeHTML(book.id || normalizedBookKey(book))}" title="View ${escapeHTML(book.title)}" aria-label="View ${escapeHTML(book.title)} details">${cover ? `<img src="${escapeHTML(cover)}" alt="Cover of ${escapeHTML(book.title)}" loading="lazy" />` : `<span class="profile-cover-fallback">${escapeHTML(book.title)}</span>`}</button>` : `<button class="profile-book-empty" data-open-book-picker aria-label="Choose a book for shelf slot ${index + 1}"><span>＋</span><small>Choose a book</small></button>`}</div>`;
  }).join("");
}
let ghostDrawingData = "";
fetch("ghost-reading.png").then((response) => response.ok ? response.blob() : Promise.reject()).then((blob) => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
})).then((data) => { ghostDrawingData = data; if (["ghost-reading.png", "ghost-reading.svg"].includes(state.profile.avatar)) renderProfile(); }).catch(() => {});
function ghostAvatarURL(look = {}) {
  const hasExtras = look.hat && look.hat !== "none" || look.pet && look.pet !== "none" || look.bookColor && look.bookColor !== "paper";
  if (!hasExtras || !ghostDrawingData) return "ghost-reading.png";
  const colors = { coffee: "#76604f", maroon: "#713d48", sage: "#879486", blue: "#667783" };
  const hats = {
    beret: `<path d="M244 91q54-56 126-35 29 9 42 36-62 30-161 15zM258 105q64 12 143-10" fill="#fffefa" fill-opacity=".9" stroke="#343b36" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    beanie: `<path d="M248 94q8-66 76-76 62-5 91 58l-11 27q-71-15-151 5zM251 87q74 18 161-3" fill="#fffefa" fill-opacity=".9" stroke="#343b36" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="325" cy="17" r="11" fill="#fffefa" stroke="#343b36" stroke-width="6"/>`,
    witch: `<path d="m263 93 54-82 57 84q-53-18-111-2zM246 99q72-24 139 3 6 12-10 16-63-17-128 4-15-8-1-23z" fill="#fffefa" fill-opacity=".9" stroke="#343b36" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
  };
  const pets = {
    cat: `<g transform="translate(560 410)" fill="#fffefa" stroke="#343b36" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="m0 22 3-34 25 19 24-22 8 41q-3 31-30 32Q3 58 0 22z"/><path d="M16 25h2m23 0h2m-19 13q6 5 12 0"/></g>`,
    bird: `<g transform="translate(570 430)" fill="#fffefa" stroke="#343b36" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M0 25Q6-8 37-5q31 2 35 32-19-14-37 2Q18 14 0 25z"/><path d="m68 21 18 7-18 7M27 58v14m25-14v14"/><circle cx="50" cy="9" r="3" fill="#343b36"/></g>`
  };
  const color = colors[look.bookColor] || "";
  const recolor = color ? `<path d="M20 260 65 230 151 288 190 254 330 354 313 386 160 320 95 353 28 309Z" fill="${color}" fill-opacity=".34"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 800"><image href="${ghostDrawingData}" width="700" height="800" preserveAspectRatio="none"/>${recolor}${hats[look.hat] || ""}${pets[look.pet] || ""}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function renderFriends(query = "") {
  const needle = query.trim().toLocaleLowerCase();
  const members = state.club.members.filter((name) => !needle || name.toLocaleLowerCase().includes(needle));
  $("#friend-results").innerHTML = members.length ? members.map((name, index) => `<button class="friend-result" data-friend="${escapeHTML(name)}"><i class="member-avatar avatar-${index % 4}">${escapeHTML(name.trim().charAt(0).toUpperCase() || "R")}</i><span><strong>${escapeHTML(name)}</strong><small>${name === state.profile.name ? "Your profile" : "Book club member"}</small></span><b>View profile ↗</b></button>`).join("") : `<div class="search-prompt">No club members match that search.</div>`;
}

function catalogBook(doc) {
  const sentence = Array.isArray(doc.first_sentence) ? doc.first_sentence.join(" ") : (doc.first_sentence || "");
  const coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(doc.cover_i)}-M.jpg?default=false` : "";
  return { id: String(doc.key || crypto.randomUUID()).replace(/^\//, ""), workKey: doc.key || "", title: doc.title || "Untitled", author: (doc.author_name || []).join(", ") || "Author not listed", isbn: cleanISBN((doc.isbn || [])[0]), coverUrl, description: String(sentence).replace(/\s+/g, " ").trim(), rating: doc.ratings_average || 0, ratingsCount: doc.ratings_count || 0 };
}
async function enrichCatalogBook(book) {
  if (!book.workKey) return book;
  try {
    const [workResponse, ratingResponse] = await Promise.all([
      fetch(`https://openlibrary.org${book.workKey}.json`),
      fetch(`https://openlibrary.org${book.workKey}/ratings.json`)
    ]);
    const [work, ratings] = await Promise.all([workResponse.ok ? workResponse.json() : {}, ratingResponse.ok ? ratingResponse.json() : {}]);
    const description = typeof work.description === "string" ? work.description : work.description?.value || book.description;
    return { ...book, description: String(description || book.description || "").replace(/\s+/g, " ").trim(), rating: ratings.summary?.average || book.rating, ratingsCount: ratings.summary?.count || book.ratingsCount };
  } catch { return book; }
}
async function searchBookCatalog(query, enrich = false) {
  const params = new URLSearchParams({ q: query, limit: "8", fields: "key,title,author_name,cover_i,isbn,ratings_average,ratings_count,first_sentence,first_publish_year" });
  const response = await fetch(`https://openlibrary.org/search.json?${params}`);
  if (!response.ok) throw new Error("Book search is unavailable right now.");
  const data = await response.json();
  const books = (data.docs || []).map(catalogBook);
  return enrich ? Promise.all(books.map(enrichCatalogBook)) : books;
}
function catalogMarkup(book, options = {}) {
  const action = options.action === undefined ? "catalog-add-book" : options.action;
  const cover = coverURL(book);
  const rating = book.rating ? `★ ${Number(book.rating).toFixed(1)} <small>(${Number(book.ratingsCount).toLocaleString()} ratings)</small>` : "No reader rating yet";
  return `<article class="catalog-result"><div class="catalog-cover">${cover ? `<img src="${escapeHTML(cover)}" alt="Cover of ${escapeHTML(book.title)}" loading="lazy" />` : `<span>${escapeHTML(book.title)}</span>`}</div><div class="catalog-info"><h3>${escapeHTML(book.title)}</h3><div class="catalog-author">${escapeHTML(book.author)}</div>${options.rating ? `<div class="catalog-rating">${rating}</div>` : ""}${options.description && book.description ? `<p>${escapeHTML(book.description.slice(0, 280))}${book.description.length > 280 ? "…" : ""}</p>` : ""}${action ? `<button type="button" class="catalog-action" data-${action}="${escapeHTML(book.id)}">${escapeHTML(options.label || "＋ Add to shelf")}</button>` : ""}</div></article>`;
}
async function runBookSearch(input, target, { rating = true, description = true, action = "catalog-add-book", label = "＋ Add to shelf" } = {}) {
  const query = input.value.trim();
  if (query.length < 2) { target.innerHTML = `<div class="search-prompt">Type at least two letters to search the book catalog.</div>`; return []; }
  target.innerHTML = `<div class="search-prompt">Searching the book catalog…</div>`;
  try {
    const books = await searchBookCatalog(query, rating || description);
    target.innerHTML = books.length ? books.map((book) => catalogMarkup(book, { rating, description, action, label })).join("") : `<div class="search-prompt">No books found. Try another title or author.</div>`;
    return books;
  } catch (error) {
    target.innerHTML = `<div class="search-prompt">${escapeHTML(error.message)} Check your connection and try again.</div>`; return [];
  }
}

function render() {
  applyShelfStyle();
  const readCount = state.chapters.filter((chapter) => chapter.read).length;
  const total = state.chapters.length;
  const percentage = total ? Math.round(readCount / total * 100) : 0;
  $("#book-title").textContent = state.book.title;
  $("#book-author").textContent = state.book.author;
  $("#book-description").textContent = state.book.description;
  $("#cover-title").innerHTML = escapeHTML(state.book.title).replace(/\s+/g, "<br />");
  $("#cover-author").textContent = state.book.author.toUpperCase();
  const currentCover = coverURL(state.book);
  $("#book-cover").style.backgroundImage = currentCover ? `url("${currentCover.replace(/["\\]/g, "")}")` : "";
  $("#book-cover").classList.toggle("real-book-cover", Boolean(currentCover));
  $("#chapter-total").textContent = `${total} ${total === 1 ? "chapter" : "chapters"}`;
  $("#progress-percent").textContent = `${percentage}%`;
  $("#progress-fill").style.width = `${percentage}%`;
  $("#progress-count").textContent = `${readCount} of ${total}`;
  const notesCount = state.notes.length;
  $("#note-count").textContent = notesCount;
  $("#notes-pill").textContent = `${notesCount} ${notesCount === 1 ? "note" : "notes"}`;

  renderShelf();
  renderClub();
  renderProfile();

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
  const form = $("#book-form"); form.elements.title.value = state.book.title; form.elements.author.value = state.book.author; form.elements.isbn.value = state.book.isbn || ""; form.elements.description.value = state.book.description; form.elements.chapters.value = state.chapters.length; $("#book-dialog").showModal();
}
$("#edit-book-open").addEventListener("click", openBookDialog);
$("#edit-book-inline").addEventListener("click", openBookDialog);
$("#book-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = event.currentTarget; const count = Number(form.elements.chapters.value);
  state.book = { ...state.book, title: form.elements.title.value.trim(), author: form.elements.author.value.trim(), isbn: cleanISBN(form.elements.isbn.value), description: form.elements.description.value.trim() };
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
    let finishedBook = false;
    if (chapter.read && state.chapters.length && state.chapters.every((item) => item.read)) {
      finishedBook = addShelfBook({ title: state.book.title, author: state.book.author, isbn: state.book.isbn, coverUrl: state.book.coverUrl, dateRead: new Date().toISOString().slice(0, 10), source: "current-read" });
    }
    save(); render(); showToast(finishedBook ? "Book finished and added to your bookshelf" : chapter.read ? "Chapter marked read · notes unlocked" : "Progress updated"); return;
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

$("#add-book-open").addEventListener("click", () => { $("#shelf-book-form").reset(); $("#add-book-dialog").showModal(); });
$("#shelf-book-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = event.currentTarget;
  const added = addShelfBook({ title: form.elements.title.value, author: form.elements.author.value, isbn: form.elements.isbn.value, dateRead: form.elements.dateRead.value });
  if (!added) { showToast("That book is already on your shelf"); return; }
  save(); render(); $("#add-book-dialog").close(); showToast("Added to your bookshelf");
});

function parseCSV(text) {
  const parseWithDelimiter = (delimiter) => {
    const rows = []; let row = []; let cell = ""; let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(cell); cell = ""; }
      else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
      } else cell += char;
    }
    row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
    return rows;
  };
  const candidates = [",", ";", "\t"].map(parseWithDelimiter);
  const headerScore = (rows) => (rows[0] || []).filter((value) => ["title", "author", "authors", "read status"].includes(normalizeHeader(value))).length;
  return candidates.sort((a, b) => headerScore(b) - headerScore(a) || (b[0]?.length || 0) - (a[0]?.length || 0))[0];
}
const normalizeHeader = (value) => String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function rowIsRead(getValue) {
  const dateRead = getValue(["date read", "last date read", "dates read", "date finished", "finished date", "completed at", "date completed", "read at", "read date"]);
  if (String(dateRead || "").trim()) return true;
  const shelf = getValue(["exclusive shelf", "shelf", "status", "reading status", "read status", "state"]);
  const shelves = getValue(["bookshelves", "shelves", "tags"]);
  const values = [shelf, shelves].filter(Boolean).join(",").toLowerCase().split(/[,;|]/).map((value) => value.trim().replace(/[_-]+/g, " "));
  const unread = /^(to read|want to read|tbr|unread|currently reading|reading|in progress|up next|dnf|did not finish|abandoned|paused)$/;
  return !values.some((value) => unread.test(value));
}
function importedBook(title, author, dateRead, getValue) {
  title = String(title || "").trim(); author = String(author || "").trim();
  if (!title || !rowIsRead(getValue)) return null;
  return { title, author, dateRead: String(dateRead || "").trim(), source: "import" };
}
function booksFromCSV(text) {
  const rows = parseCSV(text); if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const valueFor = (cells) => (aliases) => {
    const index = headers.findIndex((header) => aliases.map(normalizeHeader).includes(header));
    return index < 0 ? "" : (cells[index] || "");
  };
  const books = [];
  for (const cells of rows.slice(1)) {
    const getValue = valueFor(cells);
    const title = getValue(["title", "book title", "name", "book name"]);
    const author = getValue(["author", "authors", "book author", "primary author"]);
    const dateRead = getValue(["date read", "last date read", "dates read", "date finished", "finished date", "completed at", "date completed", "read at", "read date"]);
    const isbn = getValue(["isbn13", "isbn 13", "isbn", "isbn10", "isbn 10", "isbn uid"]);
    const coverUrl = getValue(["cover url", "cover image url", "image url", "cover", "image"]);
    const book = importedBook(title, author, dateRead, getValue); if (book) books.push({ ...book, isbn: cleanISBN(isbn), coverUrl: safeCoverUrl(coverUrl) });
  }
  return books;
}
function booksFromJSON(text) {
  const data = JSON.parse(text);
  let rows = Array.isArray(data) ? data : null;
  if (!rows && data && typeof data === "object") rows = [data.books, data.library, data.items, data.readingHistory, data.reading_history].find(Array.isArray);
  if (!rows) throw new Error("This JSON file does not contain a book list.");
  return rows.map((item) => {
    const fields = new Map(Object.entries(item || {}).map(([key, value]) => [normalizeHeader(key), value]));
    const getValue = (aliases) => { for (const alias of aliases) { const value = fields.get(normalizeHeader(alias)); if (value != null) return value; } return ""; };
    const title = getValue(["title", "book title", "name", "book name"]);
    const author = getValue(["author", "authors", "book author", "primary author"]);
    const dateRead = getValue(["date read", "last date read", "dates read", "date finished", "finished date", "completed at", "date completed", "read at", "read date"]);
    const isbn = getValue(["isbn13", "isbn 13", "isbn", "isbn10", "isbn 10", "isbn uid"]);
    const coverUrl = getValue(["cover url", "cover image url", "image url", "cover", "image"]);
    const book = importedBook(title, author, dateRead, getValue);
    return book ? { ...book, isbn: cleanISBN(isbn), coverUrl: safeCoverUrl(coverUrl) } : null;
  }).filter(Boolean);
}
function renderImportPreview() {
  const existing = new Set(state.books.map(normalizedBookKey));
  const unique = new Set(); let savedMatches = 0; let repeatedRows = 0;
  pendingBooks.forEach((book) => {
    const key = normalizedBookKey(book);
    if (existing.has(key)) savedMatches++;
    else if (unique.has(key)) repeatedRows++;
    else unique.add(key);
  });
  const additions = unique.size;
  const breakdown = [savedMatches && `${savedMatches} already saved`, repeatedRows && `${repeatedRows} repeated in the file`].filter(Boolean).join(" · ");
  $("#import-preview").textContent = additions
    ? `${additions} unique read ${additions === 1 ? "book" : "books"} ready to import${breakdown ? ` · ${breakdown}` : ""}. The file stays here; cover ISBNs are looked up with Open Library.`
    : pendingBooks.length
      ? `${pendingBooks.length} read-book rows found · ${savedMatches} already saved${repeatedRows ? ` · ${repeatedRows} repeated in the file` : ""}. Click “Rebuild rolling shelf” to refresh its display from this file.`
      : "No read books were recognized in this file. You can still rebuild the rolling shelf from books already saved in this browser.";
  $("#confirm-import").disabled = false;
  $("#confirm-import").textContent = additions > 0 ? "Import books" : "Rebuild rolling shelf";
}
$("#import-books-open").addEventListener("click", () => {
  pendingBooks = []; $("#import-form").reset(); $("#import-preview").textContent = "Your file is read in this browser, not uploaded. ISBN cover lookups go to Open Library."; $("#confirm-import").disabled = true; $("#import-dialog").showModal();
});
async function readImportFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8");
  return decoder.decode(bytes).replace(/^\uFEFF/, "");
}
$("#reading-file").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0]; if (!file) return;
  try {
    const text = await readImportFile(file);
    pendingBooks = /\.json$/i.test(file.name) ? booksFromJSON(text) : booksFromCSV(text);
    renderImportPreview();
  } catch (error) {
    pendingBooks = []; $("#import-preview").textContent = `Couldn’t read book rows from that file: ${error.message || "unsupported format"} You can still rebuild the rolling shelf from books already saved in this browser.`; $("#confirm-import").disabled = false; $("#confirm-import").textContent = "Rebuild rolling shelf";
  }
});
$("#confirm-import").addEventListener("click", (event) => {
  event.preventDefault(); let imported = 0; let refreshed = 0;
  for (const book of pendingBooks) { const result = addShelfBook(book, { refresh: true }); if (result === "added") imported++; else if (result === "updated") refreshed++; }
  save(); render(); renderShelf(true); $("#import-dialog").close();
  showToast(imported ? `${imported} ${imported === 1 ? "book" : "books"} added to your bookshelf` : `Rolling shelf refreshed · ${state.books.length} ${state.books.length === 1 ? "book" : "books"} saved`);
});
async function openBookDetails(book, context = "history") {
  activeShelfBook = book; activeBookContext = context;
  $("#shelf-detail-title").textContent = book.title;
  $("#shelf-detail-author").textContent = book.author ? `by ${book.author}` : "Author not listed";
  $("#shelf-detail-date").textContent = context === "history" ? `${book.dateRead ? `Finished ${book.dateRead}` : "Finished date not listed"}${book.isbn ? ` · ISBN ${book.isbn}` : ""}` : "On your profile shelf";
  $("#book-detail-description").textContent = book.description || "Looking for a blurb…";
  const cover = coverURL(book);
  $("#book-detail-cover").innerHTML = cover ? `<img src="${escapeHTML(cover)}" alt="Cover of ${escapeHTML(book.title)}" />` : `<span>${escapeHTML(book.title)}</span>`;
  $("#book-detail-rating").textContent = book.rating ? `★ ${Number(book.rating).toFixed(1)} · ${Number(book.ratingsCount || 0).toLocaleString()} reader ratings` : "Looking up reader ratings…";
  $("#remove-shelf-book").textContent = context === "profile" ? "Remove from profile shelf" : "Remove from shelf";
  $("#remove-shelf-book").hidden = context === "current";
  $("#book-cover-upload").value = "";
  $("#shelf-book-dialog").showModal();
  if (book.description && book.rating) return;
  try {
    const results = await searchBookCatalog(book.isbn ? `isbn:${book.isbn}` : `${book.title} ${book.author || ""}`, true);
    const title = (book.title || "").trim().toLocaleLowerCase();
    const match = results.find((item) => item.title.trim().toLocaleLowerCase() === title) || results[0];
    if (!match || activeShelfBook !== book || !$("#shelf-book-dialog").open) return;
    book.description = match.description || book.description || "No book blurb is available yet.";
    book.rating = match.rating || book.rating || 0;
    book.ratingsCount = match.ratingsCount || book.ratingsCount || 0;
    book.workKey = match.workKey || book.workKey || "";
    if (!book.coverUrl && match.coverUrl) book.coverUrl = match.coverUrl;
    $("#book-detail-description").textContent = book.description;
    $("#book-detail-rating").textContent = book.rating ? `★ ${Number(book.rating).toFixed(1)} · ${Number(book.ratingsCount || 0).toLocaleString()} reader ratings` : "No reader ratings found yet.";
    const foundCover = coverURL(book);
    if (foundCover) $("#book-detail-cover").innerHTML = `<img src="${escapeHTML(foundCover)}" alt="Cover of ${escapeHTML(book.title)}" />`;
    save(); renderShelf(); renderProfile();
  } catch {
    if (activeShelfBook === book && $("#shelf-book-dialog").open) {
      $("#book-detail-description").textContent = book.description || "A blurb could not be found right now.";
      $("#book-detail-rating").textContent = book.rating ? `★ ${Number(book.rating).toFixed(1)} · ${Number(book.ratingsCount || 0).toLocaleString()} reader ratings` : "Reader ratings could not be loaded.";
    }
  }
}
$("#bookshelf-books").addEventListener("click", (event) => {
  const button = event.target.closest("[data-shelf-book]"); if (!button) return;
  const book = state.books.find((item) => item.id === button.dataset.shelfBook); if (book) openBookDetails(book, "history");
});
$("#remove-shelf-book").addEventListener("click", () => {
  if (!activeShelfBook) return;
  if (activeBookContext === "profile") state.profileBooks = state.profileBooks.filter((book) => book !== activeShelfBook);
  else state.books = state.books.filter((book) => book !== activeShelfBook);
  activeShelfBook = null; save(); render(); $("#shelf-book-dialog").close(); showToast("Book removed from your shelf");
});
async function readCoverImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const imageUrl = URL.createObjectURL(file); const image = new Image(); image.src = imageUrl;
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 600;
    const scale = Math.max(400 / image.naturalWidth, 600 / image.naturalHeight); const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
    canvas.getContext("2d").drawImage(image, (400 - width) / 2, (600 - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally { URL.revokeObjectURL(imageUrl); }
}
$("#book-cover-upload").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0]; if (!file || !activeShelfBook) return;
  try {
    activeShelfBook.coverUrl = await readCoverImage(file);
    save(); renderShelf(true); renderProfile();
    $("#book-detail-cover").innerHTML = `<img src="${escapeHTML(activeShelfBook.coverUrl)}" alt="Uploaded cover of ${escapeHTML(activeShelfBook.title)}" />`;
    showToast("Book cover updated");
  } catch (error) { showToast(error.message || "Could not read that cover image"); }
});
$("#shelf-style-open").addEventListener("click", () => {
  $("#shelf-wood").value = state.shelfStyle.wood; $("#shelf-edge").value = state.shelfStyle.edge; $("#shelf-style-dialog").showModal();
});
$("#save-shelf-style").addEventListener("click", () => {
  state.shelfStyle = { wood: $("#shelf-wood").value, edge: $("#shelf-edge").value };
  applyShelfStyle(); save(); $("#shelf-style-dialog").close(); showToast("Shelf style saved");
});

$("#edit-club-open").addEventListener("click", () => {
  $("#club-name-input").value = state.club.name; $("#club-members-input").value = state.club.members.join("\n"); $("#club-dialog").showModal();
});
$("#edit-club-members").addEventListener("click", () => $("#edit-club-open").click());
function commitClubEdits() {
  const name = $("#club-name-input").value.trim();
  if (!name) { $("#club-name-input").focus(); showToast("Add a name for your book club"); return; }
  const previous = state.club;
  state.club = { name, members: [...new Set($("#club-members-input").value.split(/\r?\n/).map((member) => member.trim()).filter(Boolean))] };
  try { save(); } catch { state.club = previous; showToast("Couldn’t save changes in this browser"); return; }
  renderClub(); if (activePage === "discover") renderFriends($("#friend-search").value);
  $("#club-dialog").close(); showToast("Book club changes saved");
}
$("#save-club-changes").addEventListener("click", commitClubEdits);
$("#club-form").addEventListener("submit", (event) => { event.preventDefault(); commitClubEdits(); });
function fillQuoteBookOptions() {
  const select = $("#quote-book-select");
  select.innerHTML = `<option value="">Choose a read book</option>` + state.books.map((book) => {
    const label = `${book.title}${book.author ? ` — ${book.author}` : ""}`;
    return `<option value="${escapeHTML(label)}">${escapeHTML(label)}</option>`;
  }).join("");
  select.value = state.profile.quoteBook || "";
}
$("#edit-profile-open").addEventListener("click", () => {
  const form = $("#profile-name-form"); form.querySelector('[name="name"]').value = state.profile.name;
  form.querySelector('[name="quote"]').value = state.profile.quote || ""; fillQuoteBookOptions(); $("#profile-name-dialog").showModal();
});
$("#profile-name-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = event.currentTarget; const quote = form.querySelector('[name="quote"]').value.trim();
  if (quote && !form.querySelector('[name="quoteBook"]').value) { showToast("Choose the book that quote is from"); return; }
  state.profile.name = form.querySelector('[name="name"]').value.trim(); state.profile.quote = quote; state.profile.quoteBook = form.querySelector('[name="quoteBook"]').value;
  save(); renderProfile(); $("#profile-name-dialog").close(); showToast("Profile updated");
});

function selectedAvatarLook() { return { hat: $("#avatar-hat").value, pet: $("#avatar-pet").value, bookColor: $("#avatar-book-color").value }; }
$("#avatar-edit-open").addEventListener("click", () => {
  pendingAvatarLook = { ...state.profile.avatarLook }; pendingAvatarLookChanged = false;
  $("#avatar-hat").value = pendingAvatarLook.hat; $("#avatar-pet").value = pendingAvatarLook.pet; $("#avatar-book-color").value = pendingAvatarLook.bookColor;
  const usesGhostDrawing = !state.profile.avatar || ["ghost-reading.svg", "ghost-reading.png"].includes(state.profile.avatar);
  $("#avatar-preview").src = usesGhostDrawing ? ghostAvatarURL(pendingAvatarLook) : state.profile.avatar;
  $("#avatar-preview").classList.toggle("avatar-drawing", usesGhostDrawing);
  $("#avatar-dialog").showModal();
});
["#avatar-hat", "#avatar-pet", "#avatar-book-color"].forEach((selector) => $(selector).addEventListener("change", () => {
  pendingAvatarLook = selectedAvatarLook(); pendingAvatarLookChanged = true; $("#avatar-preview").src = ghostAvatarURL(pendingAvatarLook); $("#avatar-preview").classList.add("avatar-drawing");
}));
$("#avatar-done").addEventListener("click", () => {
  if (!pendingAvatarLookChanged) return;
  state.profile.avatarLook = pendingAvatarLook; state.profile.avatar = "ghost-reading.png"; save(); renderProfile();
});
$("#avatar-upload-open").addEventListener("click", () => $("#avatar-upload").click());
$("#avatar-reset").addEventListener("click", () => {
  state.profile.avatar = "ghost-reading.png"; pendingAvatarLook = { ...state.profile.avatarLook }; pendingAvatarLookChanged = false;
  save(); renderProfile(); $("#avatar-preview").src = ghostAvatarURL(pendingAvatarLook); showToast("Reading ghost restored");
});
$("#avatar-upload").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0]; if (!file) return;
  if (file.size > 4 * 1024 * 1024) { showToast("Please choose a file smaller than 4 MB"); event.currentTarget.value = ""; return; }
  try {
    let dataUrl;
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
      video.currentTime = Math.min(0.5, Math.max(0, video.duration / 2));
      await new Promise((resolve) => { video.onseeked = resolve; if (video.currentTime === 0) resolve(); });
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
      const scale = Math.max(512 / video.videoWidth, 512 / video.videoHeight); const width = video.videoWidth * scale; const height = video.videoHeight * scale;
      canvas.getContext("2d").drawImage(video, (512 - width) / 2, (512 - height) / 2, width, height); dataUrl = canvas.toDataURL("image/jpeg", 0.86); URL.revokeObjectURL(video.src);
    } else {
      const imageUrl = URL.createObjectURL(file); const image = new Image(); image.src = imageUrl;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
      const scale = Math.max(512 / image.naturalWidth, 512 / image.naturalHeight); const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
      canvas.getContext("2d").drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height); dataUrl = canvas.toDataURL("image/jpeg", 0.86); URL.revokeObjectURL(imageUrl);
    }
    state.profile.avatar = dataUrl; pendingAvatarLookChanged = false; save(); renderProfile(); $("#avatar-preview").src = dataUrl; $("#avatar-preview").classList.remove("avatar-drawing"); showToast("Avatar updated");
  } catch { showToast("Could not read that avatar file"); }
});

function renderHistoryChoices() {
  const choices = $("#history-book-choices");
  choices.innerHTML = state.books.length ? state.books.map((book) => {
    const selected = state.profileBooks.some((item) => normalizedBookKey(item) === normalizedBookKey(book));
    return `<button type="button" class="history-choice ${selected ? "selected" : ""}" data-history-profile-book="${escapeHTML(book.id)}">${selected ? "✓ " : "+ "}${escapeHTML(book.title)}<small>${escapeHTML(book.author || "")}</small></button>`;
  }).join("") : `<div class="search-prompt">Your reading history is empty. Search the catalog above to add favorites.</div>`;
}
function toggleProfileBook(book) {
  const key = normalizedBookKey(book); const existing = state.profileBooks.findIndex((item) => normalizedBookKey(item) === key);
  if (existing >= 0) state.profileBooks.splice(existing, 1);
  else if (state.profileBooks.length >= 9) { showToast("Your profile shelf has room for nine books"); return; }
  else state.profileBooks.push({ ...book, id: book.id || key });
  save(); renderProfile(); renderHistoryChoices();
}
$("#choose-profile-books").addEventListener("click", () => { $("#profile-catalog-search").value = ""; renderHistoryChoices(); $("#profile-books-dialog").showModal(); });
$("#profile-book-grid").addEventListener("click", (event) => { const button = event.target.closest("[data-profile-book]"); if (button) { const book = state.profileBooks.find((item) => String(item.id || normalizedBookKey(item)) === button.dataset.profileBook); if (book) openBookDetails(book, "profile"); } else if (event.target.closest("[data-open-book-picker]")) $("#choose-profile-books").click(); });
$("#profile-catalog-search").addEventListener("input", () => { clearTimeout(searchDelay); searchDelay = setTimeout(async () => { profileBookSearchResults = await runBookSearch($("#profile-catalog-search"), $("#profile-catalog-results"), { rating: false, description: false, action: "profile-catalog-book" }); }, 350); });
$("#history-book-choices").addEventListener("click", (event) => { const button = event.target.closest("[data-history-profile-book]"); if (!button) return; const book = state.books.find((item) => item.id === button.dataset.historyProfileBook); if (book) toggleProfileBook(book); });
$("#profile-catalog-results").addEventListener("click", (event) => { const button = event.target.closest("[data-profile-catalog-book]"); if (!button) return; const book = profileBookSearchResults.find((item) => item.id === button.dataset.profileCatalogBook); if (book) toggleProfileBook(book); });

$("#friend-search").addEventListener("input", (event) => renderFriends(event.currentTarget.value));
$("#friend-results").addEventListener("click", (event) => { const button = event.target.closest("[data-friend]"); if (!button) return; const name = button.dataset.friend; if (name === state.profile.name) setPage("profile"); else showToast(`${name}'s profile can be shared when the club has online profiles`); });
$("#discover-book-search").addEventListener("input", () => { clearTimeout(searchDelay); searchDelay = setTimeout(async () => { const input = $("#discover-book-search"); const target = $("#discover-book-results"); const books = await runBookSearch(input, target, { rating: true, description: true, action: false }); target.dataset.bookSearch = input.value.trim(); }, 350); });

$("#select-current-book").addEventListener("click", () => { $("#current-book-search-input").value = ""; $("#current-book-search-results").innerHTML = `<div class="search-prompt">Search the book catalog to choose a group read.</div>`; $("#current-book-search-dialog").showModal(); });
let currentBookResults = [];
$("#current-book-search-input").addEventListener("input", () => { clearTimeout(searchDelay); searchDelay = setTimeout(async () => { currentBookResults = await runBookSearch($("#current-book-search-input"), $("#current-book-search-results"), { rating: false, description: true, action: "set-current-book", label: "Choose as current read" }); }, 350); });
$("#current-book-search-results").addEventListener("click", (event) => {
  const button = event.target.closest("[data-set-current-book]"); if (!button) return;
  const book = currentBookResults.find((item) => item.id === button.dataset.setCurrentBook); if (!book) return;
  if ((state.notes.length || state.chapters.some((chapter) => chapter.read)) && !window.confirm("Changing the current book will clear this book’s chapter progress and notes. Continue?")) return;
  state.book = { title: book.title, author: book.author, description: book.description, isbn: book.isbn, coverUrl: book.coverUrl };
  state.chapters = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, title: `Chapter ${index + 1}`, read: false })); state.notes = [];
  save(); render(); $("#current-book-search-dialog").close(); showToast("Current book updated · reading progress reset");
});

$("#discover-book-results").addEventListener("click", (event) => {
  const button = event.target.closest("[data-catalog-add-book]"); if (!button) return;
  const result = button.closest(".catalog-result");
  const title = result.querySelector("h3")?.textContent || ""; const author = result.querySelector(".catalog-author")?.textContent || "";
  const cover = result.querySelector("img")?.src || "";
  if (!addShelfBook({ title, author, coverUrl: cover, source: "catalog" })) showToast("That book is already on your shelf");
  else { save(); render(); showToast("Added to your reading history"); }
});
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
render();
setPage("club");
if (recoveredBookCount) { save(); showToast(`${recoveredBookCount} saved books restored`); }
window.addEventListener("resize", () => renderShelf(true), { passive: true });