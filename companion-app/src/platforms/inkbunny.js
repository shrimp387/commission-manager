/**
 * inkbunny.js — Publisher module for Inkbunny
 *
 * Uses Node.js built-in fetch (Node 18+) — no node-fetch dependency needed.
 */

'use strict'

const FormData = require('form-data')

const IB_BASE = 'https://inkbunny.net'
const DOWNLOAD_TIMEOUT_MS = 30_000

// ── Helpers ───────────────────────────────────────────────────────────────────

async function downloadImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Timeout al descargar la imagen para Inkbunny')
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`Error al descargar imagen: HTTP ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/png'
  return { buffer, contentType }
}

/**
 * Extracts error_message from an Inkbunny API response.
 */
async function extractError(res) {
  try {
    const json = await res.json()
    return json.error_message || json.error || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Publishes an artwork job to Inkbunny via their 3-step API.
 *
 * @param {object} job         — publish job from Supabase
 * @param {object} credentials — { username, password, enabled }
 * @returns {Promise<{ ok: true, url: string }>}
 */
async function publishInkbunny(job, credentials) {
  const { username, password } = credentials ?? {}

  if (!username || !password) {
    throw new Error('Credenciales de Inkbunny incompletas')
  }

  // Step 1 — Login to get session ID
  const loginParams = new URLSearchParams({ username, password })
  const loginRes = await fetch(`${IB_BASE}/api_login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginParams.toString(),
  })

  const loginData = await loginRes.json().catch(() => ({}))
  const sid = loginData?.sid

  if (!sid) {
    throw new Error(loginData?.error_message || 'Login de Inkbunny fallido')
  }

  // Step 2 — Download and upload file
  const filename = job.image_url?.split('/').pop() || 'artwork.png'
  const { buffer, contentType } = await downloadImage(job.image_url)

  const uploadForm = new FormData()
  uploadForm.append('sid', sid)
  uploadForm.append('uploadedfile[0]', buffer, { filename, contentType })

  const uploadRes = await fetch(`${IB_BASE}/api_upload.php`, {
    method: 'POST',
    headers: uploadForm.getHeaders(),
    body: uploadForm,
  })

  const uploadData = await uploadRes.json().catch(() => ({}))
  const submissionId = uploadData?.submission_id

  if (!uploadRes.ok || !submissionId) {
    throw new Error(uploadData?.error_message || `Error al subir archivo a Inkbunny: HTTP ${uploadRes.status}`)
  }

  // Step 3 — Edit submission metadata + publish (visibility=yes)
  // Map rating to Inkbunny's content rating system:
  //   guest_block=no → accessible publicly
  //   type: '1'      → Picture/Pinup
  const ratingMap = {
    safe:         { tag_list_two_tagsintext: '0', tag_list_three_tagsintext: '0' },
    questionable: { tag_list_two_tagsintext: '1', tag_list_three_tagsintext: '0' },
    explicit:     { tag_list_two_tagsintext: '1', tag_list_three_tagsintext: '1' },
  }
  const ratingFields = ratingMap[job.rating] ?? ratingMap.safe

  const editParams = new URLSearchParams({
    sid,
    submission_id: submissionId,
    title: job.title ?? '',
    desc: job.description ?? '',
    keywords: (job.tags ?? []).join(' '),
    type: '1',                     // 1 = Picture/Pinup
    visibility: 'yes',             // ← publish immediately (not draft)
    notify_followers: 'yes',       // ← notify watchers
    guest_block: 'no',             // ← allow guest access
    ...ratingFields,
  })

  const editRes = await fetch(`${IB_BASE}/api_editsubmission.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: editParams.toString(),
  })

  const editData = await editRes.json().catch(() => ({}))

  if (!editRes.ok) {
    throw new Error(editData?.error_message || `Error al editar submission en Inkbunny: HTTP ${editRes.status}`)
  }

  const submissionUrl = `${IB_BASE}/s/${submissionId}`
  console.log(`[inkbunny] ✅ Published: ${submissionUrl}`)
  return { ok: true, url: submissionUrl }
}

/**
 * Tests Inkbunny credentials by attempting login only.
 *
 * @param {object} credentials — { username, password }
 * @returns {Promise<{ ok: boolean, username?: string, error?: string }>}
 */
async function testInkbunny(credentials) {
  const { username, password } = credentials ?? {}

  if (!username || !password) {
    return { ok: false, error: 'Credenciales de Inkbunny incompletas' }
  }

  try {
    const params = new URLSearchParams({ username, password })
    const res = await fetch(`${IB_BASE}/api_login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    const data = await res.json().catch(() => ({}))

    if (data?.sid) {
      return { ok: true, username: data.ratingsmask !== undefined ? username : username }
    }

    return { ok: false, error: data?.error_message || 'Login fallido' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { publishInkbunny, testInkbunny }
