# The Reading Room

A small, visual-first reading nook for a book club. It includes Book Club, Profile, and Discover tabs; editable club details; a searchable current read; chapter-gated margin notes; a nine-book profile shelf; and a scrolling bookshelf for finished books.

## Run it

Open `index.html` in a modern browser, or serve the folder with any static web server. There are no build steps or dependencies.

## How chapter notes work

Each chapter unlocks notes once that chapter and every earlier chapter are marked read. Marking a chapter unread also clears read status on later chapters so the spoiler boundary stays in order. Notes beyond the current read boundary are hidden and become visible again when the reader catches up.

## Bookshelf and imports

Finished books can be added by hand, imported from Goodreads or StoryGraph CSV files, or imported from CSV/JSON files with compatible fields. Read/finished shelves, statuses, and completion dates are recognized; files without status or completion-date fields are treated as all finished. Re-importing an existing list refreshes the rolling shelf while preserving saved covers. Marking every chapter in the current book read adds it to the shelf automatically. Files are parsed in the browser and are not uploaded to a server.

The shelf looks up cover art by ISBN through the Open Library Covers API. Imported direct cover URLs are also supported. Add or import ISBNs for edition-specific artwork; a designed title card appears when no cover image is available. Cover requests send only the ISBN to Open Library.

## Profiles and book search

The profile tab has an editable display name, an optional quote attributed to a read book, and a customizable reading ghost with simple hats, pets, and book colors. Choose an image or video file to set a custom avatar; video uploads use a still frame. Pick up to nine profile books from your reading history or search Open Library. Discover searches Open Library for covers, average reader ratings, rating counts, and book descriptions. These searches require an internet connection.

Club name, roster, profile details, selected books, notes, and reading data remain in this browser's local storage. Discover can search the local club roster; separate members cannot yet publish or view one another's profile data. Online profiles and shared club updates need a backend.

## Current limits

This is a local prototype. Book details, progress, notes, and the bookshelf are saved in the current browser using local storage. Other club members do not yet see each other's notes, and data does not sync between devices. Shared accounts, shared storage, and member-specific spoiler boundaries will need a backend before the club uses this as a shared online space. Fable is not connected directly; import a Fable CSV/JSON file with book titles, authors, and read status or completion dates.

## Visual editing

Most of the visual system lives in `styles.css`; content and interactions live in `index.html` and `app.js`. The colors and type scale are defined as CSS variables at the top of the stylesheet.