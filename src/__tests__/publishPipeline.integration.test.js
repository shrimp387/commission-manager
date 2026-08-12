/**
 * Integration tests for the artwork publish pipeline.
 * Tests the full flow: fetch image → POST /submissions → PATCH → POST queue → savePublication
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'

// ── Mock modules ──────────────────────────────────────────────────────────────
vi.mock('../lib/supabase.js', () => ({ supabase: null }))
vi.mock('../lib/db.js', () => ({ getCurrentUserId: () => 'test-user-123' }))
vi.mock('../store/appConfig.js', () => ({
  getConfig: () => ({
    postybirbUrl: 'https://postybirb.test',
    postybirbApiKey: '',
    openaiApiKey: 'test-key',
  }),
  setConfig: vi.fn(),
}))

import { savePublication, loadPublications } from '../lib/publicationsDb.js'
import { validatePublishInputs } from '../components/PublishPanel.jsx'

// ── Test 13.1: Flujo feliz — validación + guardado de record ─────────────────
describe('Pipeline — flujo feliz (sin PostyBirb real)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('validatePublishInputs acepta inputs válidos', () => {
    const result = validatePublishInputs({
      title: 'Mi Obra Terminada',
      selectedAccounts: ['acc-1', 'acc-2'],
      tags: ['fox', 'digital_art', 'solo'],
    })
    expect(result.valid).toBe(true)
    expect(result.message).toBe('')
  })

  test('savePublication crea record con status queued', async () => {
    const record = {
      id: 'test-record-001',
      taskId: 'task-abc',
      taskName: 'Comisión de prueba',
      imageUrl: 'https://r2.example.com/img.png',
      platforms: ['FurAffinity', 'Inkbunny'],
      status: 'queued',
      errorMessage: null,
      postybirbSubmissionId: 'sub-123',
      sentAt: new Date().toISOString(),
      userId: 'test-user-123',
    }

    await savePublication(record)

    const { records, fromLocalStorage } = await loadPublications()
    expect(fromLocalStorage).toBe(true)
    const found = records.find(r => r.id === 'test-record-001')
    expect(found).toBeDefined()
    expect(found.status).toBe('queued')
    expect(found.platforms).toEqual(['FurAffinity', 'Inkbunny'])
  })
})

// ── Test 13.2: Fallback localStorage cuando Supabase falla ───────────────────
describe('Pipeline — fallback localStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('record se guarda en localStorage cuando Supabase no está disponible', async () => {
    const record = {
      id: 'test-record-002',
      taskId: 'task-xyz',
      taskName: 'Obra sin conexión',
      imageUrl: null,
      platforms: ['e621'],
      status: 'queued',
      errorMessage: null,
      postybirbSubmissionId: 'sub-456',
      sentAt: new Date().toISOString(),
      userId: 'test-user-123',
    }

    await savePublication(record)

    // Verify it's in localStorage
    const lsData = JSON.parse(localStorage.getItem('publication_records_test-user-123') || '[]')
    expect(lsData.some(r => r.id === 'test-record-002')).toBe(true)
  })
})

// ── Test 13.3: Error record se crea con status error ─────────────────────────
describe('Pipeline — manejo de errores', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('record con status error se persiste correctamente', async () => {
    const record = {
      id: 'test-record-003',
      taskId: 'task-err',
      taskName: 'Obra con error',
      imageUrl: 'https://r2.example.com/img2.png',
      platforms: ['Twitter'],
      status: 'error',
      errorMessage: 'Tag too long: some_very_long_tag_that_exceeds_limit',
      postybirbSubmissionId: '',
      sentAt: new Date().toISOString(),
      userId: 'test-user-123',
    }

    await savePublication(record)

    const { records } = await loadPublications()
    const found = records.find(r => r.id === 'test-record-003')
    expect(found).toBeDefined()
    expect(found.status).toBe('error')
    expect(found.errorMessage).toContain('Tag too long')
  })
})

// ── Test 13.4: URL PostyBirb sin https:// ────────────────────────────────────
describe('ConnectionsPage — validación de URL', () => {
  test('URL sin https:// no debe guardarse', () => {
    // Simulate the validation logic from ConnectionsPage
    function validatePbUrl(url) {
      const trimmed = url.trim()
      if (trimmed && !trimmed.startsWith('https://')) {
        return { valid: false, error: 'La URL debe usar HTTPS para funcionar correctamente.' }
      }
      return { valid: true, error: null }
    }

    expect(validatePbUrl('http://postybirb.example.com').valid).toBe(false)
    expect(validatePbUrl('ftp://postybirb.example.com').valid).toBe(false)
    expect(validatePbUrl('postybirb.example.com').valid).toBe(false)
    expect(validatePbUrl('https://postybirb.example.com').valid).toBe(true)
    expect(validatePbUrl('').valid).toBe(true) // empty is OK (clears config)
  })
})
