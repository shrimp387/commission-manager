# Implementation Plan: Page Backgrounds and Stickers

## Overview

Implement four personalisation features for the Estudio de Comisiones React + Vite app: per-page background images with a crop/zoom/pan editor, a resizable sidebar, an expanded emoji picker with categories and search, and a Telegram sticker panel. All features integrate with the existing `appConfig.js` store and follow the project's zero-dependency philosophy.

---

## Tasks

- [x] 1. Extend `appConfig.js` store defaults and update CSS variable application
  - Add `sidebarWidth: 230` and `telegramStickerSets: []` to the `DEFAULTS` object
  - Confirm `sectionBgs` default is `{}` (already exists) and document the new nested shape `{ [pageId]: { url, transform } }`
  - Ensure `applyConfig` writes `--sidebar-w` from `sidebarWidth` on every config change
  - _Requirements: 1.1, 2.1, 4.1_

- [x] 2. Implement emoji data module and pure filter/search utilities
  - [x] 2.1 Create `src/data/emojis.js` with `EMOJI_CATEGORIES` (≥ 500 emojis across 7 categories)
    - Each entry shape: `{ emoji: string, name: string }` with Spanish names
    - Categories: `faces`, `gestures`, `animals`, `food`, `activities`, `objects`, `symbols`
    - Export `ALL_EMOJIS` as a flat array derived from all categories (each item includes `categoryId`)
    - _Requirements: 3.1_

  - [ ]* 2.2 Write property test for emoji dataset completeness (Property 11)
    - **Property 11: Emoji dataset completeness**
    - **Validates: Requirements 3.1**
    - File: `src/__tests__/emojiPicker.property.test.js`
    - Assert total emoji count ≥ 500; all 7 category IDs present with ≥ 1 emoji each

  - [x] 2.3 Create `src/utils/emojiUtils.js` with pure functions `filterByCategory(categories, categoryId)` and `searchEmojis(allEmojis, query)`
    - `filterByCategory` returns all emojis where `categoryId` matches
    - `searchEmojis` performs case-insensitive substring match on `name`
    - _Requirements: 3.6, 3.7, 3.8_

  - [ ]* 2.4 Write property tests for emoji filter and search utilities (Properties 5, 6)
    - **Property 5: Emoji category filter** — every result belongs to the selected category
    - **Property 6: Emoji search filter correctness** — every result's `name` contains the query
    - **Validates: Requirements 3.6, 3.7**
    - File: `src/__tests__/emojiPicker.property.test.js`

- [x] 3. Build `EmojiPicker.jsx` component
  - [x] 3.1 Create `src/components/EmojiPicker.jsx` with category tabs, emoji grid and keyboard navigation
    - Props: `onSelect(emoji)`, `onClose()`, `anchorRef`
    - State: `activeCategory` (session-only), `searchText`
    - Render category tab bar (icons only) and emoji grid with ≥ 8 columns
    - On category tab click: update `activeCategory`, hide search results, show category grid
    - On emoji click: call `onSelect(emoji)` and `onClose()`
    - Keyboard: arrow keys move focus index, Enter selects, Escape calls `onClose()`
    - _Requirements: 3.4, 3.5, 3.6, 3.13, 3.14_

  - [x] 3.2 Add search field to `EmojiPicker.jsx`
    - Input at top of picker; on input change update `searchText` using `useDeferredValue`
    - When `searchText` non-empty: hide category bar, show filtered results from `searchEmojis`
    - When results are empty: show "Sin resultados para «{texto}»"
    - When `searchText` cleared: restore category bar and active category grid
    - _Requirements: 3.7, 3.8, 3.9, 3.10_

  - [x] 3.3 Implement `useClickOutside` hook and close-on-outside-click for `EmojiPicker.jsx`
    - Create `src/hooks/useClickOutside.js` that attaches a `mousedown` listener to `document`
    - Wire it into `EmojiPicker` to call `onClose()` when click is outside the picker ref
    - _Requirements: 3.12_

  - [ ]* 3.4 Write unit tests for `EmojiPicker.jsx`
    - Test: renders 8-column grid for selected category
    - Test: search field filters correctly and shows "Sin resultados" on empty results
    - Test: Escape key calls `onClose()`
    - Test: clicking outside calls `onClose()`
    - File: `src/__tests__/emojiPicker.unit.test.jsx`
    - _Requirements: 3.4, 3.7, 3.10, 3.12, 3.13_

- [x] 4. Integrate `EmojiPicker` into `EmojiReactions.jsx`
  - [x] 4.1 Add "＋" button to `EmojiReactions.jsx` that toggles `EmojiPicker` popover
    - Preserve existing 8 quick-access emoji row unchanged
    - On emoji select from picker: call existing reaction-add logic, add emoji to active row if not present, close picker
    - Handle partial failures (reaction API fail should not prevent adding to row or closing picker)
    - _Requirements: 3.2, 3.3, 3.11_

  - [ ]* 4.2 Write property test for emoji click registers reaction (Property 7)
    - **Property 7: Emoji click registers reaction**
    - **Validates: Requirements 3.11**
    - File: `src/__tests__/emojiPicker.property.test.js`

- [x] 5. Build `StickerPanel.jsx` component
  - [x] 5.1 Create `src/components/StickerPanel.jsx` with state machine (IDLE → LOADING → LOADED/ERROR)
    - Props: `onSelect(sticker)`, `onClose()`, `anchorRef`
    - On open: read `getTelegramConfig()` — if no token, show config-required message
    - Render "add set" input field + "Agregar" button
    - On add: set state to LOADING, show spinner, call `fetchStickerSet(name)`
    - On success: save name to `telegramStickerSets` config, render sticker grid (4 columns, 64×64 thumbnails)
    - On error: show "No se encontró el set «{name}»…" or network error message
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.12_

  - [x] 5.2 Add set tabs, removal, and sticker click handling to `StickerPanel.jsx`
    - Render one tab per entry in `telegramStickerSets`; switching tabs loads/displays that set's stickers
    - Render delete icon on each tab; on click remove name from `telegramStickerSets` config
    - On sticker click: insert `__sticker__{file_unique_id}` entry into reactions object with `file_id` and `thumbUrl`, call `onClose()`
    - Close on outside click (reuse `useClickOutside`) and on Escape key
    - Keyboard navigation: arrow keys, Enter, Escape
    - _Requirements: 4.9, 4.10, 4.11, 4.13, 4.14, 4.16_

  - [x] 5.3 Implement `fetchStickerSet` helper with proxy fallback in `StickerPanel.jsx` (or `src/api/telegram.js`)
    - Try `GET /proxy/telegram/getStickerSet?name={name}` first; fall back to direct `https://api.telegram.org/bot{token}/getStickerSet?name={name}`
    - Use sticker `thumb` object (WebP) directly for thumbnail URLs — no `getFile` call needed
    - _Requirements: 4.5, 4.15_

  - [ ]* 5.4 Write property tests for sticker panel data logic (Properties 8, 9, 10)
    - **Property 8: Sticker set display completeness** — after add, `telegramStickerSets` contains name, panel renders N thumbs, one tab exists
    - **Property 9: Sticker set removal from config** — after remove, name absent from `telegramStickerSets`
    - **Property 10: Sticker click inserts data** — clicking a sticker inserts `__sticker__{file_unique_id}` with correct `file_id` and `thumbUrl`
    - **Validates: Requirements 4.6, 4.9, 4.10, 4.11, 4.13**
    - File: `src/__tests__/stickerPanel.property.test.js`

  - [ ]* 5.5 Write unit tests for `StickerPanel.jsx`
    - Test: shows "no token" message when `getTelegramConfig()` returns null
    - Test: shows spinner during fetch, hides after resolution
    - Test: shows error message on failed API call
    - File: `src/__tests__/stickerPanel.unit.test.jsx`
    - _Requirements: 4.7, 4.8, 4.12_

- [x] 6. Integrate `StickerPanel` into `EmojiReactions.jsx`
  - Add sticker button (distinct from "＋") to `EmojiReactions` that toggles `StickerPanel`
  - Update `EmojiReactions` display logic to render `__sticker__`-prefixed keys as thumbnail images instead of text
  - _Requirements: 4.2_

- [ ] 7. Checkpoint — Emoji and sticker features complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement `useResizableSidebar` hook and `ResizeHandle.jsx`
  - [x] 8.1 Create `src/hooks/useResizableSidebar.js`
    - Read initial width from `getConfig().sidebarWidth` (default 230)
    - `handleMouseDown`: attach `mousemove`/`mouseup` to `window`; set `document.body.style.userSelect = 'none'`
    - `mousemove`: compute `clamp(startWidth + (e.clientX - startX), 160, 480)`, apply to `--sidebar-w` immediately
    - `mouseup`: call `setConfig('sidebarWidth', newWidth)`; restore `userSelect`; remove listeners
    - `handleDoubleClick`: reset to 230, call `setConfig('sidebarWidth', 230)`
    - On mobile (`window.innerWidth <= 768`): `handleMouseDown` is a no-op
    - Clean up listeners in `useEffect` return
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.11_

  - [ ]* 8.2 Write property test for sidebar width clamping (Property 4)
    - **Property 4: Sidebar width clamping**
    - **Validates: Requirements 2.4, 2.6, 2.7, 2.8**
    - File: `src/__tests__/appConfig.property.test.js`
    - Assert `clampSidebarWidth(v) === Math.max(160, Math.min(480, v))` for all integers in [-1000, 2000]

  - [x] 8.3 Create `src/components/ResizeHandle.jsx`
    - Thin presentational component: 8px wide, `cursor: col-resize`, `position: absolute; right: 0`
    - Props: `onMouseDown`, `onDoubleClick`
    - ARIA: `role="separator"`, `aria-label="Ajustar ancho del sidebar"`, `aria-orientation="vertical"`
    - Hidden on mobile via CSS media query (`@media (max-width: 768px) { display: none }`)
    - _Requirements: 2.3, 2.10, 2.11_

  - [ ]* 8.4 Write unit tests for sidebar resize
    - Test: `Sidebar` renders `ResizeHandle` with correct `aria-label` and cursor class
    - Test: `useResizableSidebar` double-click resets width to 230
    - File: `src/__tests__/sidebar.unit.test.jsx`, `src/__tests__/useResizableSidebar.unit.test.js`
    - _Requirements: 2.3, 2.9, 2.10_

- [x] 9. Integrate `ResizeHandle` and `useResizableSidebar` into `Sidebar.jsx`
  - Import and mount `ResizeHandle` at the right edge of `Sidebar.jsx`
  - Wire `handleMouseDown` and `handleDoubleClick` from `useResizableSidebar` to the handle
  - Ensure `App.jsx` reads `sidebarWidth` from config on init and sets `--sidebar-w` (via `applyConfig`)
  - _Requirements: 2.2, 2.3, 2.4_

- [ ] 10. Checkpoint — Sidebar resize feature complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement `usePageBackground` hook
  - [x] 11.1 Create `src/hooks/usePageBackground.js`
    - Subscribe to `sectionBgs` and `globalBgUrl` via `useConfig`
    - On change: resolve priority (`sectionBgs[pageId]?.url` → `globalBgUrl` → null)
    - Apply resolved URL to `.app-main` element via `element.style.backgroundImage`; clear if null
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ]* 11.2 Write property test for background resolution priority (Property 1)
    - **Property 1: Background resolution priority**
    - **Validates: Requirements 1.2, 1.3, 1.4**
    - File: `src/__tests__/backgroundResolution.property.test.js`
    - Use `fc.option(fc.string())` for both `sectionBgUrl` and `globalBgUrl`

- [x] 12. Implement `PageBackgroundEditor.jsx` modal component
  - [x] 12.1 Create `src/components/PageBackgroundEditor.jsx` with file input and Canvas 2D editor
    - Props: `pageId`, `initialBackground`, `onSave(bg)`, `onClose()`
    - File input: accept JPEG, PNG, WebP, GIF; reject > 10 MB with inline error message
    - Editor state: `imageDataUrl`, `transform` (`x`, `y`, `scale`, `cropBox`)
    - Render interactive canvas via `requestAnimationFrame`; crop handles draggable
    - Zoom: slider (0.1×–5×) and mouse wheel
    - Pan: mouse drag within crop area
    - Display output resolution in real time (updated during drag/zoom)
    - _Requirements: 1.7, 1.8, 1.9, 1.10, 1.11, 1.16_

  - [x] 12.2 Implement confirm and cancel actions in `PageBackgroundEditor.jsx`
    - On confirm: draw cropped region to offscreen canvas, export as data URL, call `setConfig` to save `sectionBgs[pageId]`, call `onSave(bg)`, call `onClose()`
    - Catch `QuotaExceededError` from `setConfig`; show toast "Imagen demasiado grande para guardar. Reduce el zoom o elige una imagen más pequeña."
    - On cancel / backdrop click: call `onClose()` without saving
    - _Requirements: 1.12, 1.13_

  - [ ]* 12.3 Write property tests for Config_Store sectionBgs round trip and removal (Properties 2, 3)
    - **Property 2: Config_Store sectionBgs round trip** — `setConfig` then `getConfig` returns deep-equal object
    - **Property 3: Page background removal** — after remove, key absent from `sectionBgs`
    - **Validates: Requirements 1.1, 1.12, 1.14**
    - File: `src/__tests__/appConfig.property.test.js`

  - [ ]* 12.4 Write unit tests for `PageBackgroundEditor.jsx`
    - Test: rejects files > 10 MB with correct error message
    - Test: closes and calls `onSave` with expected payload on confirm
    - Test: calls `onClose` without saving on cancel
    - File: `src/__tests__/pageBackgroundEditor.unit.test.jsx`
    - _Requirements: 1.7, 1.12, 1.13, 1.16_

- [x] 13. Add "Fondos de página" tab to `SettingsPage.jsx`
  - Append `{ id: 'pageBgs', label: '🖼 Fondos de página' }` to the existing `TABS` array
  - Define `PAGE_BG_ENTRIES` constant with the 5 page entries (studio, requests, portfolio, guide, settings)
  - Render a list showing thumbnail (max 200×120 px) of each page's current background, a "Cambiar fondo" button, and a "Quitar fondo" button
  - "Cambiar fondo" opens `PageBackgroundEditor` modal for that page ID
  - "Quitar fondo" calls `setConfigMulti` to delete `sectionBgs[pageId]` entry; page reverts to global/no background
  - _Requirements: 1.5, 1.6, 1.14, 1.15_

- [x] 14. Wire `usePageBackground` into `App.jsx`
  - Call `usePageBackground(activePage)` inside `App.jsx` so background updates whenever the active page changes or config changes
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 15. Final checkpoint — All features integrated and tested
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build
- All property-based tests use **fast-check** (`fc.assert`) with `{ numRuns: 100 }` and are tagged `// Feature: page-backgrounds-and-stickers, Property N: <text>`
- Telegram API calls are not property-tested; use 1–2 mocked `fetch` responses in unit tests
- Canvas rendering in `PageBackgroundEditor` uses example-based tests only (not PBT)
- All new components follow the project's zero-external-dependency philosophy (native Canvas 2D API, no image libraries)
- `useClickOutside` hook created in task 3.3 is reused by `StickerPanel` in task 5.2

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "8.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "8.2", "8.3", "11.1"] },
    { "id": 2, "tasks": ["2.4", "3.1", "8.4", "11.2"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.1", "8.4", "12.1"] },
    { "id": 4, "tasks": ["3.4", "4.2", "5.1", "9", "12.2"] },
    { "id": 5, "tasks": ["5.2", "5.3", "12.3", "12.4"] },
    { "id": 6, "tasks": ["5.4", "5.5", "6", "13", "14"] }
  ]
}
```
