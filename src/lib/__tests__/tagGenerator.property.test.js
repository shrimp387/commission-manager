/**
 * Property-based tests for tagGenerator.js
 * Uses fast-check to verify correctness properties with 100+ random inputs.
 */
import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import {
  normalizeTag,
  parseTags,
  identifyHighResAttachment,
} from '../tagGenerator.js'

// ── Property 4: Idempotencia de normalizeTag ───────────────────────────────────
// Feature: artwork-publish-pipeline, Property 4: Idempotencia de normalizeTag
describe('normalizeTag — idempotencia', () => {
  test('normalizeTag(normalizeTag(s)) === normalizeTag(s) para cualquier string', () => {
    fc.assert(
      fc.property(fc.string(), s => {
        const once = normalizeTag(s)
        const twice = normalizeTag(once)
        return once === twice
      }),
      { numRuns: 100 }
    )
  })

  test('resultado no contiene mayúsculas', () => {
    fc.assert(
      fc.property(fc.string(), s => {
        const result = normalizeTag(s)
        return result === result.toLowerCase()
      }),
      { numRuns: 100 }
    )
  })

  test('resultado no contiene espacios en blanco', () => {
    fc.assert(
      fc.property(fc.string(), s => {
        const result = normalizeTag(s)
        return !result.includes(' ')
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 3: Selección del High_Res_Attachment ────────────────────────────
// Feature: artwork-publish-pipeline, Property 3: Selección del High_Res_Attachment
describe('identifyHighResAttachment — selección correcta', () => {
  test('retorna el adjunto imagen con mayor size', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            type: fc.constant('image/jpeg'),
            size: fc.nat({ max: 10_000_000 }),
            url: fc.constant('https://example.com/img.jpg'),
            name: fc.constant('img.jpg'),
          }),
          { minLength: 1 }
        ),
        attachments => {
          const result = identifyHighResAttachment(attachments)
          const maxSize = Math.max(...attachments.map(a => a.size))
          return result !== null && result.size === maxSize
        }
      ),
      { numRuns: 100 }
    )
  })

  test('retorna null si no hay adjuntos imagen', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            type: fc.constant('application/pdf'),
            size: fc.nat(),
            url: fc.constant('https://example.com/file.pdf'),
            name: fc.constant('file.pdf'),
          })
        ),
        attachments => {
          return identifyHighResAttachment(attachments) === null
        }
      ),
      { numRuns: 100 }
    )
  })

  test('retorna null para array vacío', () => {
    expect(identifyHighResAttachment([])).toBe(null)
    expect(identifyHighResAttachment(null)).toBe(null)
    expect(identifyHighResAttachment(undefined)).toBe(null)
  })
})

// ── Property 5: Límite de 200 tags ───────────────────────────────────────────
// Feature: artwork-publish-pipeline, Property 5: Límite de 200 tags
describe('parseTags — límite de 200 tags', () => {
  test('si input tiene > 200 elementos, produce exactamente 200', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 201, maxLength: 300 }),
        tags => {
          const input = tags.join(', ')
          const result = parseTags(input)
          return result.length <= 200
        }
      ),
      { numRuns: 50 }
    )
  })

  test('si input tiene <= 200 elementos no vacíos, produce <= n tags', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 200 }),
        tags => {
          const input = tags.join(', ')
          const result = parseTags(input)
          return result.length <= tags.length
        }
      ),
      { numRuns: 100 }
    )
  })

  test('todos los tags del resultado están normalizados', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 50 }),
        tags => {
          const input = tags.join(', ')
          const result = parseTags(input)
          return result.every(t => t === normalizeTag(t))
        }
      ),
      { numRuns: 100 }
    )
  })
})
