/**
 * Property-based tests for publicationsDb.js
 * Uses fast-check to verify schema integrity and immutability.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'

// ── Mock Supabase so tests run without a real DB ──────────────────────────────
vi.mock('../../lib/supabase.js', () => ({ supabase: null }))
vi.mock('../../lib/db.js', () => ({ getCurrentUserId: () => 'test-user-123' }))

import { savePublication, loadPublications, patchPublicationStatus } from '../publicationsDb.js'

// ── Arbitrary for a valid Publication_Record ─────────────────────────────────
const validRecord = fc.record({
  id: fc.uuid(),
  taskId: fc.uuid(),
  taskName: fc.string({ minLength: 1, maxLength: 100 }),
  imageUrl: fc.webUrl(),
  platforms: fc.array(fc.string({ minLength: 1 }), { maxLength: 10 }),
  status: fc.constantFrom('queued', 'published', 'error'),
  errorMessage: fc.option(fc.string(), { nil: null }),
  postybirbSubmissionId: fc.string(),
  sentAt: fc.date().map(d => d.toISOString()),
  userId: fc.constant('test-user-123'),
})

// ── Property 8: Integridad del schema de Publication_Record ──────────────────
// Feature: artwork-publish-pipeline, Property 8: Integridad del schema
describe('savePublication — integridad del schema', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('todo record guardado contiene los campos requeridos', async () => {
    await fc.assert(
      fc.asyncProperty(validRecord, async record => {
        await savePublication(record)
        const { records } = await loadPublications()
        const found = records.find(r => r.id === record.id)
        if (!found) return false
        // Verificar que todos los campos requeridos están presentes
        const requiredFields = ['id', 'taskId', 'taskName', 'imageUrl', 'platforms',
          'status', 'errorMessage', 'postybirbSubmissionId', 'sentAt', 'userId']
        return requiredFields.every(f => f in found)
      }),
      { numRuns: 20 }
    )
  })

  test('status es siempre uno de los valores válidos', async () => {
    await fc.assert(
      fc.asyncProperty(validRecord, async record => {
        await savePublication(record)
        const { records } = await loadPublications()
        const found = records.find(r => r.id === record.id)
        return found ? ['queued', 'published', 'error'].includes(found.status) : false
      }),
      { numRuns: 20 }
    )
  })
})

// ── Property 9: Inmutabilidad de campos al actualizar status ─────────────────
// Feature: artwork-publish-pipeline, Property 9: Inmutabilidad en patch de status
describe('patchPublicationStatus — inmutabilidad de otros campos', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('patch de status no modifica otros campos del record', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRecord,
        fc.constantFrom('queued', 'published', 'error'),
        async (record, newStatus) => {
          await savePublication(record)
          await patchPublicationStatus(record.id, newStatus)
          const { records } = await loadPublications()
          const found = records.find(r => r.id === record.id)
          if (!found) return false
          // Status can change, but other immutable fields must not
          return (
            found.id                    === record.id &&
            found.taskId                === record.taskId &&
            found.taskName              === record.taskName &&
            found.postybirbSubmissionId === record.postybirbSubmissionId &&
            found.sentAt                === record.sentAt &&
            found.userId                === record.userId
          )
        }
      ),
      { numRuns: 20 }
    )
  })
})
