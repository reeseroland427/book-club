const STORAGE_KEY = "reading-room-v1";
const starter = {
  book: { title: "The Paper Garden", author: "Your next favorite author", description: "A story for slow evenings, underlined sentences, and conversations that keep going after the last page.", isbn: "" },
  chapters: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `Chapter ${i + 1}`, read: false })),
  notes: [],
  books: [],
  club: { name: "The Reading Room", members: ["Reese", "Morgan"] },
  profile: { name: "Reader", avatar: "ghost-reading.svg" },
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
state.profileBooks = Array.isArray(state.profileBooks) ? state.profileBooks.slice(0, 9) : [];
let activeNoteChapter = null;
let activeShelfBook = null;
let pendingBooks = [];
let renderedShelfSignature = "";
let toastTimeout;
let searchDelay;
let activePage = "club";
let profileBookSearchResults = [];
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function showToast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("show"), 2200); }
function chapterNumber(id) { return state.chapters.findIndex((chapter) => chapter.id === id); }
function isUnlocked(id) { const index = chapterNumber(id); return index >= 0 && state.chapters.slice(0, index + 1).every((chapter) => chapter.read); }
function readableDate(value) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
function normalizedBookKey(book) { return `${(book.title || "").trim().toLocaleLowerCase()}|${(book.author || "").trim().toLocaleLowerCase()}`; }
function hasBook(book) { const key = normalizedBookKey(book); return state.books.some((saved) => normalizedBookKey(saved) === key); }
function addShelfBook(book) {
  if (!book.title?.trim() || hasBook(book)) return false;
  state.books.unshift({ id: crypto.randomUUID(), title: book.title.trim(), author: (book.author || "").trim(), dateRead: book.dateRead || "", isbn: cleanISBN(book.isbn), coverUrl: safeCoverUrl(book.coverUrl), source: book.source || "manual" });
  return true;
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
  const direct = safeCoverUrl(book.coverUrl); if (direct) return direct;
  const isbn = cleanISBN(book.isbn); return isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false` : "";
}

function renderShelf(force = false) {
  const books = state.books || [];
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
  track.style.setProperty("--shelf-duration", `${Math.max(40, setWidth / 8)}s`);
  track.style.animation = "shelf-loop var(--shelf-duration) linear infinite";
  track.querySelectorAll(".shelf-cover-image").forEach((image) => image.addEventListener("error", () => image.remove(), { once: true }));
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
  $("#profile-avatar").src = state.profile.avatar || "ghost-reading.svg";
  $("#profile-book-count").textContent = `${state.profileBooks.length} of 9 selected`;
  $("#profile-book-grid").innerHTML = Array.from({ length: 9 }, (_, index) => {
    const book = state.profileBooks[index];
    const cover = book ? coverURL(book) : "";
    return `<div class="profile-shelf-slot">${book ? `<button class="profile-book-cover" data-remove-profile-book="${escapeHTML(book.id || normalizedBookKey(book))}" title="Remove ${escapeHTML(book.title)}" aria-label="Remove ${escapeHTML(book.title)} from favorites">${cover ? `<img src="${escapeHTML(cover)}" alt="Cover of ${escapeHTML(book.title)}" loading="lazy" />` : `<span class="profile-cover-fallback">${escapeHTML(book.title)}</span>`}</button><span class="profile-book-caption">${escapeHTML(book.title)}</span>` : `<button class="profile-book-empty" data-open-book-picker aria-label="Choose a book for shelf slot ${index + 1}"><span>＋</span><small>Choose a book</small></button>`}</div>`;
  }).join("");
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
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
const normalizeHeader = (value) => String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function rowIsRead(getValue) {
  const dateRead = getValue(["date read", "date finished", "finished date", "completed at", "date completed", "read at", "read date"]);
  if (String(dateRead || "").trim()) return true;
  const shelf = getValue(["exclusive shelf", "shelf", "status", "reading status", "read status", "state"]);
  const shelves = getValue(["bookshelves", "shelves", "tags"]);
  const values = [shelf, shelves].filter(Boolean).join(",").toLowerCase().split(/[,;|]/).map((value) => value.trim().replace(/[_-]+/g, " "));
  if (values.some((value) => /^(read|finished|complete|completed|done|read book)$/.test(value))) return true;
  const hasStatus = Boolean(shelf || shelves);
  return !hasStatus;
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
    const dateRead = getValue(["date read", "date finished", "finished date", "completed at", "date completed", "read at", "read date"]);
    const isbn = getValue(["isbn13", "isbn 13", "isbn", "isbn10", "isbn 10"]);
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
    const dateRead = getValue(["date read", "date finished", "finished date", "completed at", "date completed", "read at", "read date"]);
    const isbn = getValue(["isbn13", "isbn 13", "isbn", "isbn10", "isbn 10"]);
    const coverUrl = getValue(["cover url", "cover image url", "image url", "cover", "image"]);
    const book = importedBook(title, author, dateRead, getValue);
    return book ? { ...book, isbn: cleanISBN(isbn), coverUrl: safeCoverUrl(coverUrl) } : null;
  }).filter(Boolean);
}
function renderImportPreview() {
  const existing = new Set(state.books.map(normalizedBookKey));
  const unique = new Set(); let duplicates = 0;
  pendingBooks.forEach((book) => { const key = normalizedBookKey(book); if (existing.has(key) || unique.has(key)) duplicates++; else unique.add(key); });
  const additions = unique.size;
  $("#import-preview").textContent = additions ? `${additions} read ${additions === 1 ? "book" : "books"} ready to import${duplicates ? ` · ${duplicates} duplicate${duplicates === 1 ? "" : "s"} will be skipped` : ""}. The file stays here; cover ISBNs are looked up with Open Library.` : "No new read books found. Check that the file has title and author columns and a read shelf, status, or finished date.";
  $("#confirm-import").disabled = additions === 0;
}
$("#import-books-open").addEventListener("click", () => {
  pendingBooks = []; $("#import-form").reset(); $("#import-preview").textContent = "Your file is read in this browser, not uploaded. ISBN cover lookups go to Open Library."; $("#confirm-import").disabled = true; $("#import-dialog").showModal();
});
$("#reading-file").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0]; if (!file) return;
  try {
    const text = await file.text();
    pendingBooks = /\.json$/i.test(file.name) ? booksFromJSON(text) : booksFromCSV(text);
    renderImportPreview();
  } catch (error) {
    pendingBooks = []; $("#import-preview").textContent = `Couldn’t read that file: ${error.message || "unsupported format"}`; $("#confirm-import").disabled = true;
  }
});
$("#import-form").addEventListener("submit", (event) => {
  event.preventDefault(); let imported = 0;
  for (const book of pendingBooks) if (addShelfBook(book)) imported++;
  save(); render(); $("#import-dialog").close(); showToast(`${imported} ${imported === 1 ? "book" : "books"} added to your bookshelf`);
});
$("#bookshelf-books").addEventListener("click", (event) => {
  const button = event.target.closest("[data-shelf-book]"); if (!button) return;
  activeShelfBook = state.books.find((book) => book.id === button.dataset.shelfBook); if (!activeShelfBook) return;
  $("#shelf-detail-title").textContent = activeShelfBook.title;
  $("#shelf-detail-author").textContent = activeShelfBook.author ? `by ${activeShelfBook.author}` : "Author not listed";
  $("#shelf-detail-date").textContent = `${activeShelfBook.dateRead ? `Finished ${activeShelfBook.dateRead}` : "Finished date not listed"}${activeShelfBook.isbn ? ` · ISBN ${activeShelfBook.isbn}` : ""}`;
  $("#shelf-book-dialog").showModal();
});
$("#remove-shelf-book").addEventListener("click", () => {
  if (!activeShelfBook) return;
  state.books = state.books.filter((book) => book.id !== activeShelfBook.id); activeShelfBook = null; save(); render(); $("#shelf-book-dialog").close(); showToast("Book removed from your shelf");
});

$("#edit-club-open").addEventListener("click", () => {
  const form = $("#club-form"); form.elements.name.value = state.club.name; form.elements.members.value = state.club.members.join("\n"); $("#club-dialog").showModal();
});
$("#edit-club-members").addEventListener("click", () => $("#edit-club-open").click());
$("#club-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = event.currentTarget;
  state.club = { name: form.elements.name.value.trim(), members: [...new Set(form.elements.members.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))] };
  save(); render(); $("#club-dialog").close(); showToast("Book club updated");
});
$("#edit-profile-open").addEventListener("click", () => { const form = $("#profile-name-form"); form.elements.name.value = state.profile.name; $("#profile-name-dialog").showModal(); });
$("#profile-name-form").addEventListener("submit", (event) => { event.preventDefault(); state.profile.name = event.currentTarget.elements.name.value.trim(); save(); renderProfile(); $("#profile-name-dialog").close(); showToast("Profile name updated"); });
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
    state.profile.avatar = dataUrl; save(); renderProfile(); showToast("Avatar updated");
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
$("#profile-book-grid").addEventListener("click", (event) => { if (event.target.closest("[data-remove-profile-book]")) { const key = event.target.closest("[data-remove-profile-book]").dataset.removeProfileBook; const book = state.profileBooks.find((item) => String(item.id || normalizedBookKey(item)) === key); if (book) toggleProfileBook(book); } else if (event.target.closest("[data-open-book-picker]")) $("#choose-profile-books").click(); });
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
window.addEventListener("resize", () => renderShelf(true), { passive: true });

