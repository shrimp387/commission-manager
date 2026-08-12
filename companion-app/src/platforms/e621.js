/**
 * e621.js — Publisher module for e621.net
 *
 * Strategy: Opens the system browser on e621's upload page with tags
 * pre-filled in the URL. The image is downloaded to a temp folder so
 * the artist can drag-and-drop it into the browser form.
 *
 * Why browser instead of API?
 *   - e621 API requires account standing/approved uploader status
 *   - Browser approach works for every account out-of-the-box
 *   - Artist keeps full control over the final submission
 */

'use strict'

const { shell } = require('electron')
const path      = require('path')
const fs        = require('fs')
const os        = require('os')

const E621_UPLOAD_URL = 'https://e621.net/uploads/new'
const DOWNLOAD_TIMEOUT_MS = 30_000

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Downloads the image to a temp file so the artist can drag it into the browser.
 * Returns the local file path.
 */
async function downloadToTemp(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Timeout al descargar la imagen para e621')
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`Error al descargar imagen: HTTP ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/png'
  const ext = contentType.split('/')[1]?.split(';')[0] || 'png'
  const filename = `e621_upload_${Date.now()}.${ext}`
  const tmpPath = path.join(os.tmpdir(), filename)

  fs.writeFileSync(tmpPath, buffer)
  return tmpPath
}

/**
 * Builds the e621 upload URL with tags and source pre-filled.
 * e621 upload form accepts ?upload[tag_string]=...&upload[source]=...
 */
function buildUploadUrl(job) {
  const tags    = (job.tags ?? []).join(' ')
  const source  = job.image_url ?? ''
  const rating  = job.rating === 'explicit' ? 'e' : job.rating === 'questionable' ? 'q' : 's'

  const params = new URLSearchParams({
    'upload[tag_string]': tags,
    'upload[source]':     source,
    'upload[rating]':     rating,
    'upload[description]': job.description ?? '',
  })

  return `${E621_UPLOAD_URL}?${params.toString()}`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Opens the e621 upload page in the system browser with tags pre-filled,
 * and downloads the image to a temp folder for drag-and-drop.
 *
 * @param {object} job         — publish job from Supabase
 * @param {object} credentials — { username, apiKey, enabled } (not used for browser flow)
 * @returns {Promise<{ ok: true, url: string, tempFile: string }>}
 */
async function publishE621(job, credentials) {
  // Download image to temp so artist can drag it in
  let tempFile = null
  try {
    tempFile = await downloadToTemp(job.image_url)
    console.log(`[e621] Image downloaded to: ${tempFile}`)

    // Open temp folder so the artist sees the file
    shell.showItemInFolder(tempFile)
  } catch (err) {
    console.warn(`[e621] Could not download image: ${err.message}`)
    // Not fatal — browser flow still works with source URL
  }

  // Open e621 upload page with tags pre-filled
  const uploadUrl = buildUploadUrl(job)
  await shell.openExternal(uploadUrl)

  console.log(`[e621] Opened browser: ${uploadUrl}`)

  return {
    ok: true,
    url: uploadUrl,
    tempFile,
    note: 'Navegador abierto con tags pre-cargados. Arrastra la imagen descargada al formulario.',
  }
}

/**
 * Tests e621 credentials by checking the user profile page.
 *
 * @param {object} credentials — { username, apiKey }
 * @returns {Promise<{ ok: boolean, username?: string, error?: string }>}
 */
async function testE621(credentials) {
  const { username, apiKey } = credentials ?? {}

  if (!username || !apiKey) {
    return { ok: false, error: 'Credenciales de e621 incompletas' }
  }

  try {
    const authHeader = 'Basic ' + Buffer.from(`${username}:${apiKey}`).toString('base64')
    const res = await fetch(`https://e621.net/users/${encodeURIComponent(username)}.json`, {
      headers: {
        Authorization: authHeader,
        'User-Agent': 'CommissionManagerCompanion/1.0 (contact: woundzengberg)',
      },
    })

    if (res.ok) {
      return { ok: true, username }
    }

    try {
      const json = await res.json()
      return { ok: false, error: json.reason || json.message || `HTTP ${res.status}` }
    } catch {
      return { ok: false, error: `HTTP ${res.status}` }
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { publishE621, testE621 }
