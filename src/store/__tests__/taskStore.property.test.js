/**
 * Property-based tests for taskStore.js
 * Feature: artwork-publish-pipeline, Property 6: Round-trip de persistencia de publishTags
 */
import { describe, test, beforeEach } from 'vitest'
import fc from 'fast-check'
import { setTaskField, getTaskFields } from '../taskStore.js'
import { normalizeTag } from '../../lib/tagGenerator.js'

// ── Property 6: Round-trip de persistencia de publishTags ────────────────────
// Feature: artwork-publish-pipeline, Property 6: Round-trip de publishTags
describe('taskStore — round-trip de publishTags', () => {
  test('updateField + getFields retorna el mismo array de tags', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.string({ minLength: 1 }).map(s => normalizeTag(s)).filter(s => s.length > 0),
          { maxLength: 200 }
        ),
        (taskId, tags) => {
          setTaskField(taskId, 'publishTags', tags)
          const retrieved = getTaskFields(taskId)?.publishTags
          if (!retrieved) return tags.length === 0
          return (
            retrieved.length === tags.length &&
            retrieved.every((t, i) => t === tags[i])
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
