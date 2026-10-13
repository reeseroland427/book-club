const STORAGE_KEY = "reading-room-v1";
const starter = {
  book: { title: "The Paper Garden", author: "Your next favorite author", description: "A story for slow evenings, underlined sentences, and conversations that keep going after the last page.", isbn: "" },
  chapters: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `Chapter ${i + 1}`, read: false })),
  notes: [],
  books: []
};
let state;
try { state = { ...starter, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
catch { state = structuredClone(starter); }
state.book = { ...starter.book, ...(state.book || {}) };
state.books = Array.isArray(state.books) ? state.books : [];
let activeNoteChapter = null;
let activeShelfBook = null;
let pendingBooks = [];
let renderedShelfSignature = "";
let toastTimeout;
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

  renderShelf();

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
  state.book = { title: form.elements.title.value.trim(), author: form.elements.author.value.trim(), isbn: cleanISBN(form.elements.isbn.value), description: form.elements.description.value.trim() };
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
      finishedBook = addShelfBook({ title: state.book.title, author: state.book.author, isbn: state.book.isbn, dateRead: new Date().toISOString().slice(0, 10), source: "current-read" });
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
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
render();
window.addEventListener("resize", () => renderShelf(true), { passive: true });

