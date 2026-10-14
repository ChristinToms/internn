/* ==========================================================================
   BookNest — application logic
   Vanilla JS, no dependencies. Data lives in localStorage.
   ========================================================================== */
(() => {
  'use strict';

  const STORAGE_KEY = 'booknest.library.v1';
  const STATUS_LABELS = { 'to-read': 'To read', reading: 'Reading', finished: 'Finished' };
  const STATUSES = Object.keys(STATUS_LABELS);
  const DEFAULT_SPINES = ['Middlemarch', 'Persuasion', 'The Odyssey', 'Walden'];
  const COVER_PALETTE = [
    { bg: '#29483B' },
    { bg: '#47765D' },
    { bg: '#B27C42' },
    { bg: '#7D4E3A' },
    { bg: '#3E5566' },
    { bg: '#6B7048' },
    { bg: '#A9B9A4', ink: '#202820' },
    { bg: '#D8C9A8', ink: '#29483B' },
  ];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- State ---------- */
  const state = {
    books: [],      // the complete collection — never mutated by search/filter
    query: '',
    filter: 'all',
  };
  let storageNotice = '';

  /* ---------- Elements ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    header: $('#site-header'),
    form: $('#book-form'),
    title: $('#book-title'),
    author: $('#book-author'),
    titleError: $('#title-error'),
    authorError: $('#author-error'),
    formSuccess: $('#form-success'),
    addSection: $('#add'),
    search: $('#search-input'),
    searchClear: $('#search-clear'),
    filters: $('.filters'),
    grid: $('#book-grid'),
    libraryTitle: $('#library-title'),
    summary: $('#collection-summary'),
    empty: $('#empty-state'),
    emptyTitle: $('#empty-title'),
    emptyText: $('#empty-text'),
    emptyAction: $('#empty-action'),
    heroNote: $('#hero-note'),
    heroNoteText: $('#hero-note-text'),
    heroAddLabel: $('#hero-add-label'),
    meterCaption: $('#meter-caption'),
    toast: $('#toast'),
    dialog: $('#confirm-dialog'),
    dialogText: $('#dialog-text'),
  };

  /* ==========================================================================
     Storage
     ========================================================================== */
  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Normalize one stored record; returns null when it can't be salvaged. */
  function sanitizeBook(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const author = typeof raw.author === 'string' ? raw.author.trim() : '';
    if (!title || !author) return null;

    let createdAt = Number(raw.createdAt);
    if (!Number.isFinite(createdAt)) {
      const parsed = Date.parse(raw.createdAt);
      createdAt = Number.isFinite(parsed) ? parsed : 0;
    }

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
      title,
      author,
      status: STATUSES.includes(raw.status) ? raw.status : 'to-read',
      createdAt,
    };
  }

  function loadBooks() {
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      storageNotice = 'Browser storage is unavailable, so changes won’t be kept after you leave.';
      return [];
    }
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Library is not a list');
      const seen = new Set();
      return parsed
        .map(sanitizeBook)
        .filter(Boolean)
        .map((book) => {
          if (seen.has(book.id)) book.id = createId();
          seen.add(book.id);
          return book;
        });
    } catch (err) {
      // Keep the unreadable data aside rather than silently destroying it.
      try { window.localStorage.setItem(`${STORAGE_KEY}.backup`, raw); } catch (_) { /* ignore */ }
      storageNotice = 'Your saved library couldn’t be read, so we’ve started a fresh shelf.';
      return [];
    }
  }

  function saveBooks() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.books));
      return true;
    } catch (err) {
      showToast('This change couldn’t be saved in your browser.', true);
      return false;
    }
  }

  /* ==========================================================================
     Collection helpers (pure)
     ========================================================================== */
  const byNewest = (a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1);

  const normalize = (str) => str.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

  function matchesQuery(book, query) {
    if (!query) return true;
    return normalize(book.title).includes(query) || normalize(book.author).includes(query);
  }

  function countByStatus(books) {
    const counts = { all: books.length, 'to-read': 0, reading: 0, finished: 0 };
    books.forEach((b) => { counts[b.status] += 1; });
    return counts;
  }

  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const dateFormatterYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.getFullYear() === new Date().getFullYear() ? dateFormatter.format(d) : dateFormatterYear.format(d);
  }

  /* ==========================================================================
     Actions
     ========================================================================== */
  function addBook({ title, author, status }) {
    const newest = state.books.reduce((max, b) => Math.max(max, b.createdAt), 0);
    const book = {
      id: createId(),
      title,
      author,
      status: STATUSES.includes(status) ? status : 'to-read',
      // Strictly increasing so rapid additions keep a reliable order.
      createdAt: Math.max(Date.now(), newest + 1),
    };
    state.books.push(book);
    saveBooks();
    return book;
  }

  function updateStatus(id, status) {
    const book = state.books.find((b) => b.id === id);
    if (!book || !STATUSES.includes(status) || book.status === status) return null;
    book.status = status;
    saveBooks();
    return book;
  }

  function deleteBook(id) {
    const index = state.books.findIndex((b) => b.id === id);
    if (index === -1) return null;
    const [removed] = state.books.splice(index, 1);
    saveBooks();
    return removed;
  }

  /* ==========================================================================
     Rendering
     ========================================================================== */
  const previousStats = {};

  function renderStats() {
    const counts = countByStatus(state.books);
    const map = { total: counts.all, 'to-read': counts['to-read'], reading: counts.reading, finished: counts.finished };

    Object.entries(map).forEach(([key, value]) => {
      const el = $(`[data-stat="${key}"]`);
      if (!el) return;
      el.textContent = String(value);
      if (previousStats[key] !== undefined && previousStats[key] !== value) {
        el.classList.remove('is-bumped');
        void el.offsetWidth; // restart the animation
        el.classList.add('is-bumped');
      }
      previousStats[key] = value;
    });

    // Distribution meter
    const total = counts.all;
    ['finished', 'reading', 'to-read'].forEach((s) => {
      const seg = $(`[data-seg="${s}"]`);
      if (seg) seg.style.width = total ? `${(counts[s] / total) * 100}%` : '0%';
    });

    els.meterCaption.replaceChildren();
    if (!total) {
      els.meterCaption.textContent = 'Your shelf balance appears here once you add your first book.';
    } else {
      const pct = Math.round((counts.finished / total) * 100);
      const strong = document.createElement('strong');
      strong.textContent = `${pct}% finished`;
      els.meterCaption.append(
        strong,
        ` · ${counts.reading} in progress · ${counts['to-read']} waiting on the shelf`
      );
    }
  }

  function renderHero() {
    const counts = countByStatus(state.books);
    const has = counts.all > 0;
    els.heroAddLabel.textContent = has ? 'Add Another Book' : 'Add Your First Book';
    els.heroNote.classList.toggle('has-books', has);

    if (!has) {
      els.heroNoteText.textContent = 'No sign-up needed. Your library lives privately in this browser.';
    } else {
      const parts = [`${plural(counts.all, 'book')} on your shelves`];
      if (counts.reading) parts.push(`${counts.reading} in progress`);
      else if (counts.finished) parts.push(`${counts.finished} finished`);
      els.heroNoteText.textContent = parts.join(' · ');
    }

    // Spines show the reader's newest titles once they exist.
    const latest = [...state.books].sort(byNewest).slice(0, DEFAULT_SPINES.length);
    $$('[data-spine]').forEach((el) => {
      const i = Number(el.dataset.spine);
      el.textContent = latest[i] ? latest[i].title : DEFAULT_SPINES[i];
    });
  }

  function renderFilters(searchMatches) {
    const counts = countByStatus(searchMatches);
    $$('[data-count]').forEach((el) => { el.textContent = String(counts[el.dataset.count]); });
    $$('.filter', els.filters).forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === state.filter));
    });
  }

  function createIcon(pathD) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    return svg;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** Builds one card using DOM APIs only — user text is never parsed as HTML. */
  function createBookCard(book) {
    const li = el('li', 'book-card');
    li.dataset.id = book.id;

    const cover = el('div', 'book-cover');
    cover.setAttribute('aria-hidden', 'true');
    const palette = COVER_PALETTE[hashString(book.title + book.author) % COVER_PALETTE.length];
    cover.style.setProperty('--cover', palette.bg);
    if (palette.ink) cover.style.setProperty('--cover-ink', palette.ink);
    cover.append(el('span', 'cover-initial', Array.from(book.title)[0].toLocaleUpperCase()));

    const body = el('div', 'book-body');

    const meta = el('div', 'book-meta');
    meta.append(el('span', `badge badge--${book.status}`, STATUS_LABELS[book.status]));
    if (book.createdAt) {
      const time = el('time', 'book-date', `Added ${formatDate(book.createdAt)}`);
      time.dateTime = new Date(book.createdAt).toISOString();
      meta.append(time);
    }

    const title = el('h3', 'book-title', book.title);
    const author = el('p', 'book-author', `by ${book.author}`);

    const actions = el('div', 'book-actions');
    const selectId = `status-${book.id}`;
    const label = el('label', 'visually-hidden', `Reading status for ${book.title}`);
    label.htmlFor = selectId;

    const wrap = el('div', 'select-wrap');
    const select = el('select', 'status-select');
    select.id = selectId;
    select.dataset.id = book.id;
    STATUSES.forEach((s) => {
      const opt = el('option', '', STATUS_LABELS[s]);
      opt.value = s;
      opt.selected = s === book.status;
      select.append(opt);
    });
    wrap.append(select);

    const del = el('button', 'icon-btn');
    del.type = 'button';
    del.dataset.action = 'delete';
    del.dataset.id = book.id;
    del.setAttribute('aria-label', `Delete ${book.title}`);
    del.title = 'Delete book';
    del.append(createIcon('M4 6h12M8 6V4.5h4V6M6 6l.7 9.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L14 6M8.5 9v4.5M11.5 9v4.5'));

    actions.append(label, wrap, del);
    body.append(meta, title, author, actions);
    li.append(cover, body);
    return li;
  }

  function showEmpty(kind) {
    const copy = {
      library: {
        title: 'Your next favorite book starts here.',
        text: 'Add a book to begin building your personal reading collection.',
        action: 'Add Your First Book',
      },
      search: {
        title: 'No stories found.',
        text: 'Try another title or author, or clear your search.',
        action: 'Clear Search',
      },
      filter: {
        title: 'Nothing on this shelf just yet.',
        text: 'Books matching this reading status will appear here.',
        action: 'View All Books',
      },
    }[kind];

    els.empty.dataset.kind = kind;
    els.emptyTitle.textContent = copy.title;
    els.emptyText.textContent = copy.text;
    els.emptyAction.textContent = copy.action;
    els.empty.hidden = false;
  }

  function renderLibrary({ highlightId } = {}) {
    const sorted = [...state.books].sort(byNewest);
    const searchMatches = sorted.filter((b) => matchesQuery(b, state.query));
    const visible = state.filter === 'all' ? searchMatches : searchMatches.filter((b) => b.status === state.filter);

    renderFilters(searchMatches);

    const fragment = document.createDocumentFragment();
    visible.forEach((book) => {
      const card = createBookCard(book);
      if (book.id === highlightId && !prefersReducedMotion.matches) card.classList.add('is-new');
      fragment.append(card);
    });
    els.grid.replaceChildren(fragment);

    // Empty states
    if (visible.length) {
      els.empty.hidden = true;
    } else if (!state.books.length) {
      showEmpty('library');
    } else if (state.query && !searchMatches.length) {
      showEmpty('search');
    } else {
      showEmpty('filter');
    }

    // Collection summary
    els.summary.replaceChildren();
    const strong = el('strong', '', plural(state.books.length, 'book'));
    els.summary.append(strong);
    if (visible.length !== state.books.length && state.books.length) {
      els.summary.append(` · showing ${visible.length}`);
    } else if (state.books.length) {
      els.summary.append(' in your collection');
    }
  }

  function render(options) {
    renderStats();
    renderHero();
    renderLibrary(options);
  }

  /* ==========================================================================
     Feedback
     ========================================================================== */
  let toastTimer;
  function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle('is-error', isError);
    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), isError ? 5200 : 3200);
  }

  let successTimer;
  function flashFormSuccess(message) {
    window.clearTimeout(successTimer);
    els.formSuccess.textContent = message;
    els.formSuccess.classList.add('is-visible');
    successTimer = window.setTimeout(() => {
      els.formSuccess.classList.remove('is-visible');
      els.formSuccess.textContent = '';
    }, 3600);
  }

  const scrollBehavior = () => (prefersReducedMotion.matches ? 'auto' : 'smooth');

  /* ==========================================================================
     Form & validation
     ========================================================================== */
  function setFieldError(input, errorEl, message) {
    errorEl.textContent = message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const title = els.title.value.replace(/\s+/g, ' ').trim();
    const author = els.author.value.replace(/\s+/g, ' ').trim();
    const status = new FormData(els.form).get('status');

    setFieldError(els.title, els.titleError, title ? '' : 'Please enter a title.');
    setFieldError(els.author, els.authorError, author ? '' : 'Please enter an author.');

    if (!title || !author) {
      (!title ? els.title : els.author).focus();
      return;
    }

    const book = addBook({ title, author, status });

    // Make sure the reader can actually see what they just added.
    const hiddenByView = (state.filter !== 'all' && state.filter !== book.status) || !matchesQuery(book, state.query);
    if (hiddenByView) {
      state.filter = 'all';
      state.query = '';
      els.search.value = '';
      els.searchClear.hidden = true;
    }

    render({ highlightId: book.id });

    els.form.reset();
    els.title.focus();
    flashFormSuccess(`“${book.title}” is now on your shelf.`);
    showToast(`Added “${book.title}” to your library.`);
  }

  function clearErrorOnInput(input, errorEl) {
    input.addEventListener('input', () => {
      if (errorEl.textContent && input.value.trim()) setFieldError(input, errorEl, '');
    });
  }

  function goToAddForm() {
    els.addSection.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    els.title.focus({ preventScroll: true });
  }

  /* ==========================================================================
     Search & filters
     ========================================================================== */
  function setQuery(value) {
    state.query = normalize(value.trim());
    els.searchClear.hidden = value.length === 0;
    renderLibrary();
  }

  function clearSearch({ focus = true } = {}) {
    els.search.value = '';
    setQuery('');
    if (focus) els.search.focus();
  }

  /* ==========================================================================
     Delete confirmation
     ========================================================================== */
  function confirmDelete(book) {
    return new Promise((resolve) => {
      const dialog = els.dialog;
      if (!dialog || typeof dialog.showModal !== 'function') {
        resolve(window.confirm(`Remove “${book.title}” by ${book.author} from your library?`));
        return;
      }
      els.dialogText.replaceChildren(
        el('strong', '', `“${book.title}”`),
        ` by ${book.author} will be permanently removed from your library.`
      );
      dialog.returnValue = '';
      const onClose = () => {
        dialog.removeEventListener('close', onClose);
        resolve(dialog.returnValue === 'confirm');
      };
      dialog.addEventListener('close', onClose);
      dialog.showModal();
    });
  }

  /* ==========================================================================
     Event wiring — bound once; the grid uses delegation so re-renders
     never stack duplicate handlers.
     ========================================================================== */
  function bindEvents() {
    els.form.addEventListener('submit', handleSubmit);
    clearErrorOnInput(els.title, els.titleError);
    clearErrorOnInput(els.author, els.authorError);

    $$('[data-action="open-add"]').forEach((btn) => btn.addEventListener('click', goToAddForm));

    els.search.addEventListener('input', (e) => setQuery(e.target.value));
    els.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.search.value) {
        e.preventDefault();
        clearSearch();
      }
    });
    els.searchClear.addEventListener('click', () => clearSearch());

    els.filters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter');
      if (!btn || btn.dataset.filter === state.filter) return;
      state.filter = btn.dataset.filter;
      renderLibrary();
    });

    els.emptyAction.addEventListener('click', () => {
      const kind = els.empty.dataset.kind;
      if (kind === 'library') goToAddForm();
      else if (kind === 'search') clearSearch();
      else {
        state.filter = 'all';
        renderLibrary();
        $('.filter[data-filter="all"]').focus();
      }
    });

    // Status changes
    els.grid.addEventListener('change', (e) => {
      const select = e.target.closest('.status-select');
      if (!select) return;
      const book = updateStatus(select.dataset.id, select.value);
      if (!book) return;
      render();

      const stillVisible = document.getElementById(`status-${book.id}`);
      if (stillVisible) stillVisible.focus();
      else els.libraryTitle.focus({ preventScroll: true });
      showToast(`“${book.title}” moved to ${STATUS_LABELS[book.status]}.`);
    });

    // Delete
    els.grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="delete"]');
      if (!btn) return;
      e.stopPropagation();
      const id = btn.dataset.id;
      const book = state.books.find((b) => b.id === id);
      if (!book) return;

      const confirmed = await confirmDelete(book);
      if (!confirmed) {
        btn.focus();
        return;
      }

      // Find a sensible place for keyboard focus after the card disappears.
      const card = btn.closest('.book-card');
      const neighbour = card && (card.nextElementSibling || card.previousElementSibling);
      const neighbourId = neighbour && neighbour.dataset.id;

      deleteBook(id);
      render();

      const next = neighbourId && els.grid.querySelector(`[data-action="delete"][data-id="${CSS.escape(neighbourId)}"]`);
      if (next) next.focus();
      else els.libraryTitle.focus({ preventScroll: true });
      showToast(`Removed “${book.title}” from your library.`);
    });

    // Keep data in sync across tabs.
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      state.books = loadBooks();
      render();
    });

    // Header border on scroll
    const onScroll = () => els.header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* Highlight the nav link for the section in view. */
  function observeSections() {
    const links = $$('[data-nav]');
    if (!('IntersectionObserver' in window) || !links.length) return;
    const sections = links.map((l) => document.getElementById(l.dataset.nav)).filter(Boolean);
    const visibleSet = new Map();

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visibleSet.set(entry.target.id, entry.isIntersecting));
      const active = sections.find((s) => visibleSet.get(s.id));
      links.forEach((l) => {
        if (active && l.dataset.nav === active.id) l.setAttribute('aria-current', 'true');
        else l.removeAttribute('aria-current');
      });
    }, { rootMargin: '-35% 0px -55% 0px' });

    sections.forEach((s) => observer.observe(s));
  }

  /* ==========================================================================
     Init
     ========================================================================== */
  function init() {
    state.books = loadBooks();
    bindEvents();
    observeSections();
    render();
    if (storageNotice) showToast(storageNotice, true);
  }

  init();
})();
