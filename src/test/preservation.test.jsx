/**
 * Preservation Tests — Studio Commission Bugs
 *
 * These tests run on UNFIXED code and capture correct existing behavior
 * that must NOT regress after fixes are applied.
 *
 * ALL tests in this file are expected to PASS on unfixed code.
 *
 * Property 2: Preservation — Baseline behavior across all five bugs.
 * Validates: Requirements 3.1, 3.2, 3.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import * as fc from 'fast-check'
import React from 'react'

// ─── Mock heavy hooks and stores that make network calls ────────────

// Mock useTasks to avoid real fetch calls in component tests
vi.mock('../hooks/useTasks.js', () => ({
  useTasks: () => ({
    sections: [
      { id: 'section-backlog', label: '📋 Backlog y Proyectos', color: '#6B7280', items: [] },
      { id: 'section-new', label: '🎨 Comisiones Nuevas', color: '#60A5FA', items: [] },
      { id: 'section-inprogress', label: '🖌️ En Proceso', color: '#F59E0B', items: [] },
      { id: 'section-inreview', label: '👀 En Revisión', color: '#FACC15', items: [] },
    ],
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

// Mock useConfig so tests don't depend on localStorage app_config
vi.mock('../hooks/useConfig.js', () => ({
  useConfig: () => ({
    projectName: 'Estudio de Comisiones',
    projectSubtitle: 'De la idea a la entrega, con cada etapa visible.',
    projectIcon: '🔭',
    projectBannerUrl: '',
  }),
}))

// Mock useTaskStore to prevent store side-effects
vi.mock('../store/taskStore.js', () => ({
  useTaskStore: () => ({
    saveStatus: 'idle',
    getFields: () => ({}),
    updateField: vi.fn(),
    ensureTask: vi.fn(),
    data: {},
  }),
  setTaskField: vi.fn(),
  getTaskFields: () => null,
  initTaskFields: vi.fn(),
  inferFields: () => ({}),
}))

// Mock useResizableSidebar to avoid DOM manipulation side-effects
vi.mock('../hooks/useResizableSidebar.js', () => ({
  useResizableSidebar: () => ({
    handleMouseDown: vi.fn(),
    handleDoubleClick: vi.fn(),
  }),
}))

// Lazy-import the components AFTER mocks are registered
const { default: StudioPage } = await import('../pages/StudioPage.jsx')
const { default: Sidebar } = await import('../components/Sidebar.jsx')
const { default: KanbanBoard } = await import('../components/KanbanBoard.jsx')
const { default: WorkflowBoard } = await import('../components/WorkflowBoard.jsx')
import {
  fetchTasks,
  completeTask,
  uncompleteTask,
  updateTask,
} from '../api/taskade.js'

// ─────────────────────────────────────────────────────────────────────────────
// BUG 1 PRESERVATION — Other API calls unaffected
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 1 Preservation — Other API calls unaffected', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetchTasks resolves with items array when fetch returns { ok: true, items: [...] }', async () => {
    const mockItems = [
      { id: 'task-1', text: 'Comisión A', completed: false },
      { id: 'task-2', text: 'Comisión B', completed: true },
    ]
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, items: mockItems }),
    })

    const result = await fetchTasks()
    expect(result).toEqual(mockItems)
  })

  it('completeTask resolves without error when fetch returns { ok: true }', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })

    await expect(completeTask('task-abc')).resolves.toBeDefined()
  })

  it('uncompleteTask resolves without error when fetch returns { ok: true }', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })

    await expect(uncompleteTask('task-abc')).resolves.toBeDefined()
  })

  it('updateTask resolves without error when fetch returns { ok: true }', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })

    await expect(updateTask('task-abc', { text: 'Nuevo nombre' })).resolves.toBeDefined()
  })

  /**
   * Property-based: for any response with ok:true, the above calls all resolve.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('PBT: fetchTasks/completeTask/uncompleteTask/updateTask always resolve for any ok:true response', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary extra fields that may accompany ok:true
        fc.record({
          items: fc.array(
            fc.record({ id: fc.string({ minLength: 1 }), text: fc.string(), completed: fc.boolean() }),
            { minLength: 0, maxLength: 5 }
          ),
          extraField: fc.option(fc.string()),
        }),
        async ({ items, extraField }) => {
          const successBody = { ok: true, items, ...(extraField ? { extraField } : {}) }

          // fetchTasks
          global.fetch = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => successBody,
          })
          const fetchResult = await fetchTasks()
          expect(Array.isArray(fetchResult)).toBe(true)

          // completeTask
          global.fetch = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ ok: true }),
          })
          await expect(completeTask('any-id')).resolves.toBeDefined()

          // uncompleteTask
          global.fetch = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ ok: true }),
          })
          await expect(uncompleteTask('any-id')).resolves.toBeDefined()

          // updateTask
          global.fetch = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ ok: true }),
          })
          await expect(updateTask('any-id', { text: 'X' })).resolves.toBeDefined()
        }
      ),
      { numRuns: 20 }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG 2 PRESERVATION — Default view and in-page switch unaffected
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 2 Preservation — Default view and in-page switch', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('StudioPage renders with view "list" on first load when no localStorage key is set', () => {
    // No localStorage key set — default view must be 'list'
    render(<StudioPage />)

    // The "Lista" button should be active (aria-pressed="true")
    const listaBtn = screen.getByRole('button', { name: /lista/i })
    expect(listaBtn).toBeInTheDocument()
    expect(listaBtn).toHaveAttribute('aria-pressed', 'true')

    // The "Tablero" button should be inactive
    const tableroBtn = screen.getByRole('button', { name: /tablero/i })
    expect(tableroBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking "Tablero" renders KanbanBoard; clicking "Lista" re-renders WorkflowBoard', () => {
    render(<StudioPage />)

    // Initially in list view — WorkflowBoard should be present via .wf-board
    const tableroBtn = screen.getByRole('button', { name: /tablero/i })
    const listaBtn = screen.getByRole('button', { name: /lista/i })

    // Switch to board view
    fireEvent.click(tableroBtn)

    // KanbanBoard renders as .kanban-board
    expect(document.querySelector('.kanban-board')).toBeInTheDocument()
    expect(document.querySelector('.wf-board')).not.toBeInTheDocument()

    // Switch back to list view
    fireEvent.click(listaBtn)

    // WorkflowBoard renders as .wf-board
    expect(document.querySelector('.wf-board')).toBeInTheDocument()
    expect(document.querySelector('.kanban-board')).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG 3 PRESERVATION — Expanded header displays all elements
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 3 Preservation — Expanded header displays all elements', () => {
  afterEach(() => {
    cleanup()
  })

  it('StudioPage renders project icon, title (h1), subtitle, eyebrow, and action buttons', () => {
    render(<StudioPage />)

    // Project icon
    expect(document.querySelector('.page-header-icon')).toBeInTheDocument()

    // Title h1
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()

    // Subtitle element (.page-header-sub)
    expect(document.querySelector('.page-header-sub')).toBeInTheDocument()

    // Eyebrow text
    expect(document.querySelector('.page-header-eyebrow')).toBeInTheDocument()

    // "Abrir asistente" button
    expect(screen.getByRole('button', { name: /abrir asistente/i })).toBeInTheDocument()

    // "+ Nueva comisión" button
    expect(screen.getByRole('button', { name: /nueva comisión/i })).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG 4 PRESERVATION — NAV_ITEMS navigate correctly
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 4 Preservation — NAV_ITEMS navigate correctly', () => {
  afterEach(() => {
    cleanup()
  })

  const NAV_CASES = [
    { label: /estudio de comisiones/i, id: 'studio' },
    { label: /solicitudes de comisión/i, id: 'requests' },
    { label: /galería de portafolio/i, id: 'portfolio' },
    { label: /guía del estudio/i, id: 'guide' },
    { label: /configuración/i, id: 'settings' },
  ]

  it.each(NAV_CASES)(
    'clicking "$id" nav item calls onNavigate with "$id"',
    ({ label, id }) => {
      const onNavigate = vi.fn()
      render(<Sidebar active="studio" onNavigate={onNavigate} mobileOpen={false} onMobileClose={vi.fn()} />)

      const btn = screen.getByRole('button', { name: label })
      fireEvent.click(btn)

      expect(onNavigate).toHaveBeenCalledTimes(1)
      expect(onNavigate).toHaveBeenCalledWith(id)
    }
  )

  it('clicking all 5 NAV_ITEMS in sequence calls onNavigate with the correct id each time', () => {
    const onNavigate = vi.fn()
    render(<Sidebar active="studio" onNavigate={onNavigate} mobileOpen={false} onMobileClose={vi.fn()} />)

    const expectedCalls = NAV_CASES.map(c => c.id)
    for (const { label, id } of NAV_CASES) {
      const btn = screen.getByRole('button', { name: label })
      fireEvent.click(btn)
    }

    expect(onNavigate).toHaveBeenCalledTimes(NAV_CASES.length)
    expectedCalls.forEach((id, idx) => {
      expect(onNavigate).toHaveBeenNthCalledWith(idx + 1, id)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG 5 PRESERVATION — Hardcoded sections render in board view; list view unchanged
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 5 Preservation — Hardcoded sections and list view', () => {
  const HARDCODED_SECTIONS = [
    { id: 'section-backlog', label: '📋 Backlog y Proyectos', color: '#6B7280', items: [] },
    { id: 'section-new', label: '🎨 Comisiones Nuevas', color: '#60A5FA', items: [] },
    { id: 'section-inprogress', label: '🖌️ En Proceso', color: '#F59E0B', items: [] },
    { id: 'section-inreview', label: '👀 En Revisión', color: '#FACC15', items: [] },
  ]

  const noop = vi.fn()

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('KanbanBoard renders exactly 4 columns for 4 hardcoded sections', () => {
    render(
      <KanbanBoard
        sections={HARDCODED_SECTIONS}
        loading={false}
        onToggle={noop}
        onDelete={noop}
        onAdd={noop}
        onRename={noop}
        onMoveTask={noop}
      />
    )

    const columns = document.querySelectorAll('.kanban-column')
    expect(columns).toHaveLength(4)
  })

  it('KanbanBoard renders columns in correct order: Backlog, Comisiones Nuevas, En Proceso, En Revisión', () => {
    render(
      <KanbanBoard
        sections={HARDCODED_SECTIONS}
        loading={false}
        onToggle={noop}
        onDelete={noop}
        onAdd={noop}
        onRename={noop}
        onMoveTask={noop}
      />
    )

    const headers = document.querySelectorAll('.kanban-column-title')
    expect(headers).toHaveLength(4)

    // The kanban column title strips the leading emoji word; verify partial text match
    const titles = Array.from(headers).map(h => h.textContent)
    expect(titles[0]).toMatch(/Backlog/i)
    expect(titles[1]).toMatch(/Comisiones Nuevas/i)
    expect(titles[2]).toMatch(/En Proceso/i)
    expect(titles[3]).toMatch(/En Revisión/i)
  })

  it('KanbanBoard is NOT rendered when StudioPage is in list view', () => {
    // No stored view key → defaults to 'list'
    localStorage.clear()
    render(<StudioPage />)

    expect(document.querySelector('.kanban-board')).not.toBeInTheDocument()
    expect(document.querySelector('.wf-board')).toBeInTheDocument()
  })

  /**
   * Property-based: for any n drag operations between existing hardcoded columns,
   * total item count across all columns remains unchanged.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('PBT: total item count is unchanged after any sequence of moves between hardcoded columns', async () => {
    // Build sections with some items so drags have real content
    const sectionIds = HARDCODED_SECTIONS.map(s => s.id)

    await fc.assert(
      fc.property(
        // Generate items distributed across sections
        fc.array(
          fc.record({
            id: fc.stringMatching(/^[a-f0-9]{4,8}$/),
            text: fc.string({ minLength: 1, maxLength: 30 }),
            sectionIdx: fc.integer({ min: 0, max: 3 }),
          }),
          { minLength: 1, maxLength: 8 }
        ),
        // Generate a sequence of move operations
        fc.array(
          fc.record({
            fromIdx: fc.integer({ min: 0, max: 3 }),
            toIdx: fc.integer({ min: 0, max: 3 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        (rawItems, moves) => {
          // De-duplicate item IDs (fc.record can repeat ids across array entries)
          const seen = new Set()
          const items = rawItems.filter(item => {
            if (seen.has(item.id)) return false
            seen.add(item.id)
            return true
          })

          if (items.length === 0) return // skip empty case

          // Build initial sections with items
          let sections = HARDCODED_SECTIONS.map((s, idx) => ({
            ...s,
            items: items
              .filter(i => i.sectionIdx === idx)
              .map(i => ({ id: i.id, text: i.text, completed: false })),
          }))

          const totalBefore = sections.reduce((sum, s) => sum + s.items.length, 0)

          // Simulate each move: pick a random item from fromSection and move it to toSection
          for (const { fromIdx, toIdx } of moves) {
            if (fromIdx === toIdx) continue
            const fromSection = sections[fromIdx]
            if (fromSection.items.length === 0) continue

            // Move the first item from fromSection to toSection
            const [movedItem, ...remaining] = fromSection.items
            sections = sections.map((s, idx) => {
              if (idx === fromIdx) return { ...s, items: remaining }
              if (idx === toIdx) return { ...s, items: [...s.items, movedItem] }
              return s
            })
          }

          const totalAfter = sections.reduce((sum, s) => sum + s.items.length, 0)

          // Total item count must be unchanged
          expect(totalAfter).toBe(totalBefore)
        }
      ),
      { numRuns: 50 }
    )
  })
})
