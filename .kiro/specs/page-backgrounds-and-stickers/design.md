# Design Document — page-backgrounds-and-stickers

## Overview

This document describes the technical design for four personalisation and expressiveness improvements to the **Estudio de Comisiones** React + Vite application:

1. **Per-page background images** with a full-featured editor (crop, resize, zoom, pan).
2. **Resizable sidebar** via a draggable handle that persists across sessions.
3. **Expanded emoji panel** with 500+ emojis, category tabs, and a search field.
4. **Telegram sticker panel** that integrates with the Telegram Bot API.

The application is a single-page React 18 app with no routing library; page switching is controlled by a simple `activePage` state in `App.jsx`. Shared configuration is stored in `localStorage` and managed by `src/store/appConfig.js`, which exposes a synchronous pub/sub store and applies CSS variables to the document root on every change. All four features integrate with this store and follow the existing file/component conventions.

---

## Architecture

### High-level component flow

```
App.jsx  (app-shell)
├── Sidebar.jsx  ◄──────────── + ResizeHandle (new)
│     drag → useResizableSidebar (new hook)
└── app-main
      ├── PageBackground applier  (usePageBackground, new hook)
      └── <ActivePage />
            ├── WorkflowBoard / KanbanBoard / ...
            └── EmojiReactions.jsx  (expanded)
                  ├── QuickBar (8 fixed emojis, unchanged)
                  ├── EmojiPicker.jsx  (new component)
                  └── StickerPanel.jsx  (new component)
```

### Data-flow for config store

```
setConfig / setConfigMulti
       │
   appConfig.js  (in-memory + localStorage)
       │
  subscribeConfig listeners
       │
  useConfig hook  →  every consumer re-renders
       │
  applyConfig()  →  CSS variables on :root / .app-shell
```

### Background resolution priority

```
activePage changes
       │
  usePageBackground(activePage)
       │
  sectionBgs[pageId] exists?
  ├── yes → apply sectionBgs[pageId].url as app-main background
  └── no  → globalBgUrl exists?
              ├── yes → apply globalBgUrl
              └── no  → clear background
```

---

## Components and Interfaces

### 1. `usePageBackground(pageId: string): void`

Custom hook. Reads `config.sectionBgs` and `config.globalBgUrl` reactively (via `useConfig`) and applies or clears a CSS custom property `--page-bg-url` on the `.app-main` element whenever either the active page or the stored backgrounds change.

```typescript
// Pseudotype
interface CropTransform {
  x: number        // left offset in original-image pixels
  y: number        // top offset
  scale: number    // zoom factor applied, 0.1 – 5.0
  width: number    // crop width in original-image pixels
  height: number   // crop height in original-image pixels
}

interface PageBackground {
  url: string          // base-64 data URL of the cropped image
  transform: CropTransform
}

// sectionBgs shape in appConfig
type SectionBgs = Record<string, PageBackground>
```

The hook sets `appMain.style.backgroundImage` directly (same pattern as the existing `applyConfig` logic for `globalBgUrl`).

### 2. `PageBackgroundEditor.jsx`

Modal component. Receives:

| Prop | Type | Description |
|---|---|---|
| `pageId` | `string` | Identifies which page's background to update |
| `initialBackground` | `PageBackground \| null` | Pre-loads existing transform |
| `onSave(bg: PageBackground)` | `function` | Called on confirm |
| `onClose()` | `function` | Called on cancel or backdrop click |

Internally maintains `editorState`:
```js
{
  imageDataUrl: string,
  canvasWidth: number,
  canvasHeight: number,
  transform: CropTransform,  // controlled by slider + drag
  cropBox: { x, y, w, h },  // draggable handles in canvas coords
}
```

The canvas renders via `requestAnimationFrame`. The output data URL is produced by an offscreen `<canvas>` using `drawImage` with the resolved crop rectangle. No third-party image library is introduced; all manipulation is done with the native Canvas 2D API, consistent with the project's zero-dependency philosophy.

**File size guard:** checked via `file.size > 10 * 1024 * 1024` before `FileReader.readAsDataURL`. Error state displayed inline.

### 3. `ResizeHandle.jsx`

Thin presentational component rendered at the right edge of `Sidebar.jsx`:

```jsx
<div
  className="sidebar-resize-handle"
  onMouseDown={onMouseDown}
  onDoubleClick={onDoubleClick}
  role="separator"
  aria-label="Ajustar ancho del sidebar"
  aria-orientation="vertical"
/>
```

CSS: `width: 8px; cursor: col-resize; position: absolute; right: 0; top: 0; height: 100%; z-index: 10`

### 4. `useResizableSidebar(): { width, handleMouseDown, handleDoubleClick }`

Custom hook that encapsulates the full resize interaction:

- Reads initial width from `getConfig().sidebarWidth` (default 230).
- On `mousedown` on the handle: attaches `mousemove` / `mouseup` to `window`, sets `document.body.style.userSelect = 'none'`.
- On `mousemove`: computes `newWidth = clamp(startWidth + (e.clientX - startX), 160, 480)`, writes directly to the CSS variable `document.documentElement.style.setProperty('--sidebar-w', newWidth + 'px')`.
- On `mouseup`: calls `setConfig('sidebarWidth', newWidth)` to persist; removes `userSelect`.
- On `doubleclick`: calls `setConfig('sidebarWidth', 230)` and applies `--sidebar-w = 230px`.
- Cleans up event listeners in `useEffect` return.
- On mobile (`window.innerWidth <= 768`): `handleMouseDown` is a no-op.

### 5. `EmojiPicker.jsx`

Standalone popover component. Props:

| Prop | Type | Description |
|---|---|---|
| `onSelect(emoji: string)` | `function` | Called when user clicks an emoji |
| `onClose()` | `function` | Called on outside click or Escape |
| `anchorRef` | `React.Ref` | Used to position the popover |

Internal state:
```js
{
  activeCategory: string,   // session state, not persisted
  searchText: string,
}
```

The emoji dataset is defined as a static module `src/data/emojis.js`:
```js
export const EMOJI_CATEGORIES = [
  { id: 'faces',      icon: '😀', label: 'Caritas y emociones',     emojis: [ /* ≥ 80 items */ ] },
  { id: 'gestures',   icon: '👋', label: 'Gestos y personas',        emojis: [ /* ≥ 80 items */ ] },
  { id: 'animals',    icon: '🐶', label: 'Animales y naturaleza',    emojis: [ /* ≥ 80 items */ ] },
  { id: 'food',       icon: '🍕', label: 'Comida y bebida',          emojis: [ /* ≥ 70 items */ ] },
  { id: 'activities', icon: '⚽', label: 'Actividades y deportes',   emojis: [ /* ≥ 60 items */ ] },
  { id: 'objects',    icon: '💡', label: 'Objetos y tecnología',     emojis: [ /* ≥ 70 items */ ] },
  { id: 'symbols',    icon: '❤️', label: 'Símbolos y señales',       emojis: [ /* ≥ 60 items */ ] },
]
// Each item: { emoji: string, name: string }  (name in Spanish for search)
// Total ≥ 500
```

Search is a synchronous `filter` call on the flat list with a `useDeferredValue` (React 18) to batch within the event loop, achieving the ≤ 300 ms responsiveness requirement without debounce timers.

The popover uses a `useClickOutside` hook (one `mousedown` listener on `document`, stops when the ref is inside). Keyboard navigation uses `onKeyDown` on the grid container with `useRef`-tracked focus index.

### 6. `StickerPanel.jsx`

Popover component. Props:

| Prop | Type | Description |
|---|---|---|
| `onSelect(sticker: StickerItem)` | `function` | Called when user clicks a sticker |
| `onClose()` | `function` | Called on outside click or Escape |
| `anchorRef` | `React.Ref` | Positioning reference |

```typescript
interface StickerItem {
  file_id: string
  file_unique_id: string
  thumb: {
    file_id: string
    width: number
    height: number
  }
  emoji?: string
}
```

State machine:
```
IDLE → (user adds set name + clicks Agregar) → LOADING
LOADING → (API success) → LOADED
LOADING → (API error / 404) → ERROR
LOADED → (user clicks tab) → LOADED (different set shown)
```

**API call logic (`fetchStickerSet`):**
1. Read `telegram_config` from `localStorage` via `getTelegramConfig()`.
2. If no token → set `missingToken = true`.
3. Determine base URL: check `navigator.onLine` and attempt `fetch('/proxy/telegram/getStickerSet?name=...')` first (proxy path). If proxy returns a non-network error, fall through to direct call `https://api.telegram.org/bot{token}/getStickerSet?name=...`.
4. Sticker thumbnails are displayed using the `file_id` resolved through `getFile` → `file_path` → `https://api.telegram.org/file/bot{token}/{file_path}`. Because Telegram's `getFile` only works server-side for large files, sticker preview images should use the `thumb` object provided in each sticker item directly (WebP format).

**Important**: The proxy `server.js` is configured for `taskade.com/api/v1` only. A second proxy path `/proxy/telegram` needs to be added to `server.js` that forwards to `https://api.telegram.org/bot{token}/`. The token is injected server-side from the request body or a header to avoid exposing it in the browser URL. Alternatively, the direct client-side call (already used by `telegram.js`) is used as the primary path since Telegram's Bot API does allow browser-direct calls; the proxy is optional.

---

## Data Models

### `appConfig.js` — additions to `DEFAULTS`

```js
const DEFAULTS = {
  // ... existing fields ...

  // Per-page backgrounds (Requirement 1)
  // sectionBgs already exists as {} — new shape: { [pageId]: { url: string, transform: CropTransform } }
  // No default value change needed; existing {} is correct.

  // Resizable sidebar (Requirement 2)
  sidebarWidth: 230,

  // Telegram sticker sets (Requirement 4)
  telegramStickerSets: [],
}
```

`CropTransform` is not stored in `appConfig` as its own top-level key; it lives nested inside each `sectionBgs[pageId].transform`.

### `EmojiReactions` reactions object

The existing shape `{ [emoji: string]: number }` is extended to also accept sticker entries:

```js
{
  // existing emoji reactions
  '👍': 1,
  '❤️': 2,

  // new sticker entries (keyed by file_unique_id)
  '__sticker__{file_unique_id}': {
    type: 'sticker',
    file_id: string,
    thumbUrl: string,
    count: number,
  }
}
```

The `EmojiReactions` display logic checks for keys prefixed with `__sticker__` to render sticker thumbnails instead of text emojis.

### `SettingsPage` tab additions

A fifth tab `{ id: 'pageBgs', label: '🖼 Fondos de página' }` is added to the existing `TABS` array. The tab renders a list of the five page entries:

```js
const PAGE_BG_ENTRIES = [
  { id: 'studio',    label: 'Estudio',     icon: '🔭' },
  { id: 'requests',  label: 'Solicitudes', icon: '📋' },
  { id: 'portfolio', label: 'Galería',     icon: '🖼' },
  { id: 'guide',     label: 'Guía',        icon: '📖' },
  { id: 'settings',  label: 'Configuración', icon: '⚙' },
]
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property Reflection:** After running prework, the following redundancies were identified and consolidated:

- Requirements 1.3 and 1.4 (priority logic) are merged into Property 1 (Background Resolution).
- Requirements 2.4, 2.6, 2.7, and 2.8 (clamp logic) are merged into Property 4 (Sidebar Clamp).
- Requirements 4.6 and 4.9 and 4.10 (sticker set display) are consolidated into Property 8 (Sticker Set Display).

---

### Property 1: Background resolution priority

*For any* page ID and any combination of `sectionBgs` and `globalBgUrl` values, the applied background URL on `app-main` should be: `sectionBgs[pageId].url` if it exists, else `globalBgUrl` if it exists, else no background.

**Validates: Requirements 1.2, 1.3, 1.4**

---

### Property 2: Config_Store sectionBgs round trip

*For any* page ID string and valid `PageBackground` object `{ url, transform }`, calling `setConfig('sectionBgs', { [pageId]: bg })` and then `getConfig().sectionBgs[pageId]` should return an object deeply equal to the original `bg`.

**Validates: Requirements 1.1, 1.12**

---

### Property 3: Page background removal

*For any* page ID that has an entry in `sectionBgs`, calling the remove operation should result in `getConfig().sectionBgs` not containing that page ID as a key.

**Validates: Requirements 1.14**

---

### Property 4: Sidebar width clamping

*For any* integer pixel value `v`, after a resize interaction that produces `v`, the value stored in `Config_Store` and applied to `--sidebar-w` should equal `Math.max(160, Math.min(480, v))`.

**Validates: Requirements 2.4, 2.6, 2.7, 2.8**

---

### Property 5: Emoji category filter

*For any* `Emoji_Category` selected in the `Emoji_Picker`, every emoji displayed in the grid should belong exclusively to that category.

**Validates: Requirements 3.6**

---

### Property 6: Emoji search filter correctness

*For any* non-empty search string `q`, all emojis returned by the search filter function should have a `name` field that contains `q` as a case-insensitive substring.

**Validates: Requirements 3.7**

---

### Property 7: Emoji click registers reaction

*For any* emoji `e` in the picker, clicking it should result in the reactions object having `e` as a key with a positive count, and the `Emoji_Picker` should be closed.

**Validates: Requirements 3.11**

---

### Property 8: Sticker set display completeness

*For any* valid mocked `getStickerSet` API response containing `N` stickers and a set `name`, after adding the set: (a) `telegramStickerSets` should contain `name`; (b) the `Sticker_Panel` should render exactly `N` sticker thumbnail elements; (c) there should be exactly one tab with the set's title.

**Validates: Requirements 4.6, 4.9, 4.10**

---

### Property 9: Sticker set removal from config

*For any* set name present in `telegramStickerSets`, after the user removes it, `getConfig().telegramStickerSets` should not contain that name.

**Validates: Requirements 4.13**

---

### Property 10: Sticker click inserts data

*For any* `StickerItem` displayed in the panel, clicking it should result in the active reactions/comment object containing an entry keyed by `'__sticker__' + sticker.file_unique_id` with the correct `file_id` and `thumbUrl`, and the panel should be closed.

**Validates: Requirements 4.11**

---

### Property 11: Emoji dataset completeness

*For any* snapshot of the `EMOJI_CATEGORIES` constant, the total count of all emojis across all categories should be ≥ 500, and all seven required category IDs (`faces`, `gestures`, `animals`, `food`, `activities`, `objects`, `symbols`) should be present with at least one emoji each.

**Validates: Requirements 3.1**

---

## Error Handling

### Requirement 1 — Background editor

| Scenario | Handling |
|---|---|
| File > 10 MB | Inline error message inside editor; `FileReader` call skipped. |
| Unsupported MIME type | Inline error: "Formato no soportado. Usa JPEG, PNG, WebP o GIF." |
| Canvas `drawImage` exception | Catch and show "Error al procesar la imagen. Inténtalo de nuevo." |
| `localStorage` quota exceeded when saving large data URL | Catch `QuotaExceededError` in `setConfig`; show toast "Imagen demasiado grande para guardar. Reduce el zoom o elige una imagen más pequeña." |

### Requirement 2 — Sidebar resize

| Scenario | Handling |
|---|---|
| `mousemove` fires after component unmount | `useEffect` cleanup removes listeners; guard with `mounted` ref. |
| `localStorage` write fails | Silently log to console; in-memory value is already correct so UX is unaffected. |

### Requirement 3 — Emoji picker

| Scenario | Handling |
|---|---|
| Search returns 0 results | Display "Sin resultados para «{text}»" in place of the grid. |
| Emoji dataset not imported | TypeScript/build error at compile time; no runtime fallback needed. |

### Requirement 4 — Sticker panel

| Scenario | Handling |
|---|---|
| No Telegram token in config | Show "Configura tu Bot Token de Telegram en Configuración → Solicitudes antes de usar stickers." |
| `getStickerSet` returns 404 / set not found | Show "No se encontró el set «{name}». Verifica el nombre e inténtalo de nuevo." |
| Network error / timeout | Show "Error de red al contactar Telegram. Comprueba tu conexión." |
| Proxy not available (`localhost:3001` unreachable) | Fall through to direct Telegram API call. |
| `localStorage` `telegramStickerSets` write fails | Log; config update is non-critical. |
| Sticker thumbnail URL returns 403 / broken | Show broken-image placeholder with sticker emoji character as fallback. |

---

## Testing Strategy

### Unit tests (example-based)

Use **Vitest** + **@testing-library/react** (already compatible with Vite; no configuration conflicts).

Key example tests:

- `SettingsPage` renders the "Fondos de página" tab and five page entries.
- `PageBackgroundEditor` rejects files > 10 MB with the correct error message.
- `PageBackgroundEditor` closes on confirm and calls `onSave` with the expected payload.
- `Sidebar` renders `ResizeHandle` with `aria-label` and `col-resize` cursor class.
- `useResizableSidebar` double-click resets width to 230.
- `EmojiReactions` renders 8 quick-access emojis and a "＋" button.
- `EmojiPicker` disappears when Escape is pressed.
- `StickerPanel` shows the "no token" message when `getTelegramConfig()` returns null.
- `StickerPanel` shows spinner during fetch and hides it after resolution.

### PBT test sketches

Use **fast-check** (the standard PBT library for JavaScript/TypeScript; well-maintained, compatible with Vitest via `fc.assert`).

Each test should run a minimum of **100 iterations** (`{ numRuns: 100 }`).

Tag format for each test: `// Feature: page-backgrounds-and-stickers, Property N: <property text>`

**Property 1 — Background resolution:**
```
fc.property(
  fc.string(),          // pageId
  fc.option(fc.string()), // sectionBgs entry url
  fc.option(fc.string()), // globalBgUrl
  (pageId, secBgUrl, globalUrl) => {
    // set up config, call resolveBackground(pageId, config)
    // assert: secBgUrl != null → result === secBgUrl
    //         else globalUrl != null → result === globalUrl
    //         else → result === null
  }
)
```

**Property 2 — Config_Store sectionBgs round trip:**
```
fc.property(
  fc.string({ minLength: 1 }),   // pageId
  fc.record({ url: fc.string(), transform: arbitraryCropTransform() }),
  (pageId, bg) => { setConfig...; return deepEqual(getConfig().sectionBgs[pageId], bg) }
)
```

**Property 4 — Sidebar clamp:**
```
fc.property(
  fc.integer({ min: -1000, max: 2000 }),
  (v) => {
    const result = clampSidebarWidth(v)
    return result >= 160 && result <= 480 && result === Math.max(160, Math.min(480, v))
  }
)
```

**Property 5 — Emoji category filter:**
```
fc.property(
  fc.constantFrom(...EMOJI_CATEGORIES.map(c => c.id)),
  (categoryId) => {
    const results = filterByCategory(EMOJI_CATEGORIES, categoryId)
    return results.every(e => e.categoryId === categoryId)
  }
)
```

**Property 6 — Emoji search filter:**
```
fc.property(
  fc.string({ minLength: 1, maxLength: 20 }),
  (q) => {
    const results = searchEmojis(ALL_EMOJIS, q)
    return results.every(e => e.name.toLowerCase().includes(q.toLowerCase()))
  }
)
```

**Properties 8, 9, 10, 11** use `fc.array` / `fc.record` generators over mock API response shapes and config state. Each isolates a pure data-transformation function extracted from the component for testability.

### Integration notes

- The Telegram API calls (`getStickerSet`, `getFile`) are **not** property-tested. Integration tests with 1–2 representative mocked `fetch` responses verify the correct endpoint, headers, and error branches.
- The `Page_Background_Editor` canvas rendering is tested with example-based snapshot/visual-regression tests only; canvas drawing is not amenable to PBT.
- No end-to-end (Playwright/Cypress) tests are prescribed by this spec; that is left to a separate test plan.

### File structure for new tests

```
src/
  __tests__/
    appConfig.property.test.js       // Properties 2, 3, 4
    backgroundResolution.property.test.js  // Property 1
    emojiPicker.property.test.js     // Properties 5, 6, 11
    emojiPicker.unit.test.jsx        // Example-based EmojiPicker tests
    stickerPanel.property.test.js    // Properties 8, 9, 10
    stickerPanel.unit.test.jsx       // Example-based StickerPanel tests
    pageBackgroundEditor.unit.test.jsx
    sidebar.unit.test.jsx
    useResizableSidebar.unit.test.js
```
