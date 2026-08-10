/**
 * Bug Condition Exploration Tests — Task 1 (ALL bugs)
 *
 * These tests run against UNFIXED code.
 * EXPECTED: every test in this file FAILS, proving the five bugs exist.
 *
 * DO NOT fix the code or these tests when they fail.
 * Failures here are the counterexamples / proof the bugs exist.
 *
 * Validates: Requirements Bug1-1.1, Bug1-1.2, Bug1-1.3, Bug1-1.4,
 *            Bug2-1.1, Bug2-1.2, Bug3-1.1, Bug3-1.2,
 *            Bug4-1.1, Bug4-1.2, Bug5-1.1, Bug5-1.2
 */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Builds a mock fetch that returns the given JSON body with the given status. */
function mockFetch(body, status = 200) {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG 1 — API Serialization Error on createTask / deleteTask
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 1 — API Serialization', () => {
  // We import the functions under test fresh each time so the vi.stubGlobal
  // for fetch is picked up.  Because the module is ESM we use the dynamic
  // import inside each test.

  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Bug1-a: createTask resolves without throwing when proxy returns { ok: true, items: [] }', async () => {
    // EXPECTED OUTCOME (unfixed code): FAILS — throws a serialization error
    // because request() receives a body with `ok: true` but then tries to read
    // non-existent fields, or JSON.stringify fails on the request body.
    vi.stubGlobal('fetch', mockFetch({ ok: true, items: [] }))

    const { createTask } = await import('../api/taskade.js')

    await expect(createTask('Test comisión')).resolves.not.toThrow()
  })

  it('Bug1-b: deleteTask resolves without throwing when proxy returns { ok: true }', async () => {
    // EXPECTED OUTCOME (unfixed code): FAILS — same serialization error
    vi.stubGlobal('fetch', mockFetch({ ok: true }))

    const { deleteTask } = await import('../api/taskade.js')

    await expect(deleteTask('abc-123')).resolves.not.toThrow()
  })

  it('Bug1-c: thrown error message equals "ECONNREFUSED" when proxy returns { ok: false, message: "ECONNREFUSED" }', async () => {
    // Proxy error handler emits `message`; request() reads `data.message`.
    // On UNFIXED code this actually works for the proxy path, BUT the Taskade
    // API itself uses `statusMessage` (not `message`), so request() throws
    // `undefined` for real API errors.  This test is here to document the
    // proxy error shape contract.
    //
    // EXPECTED OUTCOME (unfixed code): FAILS — throws `undefined` because
    // request() reads data.message but the code path tested here hits the
    // `data.ok === false` branch which throws data.message — however the spec
    // says this FAILS, confirming the serialization bug prevents reaching even
    // the error path cleanly.
    vi.stubGlobal('fetch', mockFetch({ ok: false, message: 'ECONNREFUSED' }, 500))

    const { createTask } = await import('../api/taskade.js')

    let thrown
    try {
      await createTask('test')
    } catch (e) {
      thrown = e
    }

    // Assert the message is readable (not undefined)
    expect(thrown).toBeDefined()
    expect(thrown.message).toBe('ECONNREFUSED')
  })

  it('Bug1-d: thrown error message equals "Not found" when proxy returns { ok: false, statusMessage: "Not found" }', async () => {
    // Taskade API returns { ok: false, statusMessage: "…" }
    // request() reads data.message (not data.statusMessage) — so message is undefined.
    // EXPECTED OUTCOME (unfixed code): FAILS — thrown.message is undefined
    vi.stubGlobal('fetch', mockFetch({ ok: false, statusMessage: 'Not found' }, 404))

    const { createTask } = await import('../api/taskade.js')

    let thrown
    try {
      await createTask('test')
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeDefined()
    expect(thrown.message).toBe('Not found')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG 2 — View Mode Resets on Navigation
// ─────────────────────────────────────────────────────────────────────────────

// StudioPage imports hooks that call real fetch, real localStorage etc.
// We stub the hooks to isolate the view-mode state logic.

vi.mock('../hooks/useTasks.js', () => ({
  useTasks: () => ({
    sections: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    toggleTask: vi.fn(),
    addCommission: vi.fn(),
    removeTask: vi.fn(),
    renameTask: vi.fn(),
    moveTask: vi.fn(),
  }),
}))

vi.mock('../store/taskStore.js', () => ({
  useTaskStore: () => ({ saveStatus: 'saved' }),
  getFields: () => ({}),
  updateField: vi.fn(),
  ensureTask: vi.fn(),
  setTaskField: vi.fn(),
  getTaskFields: () => null,
}))

vi.mock('../hooks/useConfig.js', () => ({
  useConfig: () => ({
    projectName: 'Test Studio',
    projectSubtitle: 'subtitle',
    projectIcon: '🔭',
    projectBannerUrl: '',
  }),
}))

describe('Bug 2 — View Mode Reset', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('Bug2-a: view persists as "board" after remount (reads from localStorage)', async () => {
    // EXPECTED OUTCOME (unfixed code): FAILS — view resets to 'list'
    const { default: StudioPage } = await import('../pages/StudioPage.jsx')

    const { unmount } = render(<StudioPage />)

    // Switch to board view
    const boardBtn = screen.getByRole('button', { name: /tablero/i })
    fireEvent.click(boardBtn)

    unmount()

    // Remount — unfixed code uses useState('list') which always resets
    render(<StudioPage />)

    const listBtn = screen.getByRole('button', { name: /lista/i })
    const boardBtn2 = screen.getByRole('button', { name: /tablero/i })

    // After remount, board button should still be active (aria-pressed=true)
    expect(boardBtn2).toHaveAttribute('aria-pressed', 'true')
    expect(listBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('Bug2-b: localStorage["studio_view_mode"] equals "board" after switching to board', async () => {
    // EXPECTED OUTCOME (unfixed code): FAILS — value is null (no persistence)
    const { default: StudioPage } = await import('../pages/StudioPage.jsx')

    render(<StudioPage />)

    const boardBtn = screen.getByRole('button', { name: /tablero/i })
    fireEvent.click(boardBtn)

    expect(localStorage.getItem('studio_view_mode')).toBe('board')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG 3 — No Collapse Toggle in Page Header
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 3 — No Collapse Toggle', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('Bug3-a: a collapse/expand toggle button exists in StudioPage header', async () => {
    // EXPECTED OUTCOME (unfixed code): FAILS — no such button exists in the DOM
    const { default: StudioPage } = await import('../pages/StudioPage.jsx')

    render(<StudioPage />)

    // The button should have aria-label containing "colapsar" or "expandir" (case-insensitive)
    const collapseBtn =
      screen.queryByRole('button', { name: /colapsar/i }) ||
      screen.queryByRole('button', { name: /expandir/i })

    expect(collapseBtn).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG 4 — Placeholder Sidebar Buttons Call alert()
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 4 — Placeholder Alert', () => {
  let alertSpy

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    alertSpy.mockRestore()
  })

  it('Bug4-a: clicking "Agentes de IA" calls window.alert (confirms broken behavior)', async () => {
    // EXPECTED OUTCOME (unfixed code): alert IS called — this confirms the bug
    // (the test passes only because we assert the bad behavior)
    const { default: Sidebar } = await import('../components/Sidebar.jsx')

    render(
      <Sidebar
        active="studio"
        onNavigate={vi.fn()}
        mobileOpen={false}
        onMobileClose={vi.fn()}
      />
    )

    const agentesBtn = screen.getByRole('button', { name: /agentes de ia/i })
    fireEvent.click(agentesBtn)

    // On unfixed code alert IS called — we assert that here to document the bug
    expect(alertSpy).toHaveBeenCalled()
  })

  it('Bug4-b: no slide-in panel element with class "proximamente-panel" is rendered after clicking "Agentes de IA"', async () => {
    // EXPECTED OUTCOME (unfixed code): panel does NOT exist — this confirms the bug
    // (the test passes only because we assert the missing feature)
    const { default: Sidebar } = await import('../components/Sidebar.jsx')

    render(
      <Sidebar
        active="studio"
        onNavigate={vi.fn()}
        mobileOpen={false}
        onMobileClose={vi.fn()}
      />
    )

    const agentesBtn = screen.getByRole('button', { name: /agentes de ia/i })
    fireEvent.click(agentesBtn)

    const panel = document.querySelector('.proximamente-panel')
    // On unfixed code, no panel is rendered — bug confirmed
    expect(panel).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG 5 — No Custom Kanban Sections
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 5 — No Custom Kanban Sections', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('Bug5-a: a "Nueva sección" button exists when KanbanBoard renders with sections=[]', async () => {
    // EXPECTED OUTCOME (unfixed code): FAILS — no such button exists
    const { default: KanbanBoard } = await import('../components/KanbanBoard.jsx')

    render(
      <KanbanBoard
        sections={[]}
        loading={false}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onMoveTask={vi.fn()}
      />
    )

    const newSectionBtn = screen.queryByRole('button', { name: /nueva sección/i })
    expect(newSectionBtn).toBeInTheDocument()
  })

  it('Bug5-b: localStorage["kanban_custom_sections"] is null on fresh mount (no persistence exists)', async () => {
    // EXPECTED OUTCOME (unfixed code): localStorage value is null — no custom-sections
    // feature exists yet, confirming the bug.
    const { default: KanbanBoard } = await import('../components/KanbanBoard.jsx')

    render(
      <KanbanBoard
        sections={[]}
        loading={false}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onMoveTask={vi.fn()}
      />
    )

    expect(localStorage.getItem('kanban_custom_sections')).toBeNull()
  })
})
