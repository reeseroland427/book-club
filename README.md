# The Reading Room

A small, visual-first reading nook for a book club. This first version includes a current-book page, editable book and chapter details, reading progress, and chapter-gated margin notes.

## Run it

Open `index.html` in a modern browser, or serve the folder with any static web server. There are no build steps or dependencies.

## How chapter notes work

Each chapter unlocks notes once that chapter and every earlier chapter are marked read. Marking a chapter unread also clears read status on later chapters so the spoiler boundary stays in order. Notes beyond the current read boundary are hidden and become visible again when the reader catches up.

## Current limits

This is a local prototype. Book details, progress, and notes are saved in the current browser using local storage. Other club members do not yet see each other's notes, and data does not sync between devices. Shared accounts, shared storage, and member-specific spoiler boundaries will need a backend before the club uses this as a shared online space.

## Visual editing

Most of the visual system lives in `styles.css`; content and interactions live in `index.html` and `app.js`. The colors and type scale are defined as CSS variables at the top of the stylesheet.
