(() => {
  'use strict';

  const api = globalThis.browser ?? globalThis.chrome;

  // Farben – müssen zu content.css passen
  const COLORS = [
    { id: 'r', name: 'Rot', hex: '#e5484d' },
    { id: 'o', name: 'Orange', hex: '#f08c2e' },
    { id: 'y', name: 'Gelb', hex: '#e6c229' },
    { id: 'g', name: 'Grün', hex: '#3fb950' },
    { id: 'b', name: 'Blau', hex: '#3b9eff' },
    { id: 'p', name: 'Lila', hex: '#b678f2' },
  ];
  const ERASER = 'x';

  // Jede Karte im Deck trägt diese Attribute – in allen Ansichten (Text, Grid, Stacks, Spoiler).
  const CARD_SEL = '[data-hash][data-row-key]';
  const NAME_SEL = '[data-testid="deck-view-table-row-name"]';

  let deckId = null;
  let marks = {};   // Kartenname -> Farb-IDs, z. B. "r" oder "rg" (Reihenfolge wie in COLORS)
  let labels = {};  // Farb-ID -> Bedeutung
  let pen = null;   // aktive Farbe, ERASER oder null
  let lastColor = 'r';
  let minimized = false;
  let namesByColor = {};
  let clearArmed = false;
  let clearTimer = 0;

  // ---------- Speicher ----------

  const storageKey = (id = deckId) => `deck:${id}`;

  async function loadDeck(id) {
    const key = storageKey(id);
    const got = await api.storage.local.get([key, 'ui']);
    if (id !== deckId) return; // inzwischen woanders hin navigiert
    marks = got[key]?.marks ?? {};
    labels = got[key]?.labels ?? {};
    lastColor = got.ui?.lastColor ?? 'r';
    minimized = got.ui?.minimized ?? false;
  }

  function saveDeck() {
    if (!deckId) return;
    const hasData = Object.keys(marks).length || Object.values(labels).some(Boolean);
    if (hasData) api.storage.local.set({ [storageKey()]: { marks, labels } });
    else api.storage.local.remove(storageKey());
  }

  const saveUi = () => api.storage.local.set({ ui: { lastColor, minimized } });

  // ---------- Karten ----------

  function cardName(el) {
    const raw =
      el.querySelector(NAME_SEL)?.textContent ||
      el.querySelector('img[alt]')?.alt ||
      el.querySelector('.decklist-card-phantomsearch')?.textContent ||
      '';
    // Doppelseitige Karten: nur Vorderseite, damit Text- und Bildansicht denselben Schlüssel liefern
    return raw.split(' // ')[0].replace(/\s+/g, ' ').trim();
  }

  const STYLE_PROPS = ['--mxm-stops', '--mxm-tint', '--mxm-first', '--mxm-last'];

  // Farbverlauf mit harten Kanten: jede Farbe bekommt einen gleich großen Abschnitt.
  const stops = (hexes, alpha = '') =>
    hexes.map((h, i) => `${h}${alpha} ${(i / hexes.length) * 100}% ${((i + 1) / hexes.length) * 100}%`).join(', ');

  function paint(el, ids) {
    const hexes = COLORS.filter((c) => ids.includes(c.id)).map((c) => c.hex);
    el.dataset.mxm = ids;
    el.style.setProperty('--mxm-stops', stops(hexes));
    el.style.setProperty('--mxm-tint', stops(hexes, '47'));
    el.style.setProperty('--mxm-first', hexes[0]);
    el.style.setProperty('--mxm-last', hexes.at(-1));
  }

  function unpaint(el) {
    el.removeAttribute('data-mxm');
    for (const p of STYLE_PROPS) el.style.removeProperty(p);
  }

  // Gespeicherten Wert auf bekannte Farben in fester Reihenfolge bringen
  const normalize = (value) =>
    typeof value === 'string' ? COLORS.filter((c) => value.includes(c.id)).map((c) => c.id).join('') : '';

  function apply() {
    namesByColor = {};
    const cards = document.querySelectorAll(CARD_SEL);
    for (const el of cards) {
      const name = cardName(el);
      const ids = name ? normalize(marks[name]) : '';
      if (ids) {
        if (el.dataset.mxm !== ids || !el.style.getPropertyValue('--mxm-stops')) paint(el, ids);
        for (const id of ids) (namesByColor[id] ??= new Set()).add(name);
      } else if (el.hasAttribute('data-mxm')) {
        unpaint(el);
      }
    }
    renderPanel(Boolean(deckId) && cards.length > 0);
  }

  function setPen(next) {
    pen = next;
    if (pen && pen !== ERASER) {
      lastColor = pen;
      saveUi();
    }
    const root = document.documentElement;
    root.classList.toggle('mxm-paint', Boolean(pen));
    const hex = COLORS.find((c) => c.id === pen)?.hex;
    if (hex) root.style.setProperty('--mxm-pen', hex);
    else root.style.removeProperty('--mxm-pen');
    renderPanel();
  }

  // Im Malmodus (oder mit Alt) markiert ein Klick die Karte, statt sie zu öffnen.
  document.addEventListener(
    'click',
    (e) => {
      if (!deckId || e.button !== 0) return;
      const color = pen ?? (e.altKey ? lastColor : null);
      if (!color) return;
      const el = e.target.closest?.(CARD_SEL);
      if (!el) return;
      // Das Karten-Menü (Pfeil / drei Punkte) bleibt benutzbar
      if (e.target.closest('[role="button"], button, .dropdown')) return;
      const name = cardName(el);
      if (!name) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Jede Farbe wird einzeln an- und abgeschaltet; der Radierer entfernt alle.
      const current = normalize(marks[name]);
      const next =
        color === ERASER ? '' : current.includes(color) ? current.replace(color, '') : normalize(current + color);
      if (next) marks[name] = next;
      else delete marks[name];
      saveDeck();
      apply();
    },
    true,
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pen) setPen(null);
  });

  // ---------- Panel ----------

  const ICONS = {
    eraser:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H9l-5-5a2 2 0 0 1 0-2.8l8.6-8.6a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L12 20"/><path d="m7.5 10.5 6 6"/></svg>',
    list:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    minus:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>',
    marker:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 6 6"/><path d="M4 20l3-1 12-12a2.1 2.1 0 0 0-3-3L4 16z"/></svg>',
    copy:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  };

  const PANEL_CSS = `
    :host { all: initial; position: fixed; left: 12px; bottom: 68px; z-index: 1040;
            font: 13px/1.3 system-ui, "Segoe UI", sans-serif; color: #e8e6ef; }
    :host([hidden]) { display: none; }
    * { box-sizing: border-box; }
    .box { background: #1d1b26; border: 1px solid #3a3650; border-radius: 12px;
           box-shadow: 0 6px 24px rgba(0,0,0,.4); padding: 6px; display: flex; flex-direction: column; gap: 6px; }
    .bar { display: flex; gap: 6px; align-items: center; }
    button { font: inherit; color: inherit; cursor: pointer; border: 0; padding: 0; background: none; }
    button:focus-visible, input:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .sw { width: 28px; height: 28px; border-radius: 50%; background: var(--c); color: #14121a;
          font-weight: 700; font-size: 12px; font-variant-numeric: tabular-nums; }
    .sw.on { box-shadow: 0 0 0 2px #1d1b26, 0 0 0 4px #fff; }
    .tool { width: 28px; height: 28px; border-radius: 8px; color: #b9b5c9; display: grid; place-items: center; }
    .tool:hover, .tool.on { background: #34304a; color: #fff; }
    .sep { width: 1px; height: 20px; background: #3a3650; }
    .hint { font-size: 12px; color: #b9b5c9; padding: 0 4px 2px; }
    .legend { display: flex; flex-direction: column; gap: 5px; padding: 4px 2px 6px; border-bottom: 1px solid #3a3650; }
    .row { display: flex; align-items: center; gap: 6px; }
    .dot { width: 14px; height: 14px; border-radius: 50%; background: var(--c); flex: none; }
    input { flex: 1; min-width: 0; width: 150px; font: inherit; color: inherit; background: #14121a;
            border: 1px solid #3a3650; border-radius: 6px; padding: 3px 6px; }
    input::placeholder { color: #6f6a85; }
    .cnt { width: 22px; text-align: right; color: #b9b5c9; font-variant-numeric: tabular-nums; }
    .copy { width: 24px; height: 24px; border-radius: 6px; color: #b9b5c9; display: grid; place-items: center; }
    .copy:hover { background: #34304a; color: #fff; }
    .copy:disabled { opacity: .3; cursor: default; background: none; }
    .tool:disabled { opacity: .3; cursor: default; background: none; color: #b9b5c9; }
    .tool.danger, .tool.danger:hover { background: #b3262d; color: #fff; }
    .hint.danger { color: #ff9ea2; }
    [hidden] { display: none !important; }
  `;

  const host = document.createElement('div');
  host.id = 'mxm-panel';
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${PANEL_CSS}</style>
    <div class="box" id="full">
      <div class="legend" id="legend" hidden>
        ${COLORS.map(
          (c) => `
        <div class="row" style="--c:${c.hex}">
          <span class="dot"></span>
          <input data-label="${c.id}" placeholder="${c.name} – Bedeutung" maxlength="40" aria-label="Bedeutung für ${c.name}">
          <span class="cnt" data-cnt="${c.id}">0</span>
          <button class="copy" data-copy="${c.id}" title="Kartennamen kopieren" aria-label="Kartennamen in ${c.name} kopieren">${ICONS.copy}</button>
        </div>`,
        ).join('')}
      </div>
      <div class="hint" id="hint" hidden></div>
      <div class="bar">
        ${COLORS.map(
          (c) => `<button class="sw" data-pen="${c.id}" style="--c:${c.hex}" aria-label="${c.name}"></button>`,
        ).join('')}
        <button class="tool" data-pen="${ERASER}" title="Radierer: Markierung entfernen" aria-label="Radierer">${ICONS.eraser}</button>
        <button class="tool" id="clear" title="Alle Markierungen in diesem Deck entfernen" aria-label="Alle Markierungen in diesem Deck entfernen">${ICONS.trash}</button>
        <span class="sep"></span>
        <button class="tool" id="toggle-legend" title="Legende" aria-label="Legende">${ICONS.list}</button>
        <button class="tool" id="minimize" title="Einklappen" aria-label="Einklappen">${ICONS.minus}</button>
      </div>
    </div>
    <div class="box" id="mini" hidden>
      <button class="tool" id="expand" title="Moxfield-Marker" aria-label="Moxfield-Marker öffnen">${ICONS.marker}</button>
    </div>
  `;
  const $ = (sel) => shadow.querySelector(sel);
  const $$ = (sel) => shadow.querySelectorAll(sel);

  function renderPanel(visible) {
    if (visible !== undefined) host.hidden = !visible;
    $('#full').hidden = minimized;
    $('#mini').hidden = !minimized;
    for (const b of $$('[data-pen]')) {
      const id = b.dataset.pen;
      b.classList.toggle('on', pen === id);
      if (id !== ERASER) {
        const color = COLORS.find((c) => c.id === id);
        b.textContent = namesByColor[id]?.size || '';
        b.title = labels[id] ? `${labels[id]} (${color.name})` : color.name;
      }
    }
    for (const c of COLORS) {
      const n = namesByColor[c.id]?.size ?? 0;
      $(`[data-cnt="${c.id}"]`).textContent = n;
      $(`[data-copy="${c.id}"]`).disabled = n === 0;
      const input = $(`[data-label="${c.id}"]`);
      if (shadow.activeElement !== input && input.value !== (labels[c.id] ?? '')) input.value = labels[c.id] ?? '';
    }
    const total = Object.keys(marks).length;
    const clear = $('#clear');
    clear.disabled = total === 0;
    clear.classList.toggle('danger', clearArmed);
    const hint = $('#hint');
    hint.hidden = !pen && !clearArmed;
    hint.classList.toggle('danger', clearArmed);
    if (clearArmed) {
      hint.textContent = `Alle ${total} Markierungen entfernen? Nochmal klicken`;
    } else if (pen) {
      hint.textContent =
        pen === ERASER ? 'Karten anklicken zum Entfernen · Esc beendet' : 'Karten anklicken zum Markieren · Esc beendet';
    }
  }

  shadow.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id !== 'clear') resetClear();

    if (btn.dataset.pen) {
      setPen(pen === btn.dataset.pen ? null : btn.dataset.pen);
    } else if (btn.id === 'toggle-legend') {
      const legend = $('#legend');
      legend.hidden = !legend.hidden;
      btn.classList.toggle('on', !legend.hidden);
    } else if (btn.id === 'minimize' || btn.id === 'expand') {
      minimized = btn.id === 'minimize';
      if (minimized) setPen(null);
      saveUi();
      renderPanel();
    } else if (btn.dataset.copy) {
      const names = [...(namesByColor[btn.dataset.copy] ?? [])].sort((a, b) => a.localeCompare(b));
      navigator.clipboard.writeText(names.map((n) => `1 ${n}`).join('\n')).then(() => {
        btn.innerHTML = ICONS.check;
        setTimeout(() => (btn.innerHTML = ICONS.copy), 1200);
      });
    } else if (btn.id === 'clear') {
      if (clearArmed) {
        marks = {};
        saveDeck();
        resetClear();
        apply();
      } else {
        clearArmed = true;
        clearTimer = setTimeout(resetClear, 4000);
        renderPanel();
      }
    }
  });

  function resetClear() {
    if (!clearArmed) return;
    clearArmed = false;
    clearTimeout(clearTimer);
    renderPanel();
  }

  shadow.addEventListener('input', (e) => {
    const id = e.target.dataset?.label;
    if (!id) return;
    labels[id] = e.target.value.trim();
    saveDeck();
    renderPanel();
  });

  // Tastendrücke im Panel nicht an Moxfields Shortcuts durchreichen
  for (const type of ['keydown', 'keyup', 'keypress']) {
    shadow.addEventListener(type, (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
  }

  document.documentElement.append(host);

  // ---------- Seite beobachten (Moxfield ist eine Single-Page-App) ----------

  async function checkRoute() {
    const id = location.pathname.match(/^\/decks\/([^/]+)/)?.[1] ?? null;
    if (id === deckId) return;
    deckId = id;
    marks = {};
    labels = {};
    if (pen) setPen(null);
    if (id) await loadDeck(id);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(async () => {
      scheduled = false;
      await checkRoute();
      apply();
    });
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);

  // Änderungen aus anderen Tabs übernehmen
  api.storage.onChanged.addListener((changes, area) => {
    // Nur im Hintergrund-Tab: im aktiven Tab würden die eigenen Schreibvorgänge schnelle Klicks überholen
    if (area !== 'local' || !deckId || !document.hidden) return;
    const change = changes[storageKey()];
    if (!change) return;
    marks = change.newValue?.marks ?? {};
    labels = change.newValue?.labels ?? {};
    apply();
  });

  schedule();
})();
