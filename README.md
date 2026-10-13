# The Reading Room

A small, visual-first reading nook for a book club. It includes a current-book page, editable book and chapter details, reading progress, chapter-gated margin notes, and a bookshelf for finished books.

## Run it

Open `index.html` in a modern browser, or serve the folder with any static web server. There are no build steps or dependencies.

## How chapter notes work

Each chapter unlocks notes once that chapter and every earlier chapter are marked read. Marking a chapter unread also clears read status on later chapters so the spoiler boundary stays in order. Notes beyond the current read boundary are hidden and become visible again when the reader catches up.

## Bookshelf and imports

Finished books can be added by hand, imported from Goodreads library CSV files, or imported from CSV/JSON files with Goodreads-compatible fields. Read/finished shelves and completion dates are recognized; files without status or completion-date fields are treated as all finished. Duplicate title/author pairs are skipped. Marking every chapter in the current book read adds it to the shelf automatically. Files are parsed in the browser and are not uploaded to a server.

The shelf looks up cover art by ISBN through the Open Library Covers API. Imported direct cover URLs are also supported. Add or import ISBNs for edition-specific artwork; a designed title card appears when no cover image is available. Cover requests send only the ISBN to Open Library.

## Current limits

This is a local prototype. Book details, progress, notes, and the bookshelf are saved in the current browser using local storage. Other club members do not yet see each other's notes, and data does not sync between devices. Shared accounts, shared storage, and member-specific spoiler boundaries will need a backend before the club uses this as a shared online space. Fable is not connected directly; import a Fable CSV/JSON file with book titles, authors, and read status or completion dates.

## Visual editing

Most of the visual system lives in `styles.css`; content and interactions live in `index.html` and `app.js`. The colors and type scale are defined as CSS variables at the top of the stylesheet.

