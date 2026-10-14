# AGENTS.md — BookNest

## Architecture
BookNest is a static, single-page site made of three files and nothing else. **There is no build step, framework, or backend, and that is intentional.** The product brief asks for vanilla HTML/CSS/JS with browser Local Storage as the only persistence. Don't add bundlers, frameworks, or server storage unless the product owner asks for them.

- `index.html` — all markup. The hero "reading desk" artwork is pure CSS plus inline SVG and is `aria-hidden`.
- `style.css` — design tokens live in `:root`. Sections appear in page order: nav → hero → overview → add form → library → footer → toast → dialog, followed by the responsive breakpoints (1024 / 900 / 720 / 560 / 360) and reduced-motion rules.
- `app.js` — one IIFE, organized as: storage → pure helpers → actions (`addBook`, `updateStatus`, `deleteBook`) → render functions → feedback → event wiring → init.

## Data
- localStorage key: `booknest.library.v1`. The value is an array of `{ id, title, author, status, createdAt }`.
- `status` is one of `to-read | reading | finished`.
- `createdAt` is a ms timestamp. It always increases, so newest-first sorting stays reliable.
- If the stored JSON can't be read, it is copied to `booknest.library.v1.backup` and the app starts with an empty shelf. Individual records are sanitized on load.

## Conventions
- `state.books` is the full collection. Search and filter results are derived from it on each render and never written back.
- Statistics are always computed from `state.books`, never from the visible list.
- User text is inserted only with `textContent` and DOM APIs. Never use `innerHTML` with book data.
- Card events use **delegation** on `#book-grid`. Listeners are bound once in `bindEvents()`, so re-renders never add duplicate handlers.
- Small text uses `--muted-strong` (#5E625A) instead of `--muted` (#777A72) so it meets AA contrast. Status badges use darker "-ink" variants of the status colors for the same reason.
- Motion respects `prefers-reduced-motion` in both CSS and JS (`scrollBehavior()`).
