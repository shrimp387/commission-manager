# Implementation Plan: Studio Commission Bugs

## Overview

Five bugs in the Studio de Comisiones (React + Vite, Taskade REST API) app are fixed using the bug condition methodology. The bugs span the API layer (serialization error on `createTask`/`deleteTask`), the state persistence layer (view mode and page header collapse not surviving navigation), the UX interaction layer (placeholder sidebar buttons calling `alert()`), and a feature gap (no custom Kanban columns). Each bug is addressed with targeted, minimal changes. The workflow follows the exploratory bugfix order: exploration tests first (on unfixed code), preservation tests second (on unfixed code), then implementation, then validation.

---

## Tasks

<!-- ═══════════════════════════════════════════════════════════════
     PHASE 1 — BUG CONDITION EXPLORATION TESTS (run on UNFIXED code)
     ═══════════════════════════════════════════════════════════════ -->

- [x] 1. Write bug condition exploration tests (ALL bugs — run on UNFIXED code)
  - **Property 1: Bug Condition** - API Serialization Error on createTask / deleteTask
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate all five bugs exist simultaneously
  - **Scoped PBT Approach**: For deterministic bugs (2, 3, 4), scope property to the concrete failing case; for non-deterministic bugs (1, 5) generate varied inputs

  **Bug 1 — API Serialization:**
  - Mock `fetch` so the proxy returns `{ ok: true, items: [] }` (a successful createTask response)
  - Assert `createTask("Test comisión")` resolves without throwing
  - **EXPECTED OUTCOME on unfixed code**: FAILS — throws `"Failed to serialize…"` or similar
  - Mock `fetch` so proxy returns `{ ok: true }` (a successful deleteTask response)
  - Assert `deleteTask("abc-123")` resolves without throwing
  - **EXPECTED OUTCOME on unfixed code**: FAILS — same serialization error
  - Mock proxy error handler response `{ ok: false, message: "ECONNREFUSED" }` (missing `statusMessage`)
  - Assert thrown error message is `"ECONNREFUSED"` (not `undefined`)
  - **EXPECTED OUTCOME on unfixed code**: FAILS — throws `undefined` because `request()` reads `data.message` but error path uses `data.statusMessage`
  - Mock `{ ok: false, statusMessage: "Not found" }` (Taskade API error shape)
  - Assert thrown error message is `"Not found"`
  - **EXPECTED OUTCOME on unfixed code**: FAILS — throws `undefined` because `request()` reads `data.message` not `data.statusMessage`
  - Document counterexamples: `createTask("X")` throws serialization error; error messages always `undefined`

  **Bug 2 — View Mode Reset:**
  - Mount `StudioPage`, switch view to `'board'`, unmount, remount
  - Assert initial `view` after remount equals `'board'` (reads from `localStorage`)
  - **EXPECTED OUTCOME on unfixed code**: FAILS — view resets to `'list'` (ephemeral `useState`)
  - Check `localStorage.getItem('studio_view_mode')` after switching view
  - Assert it is `'board'` (not `null`)
  - **EXPECTED OUTCOME on unfixed code**: FAILS — value is `null` (no persistence)

  **Bug 3 — No Collapse Toggle:**
  - Render `StudioPage` and query for a button with `aria-label` containing "colapsar" / "expandir"
  - Assert the collapse toggle exists in the DOM
  - **EXPECTED OUTCOME on unfixed code**: FAILS — no such element exists

  **Bug 4 — Placeholder Alert:**
  - Render `Sidebar`, spy on `window.alert`, click "Agentes de IA" button
  - Assert `window.alert` WAS called (demonstrates broken current behavior)
  - Assert NO slide-in panel element with class `proximamente-panel` is rendered
  - **EXPECTED OUTCOME on unfixed code**: `alert` IS called AND panel does NOT exist — confirms bug

  **Bug 5 — No Custom Kanban Sections:**
  - Render `KanbanBoard` with `sections={[]}` (board view)
  - Assert a button with text matching "Nueva sección" exists
  - **EXPECTED OUTCOME on unfixed code**: FAILS — no such button
  - Check `localStorage.getItem('kanban_custom_sections')` — assert `null`

  - Mark task complete when all tests are written, run, and failures are documented
  - _Requirements: Bug 1 — 1.1, 1.2, 1.3, 1.4; Bug 2 — 1.1, 1.2; Bug 3 — 1.1, 1.2; Bug 4 — 1.1, 1.2; Bug 5 — 1.1, 1.2, 1.3_

<!-- ═══════════════════════════════════════════════════════════════
     PHASE 2 — PRESERVATION TESTS (run on UNFIXED code to capture baseline)
     ═══════════════════════════════════════════════════════════════ -->

- [x] 2. Write preservation property tests (BEFORE implementing any fix)
  - **Property 2: Preservation** - Baseline behavior for all non-buggy inputs across all five bugs
  - **IMPORTANT**: Follow the observation-first methodology — run on UNFIXED code, record outputs, encode as tests
  - **EXPECTED OUTCOME**: ALL these tests PASS on unfixed code (they capture correct existing behavior)

  **Bug 1 Preservation — Other API calls unaffected:**
  - Observe: `fetchTasks()` with mock returning `{ ok: true, items: [...] }` → returns items array
  - Observe: `completeTask("id")` with mock returning `{ ok: true }` → resolves without error
  - Observe: `uncompleteTask("id")` with mock returning `{ ok: true }` → resolves without error
  - Observe: `updateTask("id", { text: "X" })` with mock returning `{ ok: true }` → resolves without error
  - Write property-based test: for any response with `ok: true` going to `fetchTasks` / `completeTask` / `uncompleteTask` / `updateTask`, the call resolves (these already work on unfixed code)
  - Verify test PASSES on unfixed code
  - _Requirements: Bug 1 — 3.1, 3.2, 3.3_

  **Bug 2 Preservation — Default view and in-page switch unaffected:**
  - Observe: On first load with no `localStorage` key, `StudioPage` renders with `view === 'list'`
  - Observe: Clicking "Tablero" button immediately re-renders the `KanbanBoard` component (no reload needed)
  - Write test: Mount with no stored key → assert `view` is `'list'`
  - Write test: Click "Tablero" → assert `KanbanBoard` is rendered; click "Lista" → assert `WorkflowBoard` is rendered
  - Verify both tests PASS on unfixed code
  - _Requirements: Bug 2 — 3.1, 3.2_

  **Bug 3 Preservation — Expanded header displays all elements:**
  - Observe: Render `StudioPage` → project icon, title (`h1`), subtitle, eyebrow text, and action buttons are all visible
  - Write test: Assert project icon, title, subtitle, "Abrir asistente" button, and "+ Nueva comisión" button are present in the DOM
  - Verify test PASSES on unfixed code
  - _Requirements: Bug 3 — 3.1, 3.2_

  **Bug 4 Preservation — NAV_ITEMS navigate correctly:**
  - Observe: Clicking "Estudio de Comisiones" calls `onNavigate('studio')`
  - Observe: Clicking "Solicitudes de Comisión" calls `onNavigate('requests')`
  - Observe: Clicking "Configuración" calls `onNavigate('settings')`
  - Write test: For each of the 5 NAV_ITEMS + settings, click → assert `onNavigate` called with correct `id`
  - Verify test PASSES on unfixed code
  - _Requirements: Bug 4 — 3.1, 3.2_

  **Bug 5 Preservation — Hardcoded sections render in board view; list view unchanged:**
  - Observe: `KanbanBoard` with 4 hardcoded sections renders exactly 4 columns in the correct order
  - Observe: `WorkflowBoard` (list view) renders sections correctly without any custom-section element
  - Write test: Assert first 4 column headers match the hardcoded section labels (Backlog, Comisiones Nuevas, En Proceso, En Revisión) in board view
  - Write test: Assert `KanbanBoard` is NOT rendered when `view === 'list'` in `StudioPage`
  - Write property-based test: For any n drag operations between existing hardcoded columns, the total item count across all columns remains unchanged
  - Verify all tests PASS on unfixed code
  - _Requirements: Bug 5 — 3.1, 3.2, 3.3_

  - Mark task complete when all preservation tests are written, run, and confirmed passing on unfixed code

<!-- ═══════════════════════════════════════════════════════════════
     PHASE 3 — IMPLEMENTATION (Bug 1: API Serialization Fix)
     ═══════════════════════════════════════════════════════════════ -->

- [x] 3. Fix Bug 1 — API Response Serialization Error on Create/Delete Task

  - [x] 3.1 Fix proxy error handler in `server.js`
    - In `proxy.on('error', ...)`, change the emitted body from `{ ok: false, message: err.message }` to `{ ok: false, statusMessage: err.message }`
    - This aligns the proxy error shape with the Taskade API's own error shape and with what `request()` expects
    - _Bug_Condition: isBugCondition_1 — proxy error handler emits `message` but client expects `statusMessage`_
    - _Expected_Behavior: `{ ok: false, statusMessage: err.message }` so client can extract a human-readable message_
    - _Preservation: all other proxy pass-through paths (`proxyRes.pipe(res)`) are NOT changed_
    - _Requirements: Bug 1 — 2.3_

  - [x] 3.2 Fix `request()` error extraction in `src/api/taskade.js`
    - Change `throw new Error(data.message || \`HTTP ${res.status}\`)` to `throw new Error(data.statusMessage || data.message || \`HTTP ${res.status}\`)`
    - This handles both the Taskade API field (`statusMessage`) and the legacy proxy field (`message`) as a fallback
    - Review the `!res.ok || data.ok === false` guard: ensure it only triggers on genuine failures; the existing condition is correct as-is since `data.ok === false` is an explicit error signal from Taskade
    - _Bug_Condition: isBugCondition_1 — `request()` reads `data.message` but Taskade API error body uses `data.statusMessage`_
    - _Expected_Behavior: thrown error message equals `data.statusMessage` when present, else `data.message`, else HTTP status_
    - _Preservation: `fetchTasks`, `completeTask`, `uncompleteTask`, `updateTask` call paths remain unchanged_
    - _Requirements: Bug 1 — 2.1, 2.2, 2.4_

  - [x] 3.3 Verify Bug 1 exploration test now passes
    - **Property 1: Expected Behavior** - API Serialization Resolved for createTask / deleteTask
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug 1 section) — do NOT write new tests
    - Run: `createTask("Test comisión")` with success mock → assert resolves without throwing
    - Run: `deleteTask("abc-123")` with success mock → assert resolves without throwing
    - Run: proxy error mock `{ ok: false, message: "ECONNREFUSED" }` → assert error message is `"ECONNREFUSED"`
    - Run: Taskade error mock `{ ok: false, statusMessage: "Not found" }` → assert error message is `"Not found"`
    - **EXPECTED OUTCOME**: ALL PASS (confirms Bug 1 is fixed)
    - _Requirements: Bug 1 — 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Verify Bug 1 preservation tests still pass
    - **Property 2: Preservation** - Other API Calls Unaffected
    - **IMPORTANT**: Re-run the SAME tests from task 2 (Bug 1 Preservation section) — do NOT write new tests
    - Run `fetchTasks`, `completeTask`, `uncompleteTask`, `updateTask` preservation suite
    - **EXPECTED OUTCOME**: ALL PASS (no regressions in existing API calls)

<!-- ═══════════════════════════════════════════════════════════════
     PHASE 4 — IMPLEMENTATION (Bug 2: View Mode Persistence)
     ═══════════════════════════════════════════════════════════════ -->

- [x] 4. Fix Bug 2 — View Mode (List/Board) Resets on Navigation

  - [x] 4.1 Initialize `view` state from `localStorage` in `StudioPage`
    - In `src/pages/StudioPage.jsx`, change `const [view, setView] = useState('list')` to:
      `const [view, setView] = useState(() => localStorage.getItem('studio_view_mode') || 'list')`
    - The lazy initializer avoids reading `localStorage` on every render; defaults to `'list'` if no key is set
    - _Bug_Condition: isBugCondition_2 — `useState('list')` always resets on mount; no `localStorage` read exists_
    - _Expected_Behavior: on mount, `view` equals the stored value or `'list'` if no value is stored_
    - _Preservation: first load with no key still defaults to `'list'`_
    - _Requirements: Bug 2 — 2.2, 3.1_

  - [x] 4.2 Persist view mode to `localStorage` on every change
    - Replace the two inline `setView(...)` calls (one for 'list', one for 'board') with a shared handler:
      ```js
      function handleSetView(v) {
        setView(v)
        localStorage.setItem('studio_view_mode', v)
      }
      ```
    - Update both view-toggle buttons to call `handleSetView('list')` and `handleSetView('board')`
    - _Bug_Condition: isBugCondition_2 — no `localStorage.setItem` call exists for view mode_
    - _Expected_Behavior: after the user clicks "Tablero", `localStorage.getItem('studio_view_mode')` equals `'board'`_
    - _Preservation: immediate re-render on toggle is unchanged (React state update is still synchronous)_
    - _Requirements: Bug 2 — 2.1, 3.2_

  - [x] 4.3 Verify Bug 2 exploration test now passes
    - **Property 1: Expected Behavior** - View Mode Survives Navigation
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug 2 section) — do NOT write new tests
    - Mount `StudioPage`, switch to `'board'`, unmount, remount → assert `view` is `'board'`
    - Assert `localStorage.getItem('studio_view_mode')` equals `'board'` after switch
    - **EXPECTED OUTCOME**: ALL PASS (confirms Bug 2 is fixed)
    - _Requirements: Bug 2 — 2.1, 2.2_

  - [x] 4.4 Verify Bug 2 preservation tests still pass
    - **Property 2: Preservation** - View Default and Immediate Switch Unaffected
    - **IMPORTANT**: Re-run the SAME tests from task 2 (Bug 2 Preservation section)
    - First load with no stored key → `view === 'list'`; in-page toggle re-renders immediately
    - **EXPECTED OUTCOME**: ALL PASS (no regressions)

<!-- ═══════════════════════════════════════════════════════════════
     PHASE 5 — IMPLEMENTATION (Bug 3: Collapsible Page Header)
     ═══════════════════════════════════════════════════════════════ -->

- [x] 5. Fix Bug 3 — Page Header Area Is Not Collapsible

  - [x] 5.1 Add `headerCollapsed` state with `localStorage` persistence
    - In `src/pages/StudioPage.jsx`, add:
      `const [headerCollapsed, setHeaderCollapsed] = useState(() => localStorage.getItem('studio_header_collapsed') === 'true')`
    - Add toggle handler:
      ```js
      function toggleHeader() {
        const next = !headerCollapsed
        setHeaderCollapsed(next)
        localStorage.setItem('studio_header_collapsed', String(next))
      }
      ```
    - _Bug_Condition: isBugCondition_3 — no collapse state and no `localStorage` key `studio_header_collapsed` exist_
    - _Expected_Behavior: state persists across unmounts and page reloads_
    - _Preservation: `headerCollapsed` defaults to `false` (expanded) when no key is stored — all header elements remain visible_
    - _Requirements: Bug 3 — 2.1, 2.2, 2.3, 3.1_

  - [x] 5.2 Add collapse toggle button to the page header
    - Inside `.page-header-content`, add a `<button>` that:
      - Renders `▲` when `headerCollapsed` is `true`, `▼` when `false`
      - Has `aria-label="Colapsar encabezado"` / `"Expandir encabezado"` respectively
      - Has `aria-expanded={!headerCollapsed}`
      - Calls `toggleHeader()` on click
    - Add `page-header--collapsed` CSS modifier class to `.page-header` when `headerCollapsed` is `true`
    - _Bug_Condition: isBugCondition_3 — no toggle button exists in `.page-header`_
    - _Expected_Behavior: button is visible; click toggles the collapsed state and persists it_
    - _Requirements: Bug 3 — 2.1, 2.2_

  - [x] 5.3 Conditionally render the expanded header content
    - Wrap the subtitle (`<p className="page-header-sub">`), eyebrow text (`<p className="page-header-eyebrow">`), and the `.page-header-actions` div in `{!headerCollapsed && (...)}` so they are hidden when collapsed
    - The minimal bar (always visible) shows: project icon, title (`<h1>`), and the collapse toggle button
    - _Bug_Condition: isBugCondition_3 — header always shows full height_
    - _Expected_Behavior: when `headerCollapsed === true`, only icon + title + toggle are visible_
    - _Preservation: when `headerCollapsed === false`, all original elements render identically_
    - _Requirements: Bug 3 — 2.1, 3.1_

  - [x] 5.4 Add CSS for `page-header--collapsed` modifier in `src/styles/global.css`
    - Add rule: `.page-header--collapsed { min-height: unset; padding-block: 0.5rem; }`
    - This ensures the header shrinks visually; adjust values to match design intent
    - _Requirements: Bug 3 — 2.1, 2.2_

  - [x] 5.5 Verify Bug 3 exploration test now passes
    - **Property 1: Expected Behavior** - Header Collapse Toggle Works and Persists
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug 3 section) — do NOT write new tests
    - Assert collapse toggle button exists in the DOM
    - Click toggle → assert header has `page-header--collapsed` class AND subtitle is not in DOM
    - Assert `localStorage.getItem('studio_header_collapsed')` equals `'true'`
    - Unmount and remount → assert header is still collapsed
    - **EXPECTED OUTCOME**: ALL PASS (confirms Bug 3 is fixed)
    - _Requirements: Bug 3 — 2.1, 2.2, 2.3_

  - [x] 5.6 Verify Bug 3 preservation tests still pass
    - **Property 2: Preservation** - Expanded Header Displays All Elements
    - **IMPORTANT**: Re-run the SAME tests from task 2 (Bug 3 Preservation section)
    - With no stored key (default expanded), assert all original header elements are present
    - **EXPECTED OUTCOME**: ALL PASS (no regressions in expanded state)

<!-- ═══════════════════════════════════════════════════════════════
     PHASE 6 — IMPLEMENTATION (Bug 4: Placeholder Sidebar Buttons)
     ═══════════════════════════════════════════════════════════════ -->

- [x] 6. Fix Bug 4 — Placeholder Sidebar Buttons Have No Meaningful Behavior

  - [x] 6.1 Add `description` metadata to each `PLACEHOLDER_ITEMS` entry in `Sidebar.jsx`
    - Update the `PLACEHOLDER_ITEMS` array to include a `description` field for each item:
      - `'Agentes de IA'` → `'Conecta agentes autónomos para automatizar tareas de tu estudio.'`
      - `'Automatizaciones'` → `'Crea flujos de trabajo automáticos basados en eventos del proyecto.'`
      - `'Medios de comunicación'` → `'Gestiona todos tus canales de comunicación con clientes desde aquí.'`
      - `'Integraciones'` → `'Conecta herramientas externas como Notion, Google Drive y más.'`
      - `'Mapa DNA'` → `'Visualiza la estructura y dependencias de todo tu estudio creativo.'`
    - _Bug_Condition: isBugCondition_4 — placeholder buttons call `alert()` with no contextual information_
    - _Requirements: Bug 4 — 2.2_

  - [x] 6.2 Add `activePanel` state and replace `alert()` handlers
    - Add `const [activePanel, setActivePanel] = useState(null)` to `Sidebar`
    - Replace each `onClick={() => alert(...)}` with `onClick={() => setActivePanel(item)}`
    - _Bug_Condition: isBugCondition_4 — `onClick` calls `window.alert`_
    - _Expected_Behavior: clicking a placeholder button sets `activePanel` to the item object; no `alert()` call_
    - _Preservation: `NAV_ITEMS` `onClick` handlers (`() => onNavigate(item.id)`) are NOT touched_
    - _Requirements: Bug 4 — 2.1, 3.1_

  - [x] 6.3 Implement `ProximamentePanel` component
    - Create inline component (or new file `src/components/ProximamentePanel.jsx`) that renders:
      - A slide-in drawer/panel anchored to the sidebar (CSS: `position: fixed`, slide from left with transition)
      - Item icon (`item.icon`), item label (`item.label`), item description (`item.description`)
      - A "Próximamente" badge styled with a distinct color
      - A dismiss `×` button that calls `onDismiss()` and uses `aria-label="Cerrar panel"`
      - `role="dialog"`, `aria-modal="true"`, `aria-label={item.label}` for accessibility
      - Focus the dismiss button on mount (`autoFocus` or `useEffect` with `ref.current.focus()`)
    - _Expected_Behavior: non-blocking panel slides in; user can dismiss without interrupting workflow_
    - _Requirements: Bug 4 — 2.1, 2.2, 2.3_

  - [x] 6.4 Render `ProximamentePanel` conditionally in `Sidebar`
    - Add `{activePanel && <ProximamentePanel item={activePanel} onDismiss={() => setActivePanel(null)} />}` at the bottom of the `Sidebar` return
    - Ensure dismiss restores focus to the sidebar (use `onDismiss` to call `document.querySelector('.sidebar-nav--placeholders button[data-active]')?.focus()` or equivalent)
    - _Requirements: Bug 4 — 2.3, 3.2_

  - [x] 6.5 Verify Bug 4 exploration test now passes
    - **Property 1: Expected Behavior** - Placeholder Buttons Show Non-Blocking Panel
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug 4 section) — do NOT write new tests
    - Click "Agentes de IA" → assert `window.alert` NOT called
    - Assert panel element with "Próximamente" is rendered with correct label and description
    - Click dismiss → assert panel is removed from DOM
    - Repeat for all 5 placeholder items
    - **EXPECTED OUTCOME**: ALL PASS (confirms Bug 4 is fixed)
    - _Requirements: Bug 4 — 2.1, 2.2, 2.3_

  - [x] 6.6 Verify Bug 4 preservation tests still pass
    - **Property 2: Preservation** - NAV_ITEMS and Sidebar Controls Unaffected
    - **IMPORTANT**: Re-run the SAME tests from task 2 (Bug 4 Preservation section)
    - Click all 5 NAV_ITEMS + settings → assert `onNavigate` called with correct id each time
    - **EXPECTED OUTCOME**: ALL PASS (no regressions in nav behavior)

<!-- ═══════════════════════════════════════════════════════════════
     PHASE 7 — IMPLEMENTATION (Bug 5: Custom Kanban Sections)
     ═══════════════════════════════════════════════════════════════ -->

- [x] 7. Fix Bug 5 — No Ability to Create Custom Kanban Sections as Floating Panels

  - [x] 7.1 Load and manage `customSections` state in `KanbanBoard`
    - In `src/components/KanbanBoard.jsx`, add state:
      ```js
      const [customSections, setCustomSections] = useState(() => {
        try { return JSON.parse(localStorage.getItem('kanban_custom_sections') || '[]') }
        catch { return [] }
      })
      ```
    - Add helper to persist and update: `function saveCustomSections(updated) { setCustomSections(updated); localStorage.setItem('kanban_custom_sections', JSON.stringify(updated)) }`
    - _Bug_Condition: isBugCondition_5 — `KanbanBoard` only renders from `sections` prop; no local custom sections state_
    - _Expected_Behavior: custom sections are loaded on mount and persisted on every mutation_
    - _Requirements: Bug 5 — 2.4_

  - [x] 7.2 Merge hardcoded and custom sections for rendering
    - Compute `allSections = [...orderedSections, ...customSections.map(cs => ({ ...cs, items: cs.items || [] }))]`
    - Use `allSections` in the `{allSections.map(section => <KanbanColumn ...>)}` render loop
    - Custom sections start with empty `items` (local-only; not synced to Taskade API — out of scope)
    - _Expected_Behavior: hardcoded sections always appear first; custom sections follow in creation order_
    - _Preservation: `orderedSections` (from `sections` prop + order overrides) is unchanged_
    - _Requirements: Bug 5 — 2.3, 3.1_

  - [x] 7.3 Implement `NewSectionForm` inline component
    - Create inline component `NewSectionForm` that renders:
      - A text input for the section name (placeholder: "Nombre de la sección...")
      - A color swatch picker with 6–8 preset accent colors (e.g., `#7c6af7`, `#f87171`, `#34d399`, `#60a5fa`, `#fbbf24`, `#e879f9`, `#94a3b8`, `#fb923c`)
      - "Crear" confirm button (disabled when name is empty)
      - "×" cancel button
    - On confirm: generate `id = 'custom_' + Date.now()`, call `saveCustomSections([...customSections, { id, label: name, color: selectedColor, items: [] }])`
    - _Expected_Behavior: new column with chosen name and accent color is immediately appended to the board_
    - _Requirements: Bug 5 — 2.2, 2.3, 2.4_

  - [x] 7.4 Add "+ Nueva sección" button at the end of the board columns row
    - After the `allSections.map(...)` call in `KanbanBoard`, add:
      ```jsx
      {showNewSectionForm
        ? <NewSectionForm onConfirm={...} onCancel={() => setShowNewSectionForm(false)} />
        : <button className="kanban-add-section-btn" onClick={() => setShowNewSectionForm(true)}>+ Nueva sección</button>
      }
      ```
    - Add `const [showNewSectionForm, setShowNewSectionForm] = useState(false)` to `KanbanBoard`
    - _Bug_Condition: isBugCondition_5 — no "+ Nueva sección" button exists in the board_
    - _Expected_Behavior: button is always visible at the end of the columns row in board view_
    - _Requirements: Bug 5 — 2.1, 2.2_

  - [x] 7.5 Add custom section tools toolbar to custom `KanbanColumn` instances
    - Extend `KanbanColumn` to accept an optional `isCustom` prop and optional `onDeleteSection` / `onRecolorSection` props
    - When `isCustom` is `true`, render a tools toolbar below the column header with:
      - "+ Tarjeta" button (reuses existing `setAdding(true)` logic)
      - "Limpiar sección" button: clears all items from the custom section locally via `saveCustomSections(...)`
      - A color re-accent swatch picker (same 6–8 presets as `NewSectionForm`) that updates the section's `color` field and re-persists
      - "×" delete button in the column header that calls `onDeleteSection(section.id)`
    - Pass `isCustom={true}`, `onDeleteSection`, and `onRecolorSection` from `KanbanBoard` only for sections in `customSections`
    - _Expected_Behavior: custom column panel includes the preconfigured tools toolbar; hardcoded columns are unchanged_
    - _Preservation: `KanbanColumn` behavior for non-custom sections is fully unchanged (`isCustom` defaults to `false`)_
    - _Requirements: Bug 5 — 2.3, 2.5_

  - [x] 7.6 Implement delete and recolor handlers in `KanbanBoard`
    - Add `function deleteCustomSection(id) { saveCustomSections(customSections.filter(s => s.id !== id)) }`
    - Add `function recolorCustomSection(id, color) { saveCustomSections(customSections.map(s => s.id === id ? { ...s, color } : s)) }`
    - Pass these to each custom `KanbanColumn`
    - _Requirements: Bug 5 — 2.4_

  - [x] 7.7 Verify Bug 5 exploration test now passes
    - **Property 1: Expected Behavior** - Custom Kanban Sections Can Be Created and Persisted
    - **IMPORTANT**: Re-run the SAME tests from task 1 (Bug 5 section) — do NOT write new tests
    - Assert "+ Nueva sección" button exists in the DOM
    - Click it, fill in name "Revision de Boceto", pick a color, click "Crear" → assert new column is rendered
    - Assert `localStorage.getItem('kanban_custom_sections')` contains the new section definition
    - Unmount and remount `KanbanBoard` → assert the custom column is still rendered
    - Run property-based test: for n ∈ [1..10] random section additions, `localStorage` contains exactly n sections and n extra columns render
    - **EXPECTED OUTCOME**: ALL PASS (confirms Bug 5 is fixed)
    - _Requirements: Bug 5 — 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 7.8 Verify Bug 5 preservation tests still pass
    - **Property 2: Preservation** - Hardcoded Sections and List View Unaffected
    - **IMPORTANT**: Re-run the SAME tests from task 2 (Bug 5 Preservation section)
    - Assert 4 hardcoded sections render first; list view shows no custom sections; drag-and-drop still works
    - **EXPECTED OUTCOME**: ALL PASS (no regressions)

<!-- ═══════════════════════════════════════════════════════════════
     PHASE 8 — FINAL CHECKPOINT
     ═══════════════════════════════════════════════════════════════ -->

- [x] 8. Checkpoint — Ensure all tests pass and integration flows work

  - [x] 8.1 Run the full test suite
    - Execute all unit, property-based, and preservation tests written in tasks 1 and 2
    - All tests must pass (both fix-checking and preservation-checking)
    - If any test fails, diagnose root cause and apply targeted fix before continuing

  - [x] 8.2 Manual integration verification — Bug 1
    - Start the proxy (`node server.js`) and the dev server (`npm run dev`)
    - Open the Studio page, click "+ Nueva comisión", enter a name, and submit
    - Assert the commission card appears in the board without any console serialization error
    - Open a commission card, click delete, assert the card is removed
    - Ask the user to confirm both flows work end-to-end

  - [x] 8.3 Manual integration verification — Bug 2
    - Switch view to "Tablero", navigate to "Solicitudes", navigate back to "Studio"
    - Assert the view toggle shows "Tablero" as active
    - Repeat for "Lista" view to confirm both directions work

  - [x] 8.4 Manual integration verification — Bug 3
    - Click the collapse toggle on the page header
    - Assert the header shrinks to icon + title only, freeing space for the board
    - Reload the page — assert the header remains collapsed
    - Click the toggle again — assert the header expands fully with all elements visible

  - [x] 8.5 Manual integration verification — Bug 4
    - Click each of the 5 placeholder sidebar buttons ("Agentes de IA", "Automatizaciones", "Medios de comunicación", "Integraciones", "Mapa DNA")
    - Assert a slide-in panel appears for each with the correct name, description, and "Próximamente" badge
    - Assert no browser `alert()` dialog appears
    - Dismiss each panel and confirm focus returns to the sidebar

  - [x] 8.6 Manual integration verification — Bug 5
    - Switch to "Tablero" view, click "+ Nueva sección", enter "Revision de Boceto", pick a color, confirm
    - Assert the new column appears at the end of the board with the "+ Tarjeta", "Limpiar sección", and color picker tools
    - Drag a commission card into the custom column — assert it lands correctly
    - Reload the page — assert the custom column is still present
    - Switch to "Lista" view — assert the custom column does NOT appear
    - Delete the custom column — assert it is removed from the board and from `localStorage`

  - [x] 8.7 Final sign-off
    - Ensure all five bugs are resolved with no observable regressions
    - Confirm `localStorage` keys in use: `studio_view_mode`, `studio_header_collapsed`, `kanban_custom_sections`, `kanban_order`
    - Ask the user if any questions or edge cases remain before closing this spec

---

## Notes

- Tasks 1 and 2 are standalone property-based / exploratory test tasks that MUST run on **unfixed code** before any implementation begins
- Bug 1 (API serialization) is the highest-priority fix — it is blocking; resolve it before Bugs 2–5
- Bugs 2 and 3 both touch `StudioPage.jsx` and can be implemented in the same pass (task 4 + task 5)
- Bug 4 touches only `Sidebar.jsx`; it is self-contained and safe to implement independently
- Bug 5 (custom Kanban sections) is the most complex change; custom sections are **local-only** and not synced to the Taskade API
- All `localStorage` keys in use: `studio_view_mode`, `studio_header_collapsed`, `kanban_custom_sections`, `kanban_order`
- Property-based tests are recommended for Bugs 1 and 5 (many input shapes); example-based tests are sufficient for Bugs 2, 3, and 4
- The existing `kanban_order` key in `KanbanBoard` is preserved and must not be broken by Bug 5 changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "3.4"] },
    { "id": 3, "tasks": ["4.1", "4.2", "5.1"] },
    { "id": 4, "tasks": ["4.3", "4.4", "5.2", "5.3"] },
    { "id": 5, "tasks": ["5.4", "5.5", "5.6", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 7, "tasks": ["6.5", "6.6", "7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 9, "tasks": ["7.5", "7.6", "7.7"] },
    { "id": 10, "tasks": ["7.8", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7"] }
  ]
}
```
