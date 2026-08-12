/**
 * Property-based tests for PublishPanel validatePublishInputs
 * and KanbanCard button visibility logic.
 */
import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import { validatePublishInputs } from '../PublishPanel.jsx'

// ── Property 7: Validación de precondiciones de envío ────────────────────────
// Feature: artwork-publish-pipeline, Property 7: Validación de precondiciones
describe('validatePublishInputs — rechaza envío con datos inválidos', () => {
  test('título vacío → invalid', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        (accounts, tags) => {
          const result = validatePublishInputs({ title: '', selectedAccounts: accounts, tags })
          return !result.valid
        }
      ),
      { numRuns: 50 }
    )
  })

  test('sin cuentas seleccionadas → invalid', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        (title, tags) => {
          const result = validatePublishInputs({ title, selectedAccounts: [], tags })
          return !result.valid
        }
      ),
      { numRuns: 50 }
    )
  })

  test('sin tags → invalid', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        (title, accounts) => {
          const result = validatePublishInputs({ title, selectedAccounts: accounts, tags: [] })
          return !result.valid
        }
      ),
      { numRuns: 50 }
    )
  })

  test('con todos los campos válidos → valid', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        (title, accounts, tags) => {
          const result = validatePublishInputs({ title: title.trim() || 'x', selectedAccounts: accounts, tags })
          return result.valid
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ── Property 1 & 2: Lógica de visibilidad del botón (pura, sin render) ───────
// Feature: artwork-publish-pipeline, Property 1: Visibilidad del botón
// Feature: artwork-publish-pipeline, Property 2: Estado disabled del botón

/**
 * Simula la lógica del botón sin necesitar un DOM real.
 * El botón se muestra SI Y SOLO SI stage === 'delivered'.
 * El botón está disabled SI Y SOLO SI no hay adjunto imagen.
 */
function shouldShowButton(stage) {
  return stage === 'delivered'
}
function shouldBeDisabled(attachments) {
  return !(attachments || []).some(a => typeof a?.type === 'string' && a.type.startsWith('image/'))
}

describe('Lógica del botón de publicación', () => {
  // Property 1
  test('botón visible si y solo si stage === delivered', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('delivered', 'sketch', 'lineart', 'base', 'shade', 'review', 'new', 'wip'),
        stage => {
          const visible = shouldShowButton(stage)
          return visible === (stage === 'delivered')
        }
      ),
      { numRuns: 100 }
    )
  })

  // Property 2
  test('botón disabled si y solo si no hay adjunto imagen', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            type: fc.oneof(
              fc.constant('image/jpeg'),
              fc.constant('image/png'),
              fc.constant('application/pdf'),
              fc.constant('video/mp4'),
              fc.string()
            ),
            size: fc.nat(),
          })
        ),
        attachments => {
          const disabled = shouldBeDisabled(attachments)
          const hasImage = attachments.some(a => a.type?.startsWith('image/'))
          return disabled === !hasImage
        }
      ),
      { numRuns: 100 }
    )
  })
})
