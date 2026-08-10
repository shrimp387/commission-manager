# Studio Commission Bugs — Bugfix Design

## Overview

This document formalizes the design for fixing five bugs in the Studio de Comisiones app. The bugs span three layers:

- **API layer** (Bug 1): Mismatched response shapes between `server.js` and `src/api/taskade.js` cause serialization errors on `createTask` / `deleteTask`.
- **State persistence layer** (Bugs 2 & 3): Two pieces of UI state — view mode and header collapse — are stored as local React state and are lost on navigation. Both need `localStorage` persistence.
- **UX interaction layer** (Bug 4): Sidebar placeholder buttons call `alert()`. They need to be replaced with a non-blocking slide-in "Próximamente" info panel.
- **Feature gap** (Bug 5): The Kanban board has no mechanism for adding custom columns. A full inline creation flow with `localStorage` persistence is required.

The fix strategy is minimal and targeted: change only what is necessary to satisfy each bug condition, verify that buggy inputs now produce the correct output, and confirm that all non-buggy inputs are unchanged.

---

## Glossary

- **Bug_Condition (C)**: The predicate that identifies inputs that trigger defective behavior for a given bug.
- **Property (P)**: The desired observable behavior when `C(X)` holds true after the fix.
- **Preservation**: The guarantee that behavior for all `¬C(X)` inputs is identical before and after the fix.
- **F**: The original (unfixed) function or component.
- **F'**: The fixed function or component.
- **`request()`**: The function in `src/api/taskade.js` that wraps all `fetch` calls to the proxy.
- **proxy**: `server.js` — the Express-like `http.createServer` Node.js proxy forwarding requests to `taskade.com/api/v1`.
- **`StudioPage`**: `src/pages/StudioPage.jsx` — owns the `view` state (list/board) and renders the page header.
- **`KanbanBoard`**: `src/components/KanbanBoard.jsx` — renders Kanban columns from the `sections` prop.
- **`Sidebar`**: `src/components/Sidebar.jsx` — renders both functional nav items and five placeholder stub buttons.
- **`localStorage` key**: A stable string key used to persist state across navigation and page reloads.
- **isBugCondition**: A pseudocode predicate used throughout this document to identify the exact inputs that trigger each bug.

---

## Bug Details

### Bug 1 — API Response Serialization Error on Create/Delete Task

#### Bug Condition

The bug manifests when `createTask` or `deleteTask` is called through the proxy and a response is received. Two separate mis-alignments cause failures: (a) the proxy error handler emits `{ ok: false, message }` but the client expects `{ ok: false, statusMessage }`, and (b) `request()` reads `data.message` to throw errors but the Taskade API body uses `statusMessage`.

**Formal Specification:**
```
FUNCTION isBugCondition_1(context)
  INPUT: context = { caller: 'createTask' | 'deleteTask', responseShape: object }
  OUTPUT: boolean

  isAffectedCaller := context.caller IN ['createTask', 'deleteTask']
  proxyErrorMismatch := context.responseShape.ok === false
                        AND context.responseShape.message IS defined
                        AND context.responseShape.statusMessage IS undefined
  clientReadsMismatch := request() throws using data.message
                         AND data.message IS undefined
                         AND data.statusMessage IS defined

  RETURN isAffectedCaller
         AND (proxyErrorMismatch OR clientReadsMismatch)
END FUNCTION
```

#### Examples

- `createTask("Comisión nueva")` → proxy returns `{ ok: true, ... }` → client throws `"Failed to serialize: error Error: { code: 'invalid_literal', expected: false, path: ['ok'] }"` because the response schema validation fails. **Expected**: resolves with response data.
- `deleteTask("abc-123")` → same serialization error → task not removed from UI. **Expected**: resolves, triggers reload.
- Proxy network error → emits `{ ok: false, message: "ECONNREFUSED" }` → client reads `data.message` correctly, but `statusMessage` field is missing, causing downstream schema failures. **Expected**: `{ ok: false, statusMessage: "ECONNREFUSED" }`.
- `request()` receives `{ ok: false, statusMessage: "Not found" }` → throws `new Error(undefined)` because it reads `data.message` instead of `data.statusMessage`. **Expected**: throws `new Error("Not found")`.

---

### Bug 2 — View Mode (List/Board) Resets on Navigation

#### Bug Condition

The bug manifests when the user navigates away from `StudioPage` and returns. The `view` state is held in a `useState('list')` call inside `StudioPage`, which resets on every mount.

**Formal Specification:**
```
FUNCTION isBugCondition_2(event)
  INPUT: event = { type: 'navigation', previousView: string }
  OUTPUT: boolean

  RETURN event.type === 'navigation'
         AND event.previousView IN ['list', 'board']
         AND viewAfterReturn IS 'list'
         AND viewAfterReturn !== event.previousView
END FUNCTION
```

#### Examples

- User sets view to `'board'`, navigates to Solicitudes, returns → view is `'list'`. **Expected**: view is `'board'`.
- User sets view to `'list'`, navigates away, returns → view is `'list'`. **Correct** (default preserved, no visible regression).
- First load with no `localStorage` key → view is `'list'`. **Expected**: still `'list'` (default preserved).

---

### Bug 3 — Page Header Area Is Not Resizable or Collapsible

#### Bug Condition

The bug manifests when a user wants to maximize vertical space. The `.page-header` has a fixed height and no collapse control.

**Formal Specification:**
```
FUNCTION isBugCondition_3(userIntent)
  INPUT: userIntent = { action: string }
  OUTPUT: boolean

  RETURN userIntent.action === 'collapseHeader'
         AND collapseToggleExists IS false
END FUNCTION
```

#### Examples

- User opens Studio page → no collapse button is visible on the header. **Expected**: a collapse/expand toggle is visible.
- User collapses header → header still shows full height. **Expected**: header shrinks to minimal bar (icon + title only).
- User reloads page → header returns to expanded state. **Expected**: header respects `localStorage` `studio_header_collapsed` value.

---

### Bug 4 — Placeholder Sidebar Buttons Have No Meaningful Behavior

#### Bug Condition

The bug manifests when a user clicks any of the five `PLACEHOLDER_ITEMS` buttons in `Sidebar.jsx`. The `onClick` calls `alert(...)`, which is blocking and provides no useful context.

**Formal Specification:**
```
FUNCTION isBugCondition_4(event)
  INPUT: event = { target: SidebarButton, buttonType: 'placeholder' | 'nav' }
  OUTPUT: boolean

  RETURN event.buttonType === 'placeholder'
         AND event.handler IS alert(...)
END FUNCTION
```

#### Examples

- User clicks "Agentes de IA" → browser `alert()` fires, blocks interaction. **Expected**: non-blocking slide-in panel appears with feature name, description, and dismiss action.
- User dismisses the panel → focus returns to sidebar. **Expected**: no page navigation occurs.
- User clicks "Studio de Comisiones" (nav item) → navigates to Studio page. **Not affected**: nav items are unchanged.

---

### Bug 5 — No Ability to Create Custom Kanban Sections as Floating Panels

#### Bug Condition

The bug manifests when a user in board view wants to add a custom column. `KanbanBoard` only renders sections from the `sections` prop, which is derived from hardcoded `SECTION_IDS` in `config.js`. There is no "+ Nueva sección" button.

**Formal Specification:**
```
FUNCTION isBugCondition_5(boardState)
  INPUT: boardState = { view: string, customSections: array }
  OUTPUT: boolean

  RETURN boardState.view === 'board'
         AND newSectionButtonExists IS false
         AND boardState.customSections.length === 0
END FUNCTION
```

#### Examples

- User in board view → only 4 hardcoded columns visible, no add-section button. **Expected**: "+ Nueva sección" button at end of columns row.
- User clicks "+ Nueva sección" → nothing happens (button doesn't exist). **Expected**: inline form opens with name and color picker.
- User confirms "Revision de Boceto" → column not added. **Expected**: new column appended, persisted to `localStorage` under `kanban_custom_sections`.
- User reloads page → custom column is gone. **Expected**: custom columns are restored from `localStorage`.
- User switches to list view → custom column should not appear. **Expected**: only hardcoded sections in list view.

---

## Expected Behavior

### Preservation Requirements

**Bug 1 — Unchanged Behaviors:**
- `fetchTasks`, `completeTask`, `uncompleteTask`, and `updateTask` SHALL continue to work without serialization errors.
- All successful proxy pass-throughs (non-error paths) SHALL continue to pipe responses unchanged.

**Bug 2 — Unchanged Behaviors:**
- Switching between `'list'` and `'board'` view SHALL continue to re-render the correct component immediately.
- First load with no stored preference SHALL continue to default to `'list'`.

**Bug 3 — Unchanged Behaviors:**
- When the header is expanded, the project icon, title, subtitle, and all action buttons SHALL continue to display as before.
- Sidebar resize SHALL continue to be independent of header collapse state.

**Bug 4 — Unchanged Behaviors:**
- All five `NAV_ITEMS` (Studio, Solicitudes, Portafolio, Guía, Configuración) SHALL continue to navigate correctly.
- Sidebar resize and mobile menu open/close SHALL continue to work regardless of panel state.

**Bug 5 — Unchanged Behaviors:**
- All four hardcoded sections (Backlog, Comisiones Nuevas, En Proceso, En Revisión) SHALL continue to appear first in board view.
- List/workflow view SHALL continue to show only hardcoded sections.
- Drag-and-drop between columns SHALL continue to work for both hardcoded and custom sections.

---

## Hypothesized Root Cause

### Bug 1

1. **Schema validation mismatch**: The Taskade API responds with `{ ok: true, ... }` but the client-side response validation or Zod schema expects `ok` to be `false` as a literal type, causing the `invalid_literal` error. More likely: the proxy's `Content-Type` or status code causes `res.json()` to fail or return unexpected shapes.
2. **Wrong field name in error handler**: `server.js` proxy error handler emits `{ ok: false, message: err.message }`. The client `request()` reads `data.statusMessage` for Taskade API errors (correct) but the proxy emits `message` instead. Additionally, `request()` reads `data.message` (not `data.statusMessage`) for the `data.ok === false` branch, which is inverted.
3. **Dual source of truth for error field name**: The Taskade API uses `statusMessage`; the proxy error handler uses `message`. The client must normalize both.

### Bug 2

1. **Ephemeral `useState`**: `const [view, setView] = useState('list')` in `StudioPage` resets to `'list'` every time the component mounts. There is no effect to read from `localStorage` on mount and no effect to write to `localStorage` on change.

### Bug 3

1. **No collapse toggle exists**: The `StudioPage` `.page-header` JSX has no button or mechanism for collapsing. The CSS uses a fixed layout with no conditional class for a collapsed state.
2. **No persistence**: Even if a toggle were added, no `localStorage` read/write exists for `studio_header_collapsed`.

### Bug 4

1. **Hardcoded `alert()`**: `PLACEHOLDER_ITEMS` onClick handlers in `Sidebar.jsx` unconditionally call `window.alert(...)`. No state, no panel component, no tooltip logic exists.

### Bug 5

1. **Static `sections` prop**: `KanbanBoard` receives `sections` purely from `useTasks()` which reads from the Taskade API (hardcoded `SECTION_IDS`). There is no mechanism to inject locally-created sections.
2. **No UI entry point**: No "+ Nueva sección" button, no inline form, no creation flow exists in `KanbanBoard.jsx`.
3. **No persistence layer**: No `localStorage` read/write for `kanban_custom_sections` exists anywhere.

---

## Correctness Properties

Property 1: Bug Condition — API Serialization Resolved for Create/Delete

_For any_ call to `createTask` or `deleteTask` where the Taskade API or proxy returns a response (success or error), the fixed `request()` function and proxy error handler SHALL deserialize the response without throwing a serialization error, and SHALL extract the human-readable message from `statusMessage` (falling back to `message`) so that errors carry a meaningful description.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation — Other API Calls Unaffected

_For any_ call to `fetchTasks`, `completeTask`, `uncompleteTask`, or `updateTask`, the fixed `request()` function SHALL produce the same result as the original function, preserving all existing successful deserialization behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 3: Bug Condition — View Mode Survives Navigation

_For any_ user action that changes the view to `'board'` or `'list'` followed by navigation away from and back to `StudioPage`, the fixed component SHALL initialize `view` from `localStorage` `studio_view_mode`, restoring the user's last choice.

**Validates: Requirements 2.1, 2.2**

Property 4: Preservation — View Default and Immediate Switch Unaffected

_For any_ first load with no stored `studio_view_mode` key, the fixed component SHALL default to `'list'`; and for any in-page view switch, the fixed component SHALL re-render the correct board immediately — identical to original behavior.

**Validates: Requirements 3.1, 3.2**

Property 5: Bug Condition — Header Collapse Toggle Works and Persists

_For any_ user click on the collapse toggle, the fixed `StudioPage` SHALL toggle the header between full and minimal states, AND persist the new state to `localStorage` `studio_header_collapsed` so that the state survives reloads and navigation.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 6: Preservation — Expanded Header Displays All Elements

_For any_ render of `StudioPage` where `headerCollapsed` is `false` (or not set), the fixed component SHALL display the project icon, title, subtitle, and all action buttons identically to the original.

**Validates: Requirements 3.1, 3.2**

Property 7: Bug Condition — Placeholder Buttons Show Non-Blocking Panel

_For any_ click on a `PLACEHOLDER_ITEMS` button, the fixed `Sidebar` SHALL open an inline, non-blocking slide-in panel showing the feature name, a one-sentence description, a "Próximamente" label, and a dismiss action — without calling `alert()`.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 8: Preservation — Nav Items and Sidebar Controls Unaffected

_For any_ click on a `NAV_ITEMS` button (Studio, Solicitudes, Portafolio, Guía, Configuración) or any sidebar resize/mobile-menu interaction, the fixed `Sidebar` SHALL behave identically to the original.

**Validates: Requirements 3.1, 3.2**

Property 9: Bug Condition — Custom Kanban Sections Can Be Created and Persisted

_For any_ user action that creates a custom section (name + color confirmed in the inline form), the fixed `KanbanBoard` SHALL append a new column to the board, render it with the same card-add and drag-drop capabilities as hardcoded columns, and persist the section definition to `localStorage` `kanban_custom_sections` so it survives reloads.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 10: Preservation — Hardcoded Sections and List View Unaffected

_For any_ render of the Kanban board, the fixed component SHALL display the four hardcoded sections first; and in list/workflow view, no custom sections SHALL appear — identical to original behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

---

## Fix Implementation

### Bug 1 — Changes Required

**File**: `server.js`

**Function**: proxy error handler (`proxy.on('error', ...)`)

**Specific Changes**:
1. **Align error field name**: Change `{ ok: false, message: err.message }` → `{ ok: false, statusMessage: err.message }` so the proxy error shape matches what the Taskade API itself returns and what the client expects.

---

**File**: `src/api/taskade.js`

**Function**: `request()`

**Specific Changes**:
1. **Fix error message extraction**: Change `throw new Error(data.message || ...)` → `throw new Error(data.statusMessage || data.message || ...)` to handle both the Taskade API field (`statusMessage`) and the legacy proxy field (`message`).
2. **Review `res.ok` check**: The condition `!res.ok || data.ok === false` may be double-triggering on success responses if Taskade wraps success in `{ ok: true }`. Validate that the guard only throws on genuine failures (not when `data.ok === true`). Change to: if `res.ok` is `false` OR `data.ok === false`, throw; otherwise return `data`.

---

### Bug 2 — Changes Required

**File**: `src/pages/StudioPage.jsx`

**Function**: `StudioPage` component

**Specific Changes**:
1. **Initialize from localStorage**: Change `useState('list')` → `useState(() => localStorage.getItem('studio_view_mode') || 'list')` (lazy initializer for SSR-safety and correctness).
2. **Persist on change**: Replace the two `setView(...)` calls with a handler function `handleSetView(v)` that calls `setView(v)` AND `localStorage.setItem('studio_view_mode', v)`.

---

### Bug 3 — Changes Required

**File**: `src/pages/StudioPage.jsx`

**Function**: `StudioPage` component

**Specific Changes**:
1. **Add collapse state**: Add `const [headerCollapsed, setHeaderCollapsed] = useState(() => localStorage.getItem('studio_header_collapsed') === 'true')`.
2. **Toggle handler**: Add `function toggleHeader() { const next = !headerCollapsed; setHeaderCollapsed(next); localStorage.setItem('studio_header_collapsed', String(next)); }`.
3. **Conditional header rendering**: Wrap subtitle, eyebrow text, and action buttons in a conditional block that hides them when `headerCollapsed` is `true`. The minimal bar shows only the project icon and title.
4. **Add toggle button**: Insert a `<button>` inside `.page-header-content` that renders `▲` (collapsed) or `▼` (expanded) and calls `toggleHeader()`. Use `aria-label` and `aria-expanded` for accessibility.
5. **CSS class**: Add a `page-header--collapsed` modifier class to `.page-header` when `headerCollapsed` is `true`, controlled via inline className.

---

### Bug 4 — Changes Required

**File**: `src/components/Sidebar.jsx`

**Specific Changes**:
1. **Add panel state**: Add `const [activePanel, setActivePanel] = useState(null)` — holds the currently shown placeholder item label, or `null` if no panel is open.
2. **Panel metadata**: Add `description` field to each entry in `PLACEHOLDER_ITEMS` (one sentence describing future purpose).
3. **Replace `alert()`**: Change each placeholder button's `onClick` from `() => alert(...)` to `() => setActivePanel(item)`.
4. **Add `ProximamentePanel` component** (inline in the same file or as a separate file): renders as a slide-in drawer/tooltip anchored to the sidebar, showing `item.icon`, `item.label`, `item.description`, "Próximamente" badge, and a dismiss `×` button that calls `setActivePanel(null)`.
5. **Render panel**: Conditionally render `<ProximamentePanel>` when `activePanel !== null`, passing `activePanel` as props.
6. **Accessibility**: Panel should trap focus or at minimum use `role="dialog"` and `aria-modal="true"` with a visible dismiss button.

---

### Bug 5 — Changes Required

**File**: `src/components/KanbanBoard.jsx`

**Function**: `KanbanBoard` component

**Specific Changes**:
1. **Load custom sections from localStorage**: Add state `const [customSections, setCustomSections] = useState(() => { try { return JSON.parse(localStorage.getItem('kanban_custom_sections') || '[]') } catch { return [] } })`.
2. **Merge sections**: Compute `allSections = [...orderedSections, ...customSections.map(cs => ({ ...cs, items: [] }))]`. Custom sections start empty; their tasks would require a separate local store (out of scope for this bug — custom sections are local-only, not synced to Taskade API).
3. **Add "Nueva sección" button**: Render a `<NewSectionButton>` after the last column in the board row. On click, show an inline `<NewSectionForm>`.
4. **`NewSectionForm` component**: Inline form with a text input for the section name and a color picker (6–8 preset swatches). On confirm: generate a stable local ID (`'custom_' + Date.now()`), create a section object `{ id, label, color, items: [] }`, append to `customSections`, and persist the updated array to `localStorage`.
5. **Custom column tools toolbar**: Each custom `KanbanColumn` rendered from `customSections` SHALL show a small toolbar with: "+ Tarjeta" (reuses existing `adding` state), "Limpiar sección" (clears all items from that column locally), and a color re-accent picker.
6. **Delete custom section**: Custom column header includes a `×` delete button that removes the section from state and `localStorage`.
7. **Guard list view**: `KanbanBoard` is only rendered when `view === 'board'` in `StudioPage`, so custom sections are naturally absent from list view — no additional guard needed.

---

## Testing Strategy

### Validation Approach

The testing strategy follows the bug condition methodology: first write exploratory tests that run on the **unfixed** code to surface counterexamples and confirm the root cause, then write fix-checking and preservation-checking tests to validate the corrected behavior.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples on unfixed code. Confirm or refute root cause hypotheses. If refuted, re-hypothesize.

**Bug 1 — Test Plan**: Call `createTask` and `deleteTask` against a mock proxy that returns a success response and observe whether the client throws a serialization error.

**Test Cases**:
1. **Create Task Success**: Mock proxy returns `{ ok: true, items: [...] }` → assert `createTask()` resolves without throwing (will fail on unfixed code).
2. **Delete Task Success**: Mock proxy returns `{ ok: true }` → assert `deleteTask()` resolves without throwing (will fail on unfixed code).
3. **Proxy Error Shape**: Mock proxy returns `{ ok: false, message: "ECONNREFUSED" }` → assert thrown error message is `"ECONNREFUSED"` (currently throws `undefined`).
4. **Taskade API Error Shape**: Mock returns `{ ok: false, statusMessage: "Not found" }` → assert thrown error message is `"Not found"` (currently throws `undefined`).

**Expected Counterexamples**:
- `createTask` / `deleteTask` throw `"Failed to serialize..."` or `undefined` error message.
- Root cause confirmed: `request()` reads wrong field name; proxy emits wrong field name.

---

**Bug 2 — Test Plan**: Mount `StudioPage`, switch to `'board'`, unmount, remount, assert `view` state.

**Test Cases**:
1. **View Reset**: Set view to `'board'`, unmount `StudioPage`, remount → assert initial view is `'list'` (demonstrates the bug).
2. **No Persistence**: Check `localStorage.getItem('studio_view_mode')` after switching → assert it is `null` (demonstrates no persistence).

---

**Bug 3 — Test Plan**: Render `StudioPage`, attempt to find a collapse toggle button.

**Test Cases**:
1. **No Collapse Button**: Render `StudioPage` → assert no element with `aria-label` containing "colapsar" or "collapse" exists (demonstrates the bug).

---

**Bug 4 — Test Plan**: Render `Sidebar`, click a placeholder button, assert `window.alert` was called.

**Test Cases**:
1. **Alert Called**: Click "Agentes de IA" → assert `window.alert` was called (demonstrates the current broken behavior).
2. **No Panel Shown**: After clicking → assert no slide-in panel element is rendered (demonstrates the missing feature).

---

**Bug 5 — Test Plan**: Render `KanbanBoard`, assert no "+ Nueva sección" button exists.

**Test Cases**:
1. **No Add Section Button**: Render `KanbanBoard` in board view → assert no button with text "Nueva sección" exists (demonstrates the bug).
2. **No Custom Sections in localStorage**: Check `localStorage.getItem('kanban_custom_sections')` → assert `null` (demonstrates no persistence layer).

---

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Bug 1:**
```
FOR ALL call WHERE isBugCondition_1(call) DO
  result := request_fixed(call)
  ASSERT NOT throws serialization error
  ASSERT error.message IS defined AND human-readable WHEN response.ok === false
END FOR
```

**Bug 2:**
```
FOR ALL navigation WHERE isBugCondition_2(navigation) DO
  setView('board')
  unmount StudioPage
  remount StudioPage
  ASSERT view === localStorage.getItem('studio_view_mode') === 'board'
END FOR
```

**Bug 3:**
```
FOR ALL render WHERE isBugCondition_3(render) DO
  collapseBtn := findCollapseToggle()
  ASSERT collapseBtn EXISTS
  click(collapseBtn)
  ASSERT header IS in collapsed state
  ASSERT localStorage.getItem('studio_header_collapsed') === 'true'
END FOR
```

**Bug 4:**
```
FOR ALL click WHERE isBugCondition_4(click) DO
  result := handlePlaceholderClick(item)
  ASSERT window.alert NOT called
  ASSERT slide-in panel IS rendered with item.label AND item.description AND 'Próximamente'
END FOR
```

**Bug 5:**
```
FOR ALL boardState WHERE isBugCondition_5(boardState) DO
  addSectionBtn := findNewSectionButton()
  ASSERT addSectionBtn EXISTS
  click(addSectionBtn)
  fill('Revision de Boceto')
  confirm()
  ASSERT new column IS rendered
  ASSERT localStorage.getItem('kanban_custom_sections') CONTAINS new section
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original.

```
FOR ALL call WHERE NOT isBugCondition_1(call) DO   -- fetchTasks, completeTask, etc.
  ASSERT request_original(call) === request_fixed(call)
END FOR

FOR ALL load WHERE NOT isBugCondition_2(load) DO   -- first load, no stored key
  ASSERT view_fixed defaults to 'list'
END FOR

FOR ALL render WHERE NOT isBugCondition_3(render) DO  -- expanded header
  ASSERT all header elements visible AS BEFORE
END FOR

FOR ALL click WHERE NOT isBugCondition_4(click) DO    -- NAV_ITEMS clicks
  ASSERT onNavigate called with correct id AS BEFORE
END FOR

FOR ALL boardState WHERE NOT isBugCondition_5(boardState) DO  -- hardcoded sections
  ASSERT four hardcoded columns rendered FIRST in board view
  ASSERT list view shows only hardcoded sections
END FOR
```

**Testing Approach**: Property-based testing is recommended for Bugs 1 and 5 because:
- Bug 1: Many response shapes are possible; PBT generates random shapes to verify only the correct ones pass.
- Bug 5: Many custom section name/color combinations are possible; PBT verifies all persist and restore correctly.

---

### Unit Tests

- **Bug 1**: Test `request()` with mocked `fetch` returning `{ ok: true }`, `{ ok: false, statusMessage }`, `{ ok: false, message }` shapes. Test proxy error handler emits `statusMessage`.
- **Bug 2**: Test `StudioPage` mounts and reads `studio_view_mode` from `localStorage`; test `handleSetView` writes to `localStorage`.
- **Bug 3**: Test collapse toggle renders; test click toggles `headerCollapsed`; test `localStorage` write on toggle.
- **Bug 4**: Test placeholder button click opens panel; test dismiss closes panel; test `window.alert` is NOT called.
- **Bug 5**: Test "+ Nueva sección" button renders; test form submission creates column; test `localStorage` persistence; test column appears in board view only.

### Property-Based Tests

- **Bug 1**: For any arbitrary `response` object with `ok: true`, `request_fixed` SHALL resolve without throwing. For any arbitrary `response` with `ok: false` and either `statusMessage` or `message`, the thrown error message SHALL equal the first defined field.
- **Bug 5**: For any sequence of `n` custom section additions (random names, random colors from the allowed palette), `localStorage.getItem('kanban_custom_sections')` SHALL contain exactly `n` entries with correct fields, and all `n` columns SHALL render in board view after a remount.
- **Bug 2**: For any view value in `['list', 'board']` stored in `localStorage`, `StudioPage` on mount SHALL initialize `view` to that exact value.

### Integration Tests

- **Bug 1**: Full flow — trigger "+ Nueva comisión" modal, submit a name, assert the card appears in the board without a console serialization error.
- **Bug 1**: Full flow — open a commission card, click delete, assert the card is removed from the board.
- **Bug 2**: Navigate Studio → Solicitudes → Studio and assert the view toggle reflects the previously selected mode.
- **Bug 3**: Navigate Studio → Solicitudes → Studio and assert the header collapse state is restored from `localStorage`.
- **Bug 4**: Click all five placeholder sidebar buttons in sequence and assert none triggers `alert()`; assert the panel opens and closes correctly for each.
- **Bug 5**: Add two custom sections, reload the page, assert both sections are present in the Kanban board. Switch to list view and assert custom sections are absent.
