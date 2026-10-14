# BookNest

**Your next chapter starts here.**

BookNest is a personal reading companion. Add the books you own, want to read, or are reading now, give each one a status, and see your reading at a glance. It's designed like an editorial library: warm cream paper, deep forest green, Playfair Display headlines and Inter body text.

## Features

- Add books with a title, author, and reading status (To read / Reading / Finished), with inline validation
- A library sorted newest first, with CSS-drawn covers and status badges
- Live, case-insensitive search by title or author (accents are ignored too)
- Status filters that work together with search and show how many books match
- Change a book's status from its card; the change saves straight away
- Delete with an accessible confirmation dialog
- Reading statistics and a shelf-balance meter, always counted from the whole collection
- Friendly empty states for an empty library, a search with no results, and an empty shelf
- Everything saved in `localStorage`; works offline once loaded

## Technology

Plain HTML5, CSS3 and vanilla JavaScript. There is no framework, no build step and no backend. Google Fonts load from their CDN; if they can't load, the page falls back to system serif and sans-serif fonts.

| File | Purpose |
| --- | --- |
| `index.html` | Semantic page structure and static artwork |
| `style.css` | Design tokens, components, responsive and reduced-motion rules |
| `app.js` | State, storage, rendering, and interactions |
| `netlify.toml` | Static deploy config (publishes the repo root) |

## Running locally

Open `index.html` directly in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Deploying

The site is ready to deploy on Netlify as-is. `netlify.toml` publishes the project root, and there is no build command.
