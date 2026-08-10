# Bugfix Requirements Document

## Introduction

This document covers five bugs and missing capabilities found in the Studio de Comisiones app (React + Vite, Taskade REST API). The issues range from a blocking serialization error that prevents creating and deleting commission cards, to UX regressions (view mode reset), missing interactivity (non-resizable page header, stub sidebar buttons), and a missing kanban customization feature (custom floating panel sections). Each bug is documented using the bug condition methodology so that fixes can be validated systematically.

---

## Bug 1 — API Response Serialization Error on Create/Delete Task

### Bug Analysis

#### Current Behavior (Defect)

1.1 WHEN `createTask` is called via the proxy and the Taskade API returns a success response, THEN the app throws `"Failed to serialize: error Error: { code: 'invalid_literal', expected: false, path: ['ok'], ... }"` and the commission card is not created.

1.2 WHEN `deleteTask` is called via the proxy and the Taskade API returns a success response, THEN the app throws the same serialization error and the task is not deleted.

1.3 WHEN the proxy's error handler fires (network failure), THEN it emits `{ ok: false, message: err.message }` which is missing the `statusMessage` field expected by the response schema, causing a secondary serialization failure.

1.4 WHEN `request()` in `src/api/taskade.js` receives a response with `data.ok === false`, THEN it throws using `data.message`, but the Taskade API error body uses `statusMessage` (not `message`), so the thrown error message is always `undefined`.

#### Expected Behavior (Correct)

2.1 WHEN `createTask` is called and the Taskade API returns a success response, THEN the system SHALL deserialize the response without error and resolve the promise with the response data.

2.2 WHEN `deleteTask` is called and the Taskade API returns a success response, THEN the system SHALL deserialize the response without error and resolve the promise, triggering a UI reload.

2.3 WHEN the proxy's error handler fires, THEN the system SHALL emit a JSON body that conforms to the expected error shape so that the client can parse and display a meaningful error message.

2.4 WHEN `request()` receives `data.ok === false`, THEN the system SHALL extract the error message from `data.statusMessage` (falling back to `data.message`) so that thrown errors carry a human-readable description.

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN `fetchTasks` is called and the API returns a successful list, THEN the system SHALL CONTINUE TO return the `items` array correctly.

3.2 WHEN `completeTask` or `uncompleteTask` is called successfully, THEN the system SHALL CONTINUE TO resolve without throwing a serialization error.

3.3 WHEN `updateTask` (rename) is called successfully, THEN the system SHALL CONTINUE TO resolve and apply the optimistic UI update.

---

## Bug 2 — View Mode (List/Board) Resets on Navigation

### Bug Analysis

#### Current Behavior (Defect)

1.1 WHEN the user selects "Tablero" (board) view on the Studio page and then navigates to any other page (e.g., Solicitudes), THEN the view preference is discarded because `StudioPage` is unmounted.

1.2 WHEN the user returns to the Studio page after navigating away, THEN the view always initialises to `'list'` (the `useState('list')` default), ignoring the user's previous selection.

#### Expected Behavior (Correct)

2.1 WHEN the user changes the view mode to "Tablero" or "Lista", THEN the system SHALL persist that preference to `localStorage` under a stable key (e.g., `studio_view_mode`).

2.2 WHEN the Studio page mounts, THEN the system SHALL read the persisted view mode from `localStorage` and initialise the view toggle to the stored value, defaulting to `'list'` if no value is stored.

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN no view preference has been saved, THEN the system SHALL CONTINUE TO default to the `'list'` view on first load.

3.2 WHEN the user switches between "Lista" and "Tablero", THEN the system SHALL CONTINUE TO re-render the correct board component immediately without a page reload.

---

## Bug 3 — Page Header Area Is Not Resizable or Collapsible

### Bug Analysis

#### Current Behavior (Defect)

1.1 WHEN the Studio page is displayed, THEN the page header (showing the project icon, "zerauskii commissions" title, subtitle, and action buttons) occupies a fixed height with no way to resize or collapse it.

1.2 WHEN the user wants to maximise vertical space for the commission board, THEN there is no control available to hide or shrink the header area.

#### Expected Behavior (Correct)

2.1 WHEN the user clicks a collapse toggle on the page header, THEN the system SHALL collapse the header to a minimal bar that shows only the project icon and title, freeing the rest of the vertical space for the board.

2.2 WHEN the header is collapsed and the user clicks the toggle again, THEN the system SHALL expand the header back to its full height.

2.3 WHEN the header collapse state changes, THEN the system SHALL persist the state to `localStorage` under a stable key (e.g., `studio_header_collapsed`) so it survives navigation and page reloads.

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN the header is in its expanded (default) state, THEN the system SHALL CONTINUE TO display the project icon, title, subtitle, and all action buttons as before.

3.2 WHEN the sidebar is resized, THEN the system SHALL CONTINUE TO not affect the header collapse state.

---

## Bug 4 — Placeholder Sidebar Buttons Have No Meaningful Behavior

### Bug Analysis

#### Current Behavior (Defect)

1.1 WHEN the user clicks any of the five placeholder sidebar buttons ("Agentes de IA", "Automatizaciones", "Medios de comunicación", "Integraciones", "Mapa DNA"), THEN the system calls `alert(...)` with a generic "no está disponible aún" message, providing no useful interaction.

1.2 WHEN the alert dialog appears, THEN the user must dismiss it manually and no further navigation or context is provided.

#### Expected Behavior (Correct)

2.1 WHEN the user clicks a placeholder sidebar button, THEN the system SHALL display an inline, non-blocking tooltip or slide-in info panel describing what that feature will do and indicating it is "Próximamente" (coming soon), without interrupting the workflow with a blocking alert dialog.

2.2 WHEN the info panel or tooltip is shown, THEN it SHALL include the feature name, a one-sentence description of its future purpose, and a dismiss action.

2.3 WHEN the user dismisses the info panel or tooltip, THEN the system SHALL close it and return focus to the sidebar without any page navigation.

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user clicks any of the functional NAV_ITEMS (Studio, Solicitudes, Portafolio, Guía, Configuración), THEN the system SHALL CONTINUE TO navigate to the corresponding page as before.

3.2 WHEN the sidebar is resized or the mobile menu is opened/closed, THEN the system SHALL CONTINUE TO function correctly regardless of which placeholder button was last interacted with.

---

## Bug 5 — No Ability to Create Custom Kanban Sections as Floating Panels

### Bug Analysis

#### Current Behavior (Defect)

1.1 WHEN the user views the Kanban board, THEN only the four hardcoded sections defined in `SECTION_IDS` (Backlog, Comisiones Nuevas, En Proceso, En Revisión) are displayed; there is no control to add a new custom column.

1.2 WHEN the user wants a custom workflow stage (e.g., "Revision de Boceto"), THEN there is no UI to create it, and any workaround would require editing `src/config.js` directly.

1.3 WHEN a custom section is conceptually desired, THEN there is no floating panel pattern available in the Kanban view to house preconfigured tools (e.g., a checklist template or timer preset) for that section.

#### Expected Behavior (Correct)

2.1 WHEN the user is in the Kanban (board) view, THEN the system SHALL display an "+ Nueva sección" button at the end of the columns row.

2.2 WHEN the user clicks "+ Nueva sección", THEN the system SHALL open an inline creation form allowing the user to enter a section name and pick an accent color.

2.3 WHEN the user confirms the new section, THEN the system SHALL add a new column to the Kanban board, rendered as a floating panel with the same card-add and drag-drop capabilities as the existing hardcoded columns.

2.4 WHEN a custom section is created, THEN the system SHALL persist its definition (id, label, color) to `localStorage` under a stable key (e.g., `kanban_custom_sections`) so it survives page reloads and navigation.

2.5 WHEN a custom section panel is displayed, THEN it SHALL include a preconfigured tools toolbar (at minimum: "+ Tarjeta", "Limpiar sección", and a color picker to re-accent the column).

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN the Kanban board loads, THEN the system SHALL CONTINUE TO display all four hardcoded sections (Backlog, Comisiones Nuevas, En Proceso, En Revisión) before any custom sections.

3.2 WHEN the user is in "Lista" (list/workflow) view, THEN the system SHALL CONTINUE TO show only the hardcoded sections; custom Kanban sections SHALL NOT appear in the list view.

3.3 WHEN tasks are dragged between columns, THEN the system SHALL CONTINUE TO support drag-and-drop for both hardcoded and custom sections.
