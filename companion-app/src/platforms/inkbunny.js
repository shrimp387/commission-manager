/**
 * inkbunny.js — Publisher module for Inkbunny
 *
 * Uses axios for proper FormData handling (fetch doesn't work correctly with form-data package)
 */

'use strict'

const axios = require('axios')
const FormData = require('form-data')
const sharp = require('sharp')

const IB_BASE = 'https://inkbunny.net'
const DOWNLOAD_TIMEOUT_MS = 30_000

// ── Helpers ───────────────────────────────────────────────────────────────────

async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
    })
    
    const buffer = Buffer.from(response.data)
    const contentType = response.headers['content-type'] || 'image/png'
    return { buffer, contentType }
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new Error('Timeout al descargar la imagen para Inkbunny')
    }
    throw new Error(`Error al descargar imagen: ${err.message}`)
  }
}

/**
 * Generates a thumbnail from an image buffer.
 * @param {Buffer} buffer - Original image buffer
 * @returns {Promise<Buffer>} - Thumbnail buffer (JPEG, max 800x800)
 */
async function generateThumbnail(buffer) {
  try {
    const thumbnail = await sharp(buffer)
      .resize(800, 800, {
        fit: 'inside',        // Mantener aspect ratio
        withoutEnlargement: true, // No agrandar imágenes pequeñas
      })
      .jpeg({ quality: 85 })  // Convertir a JPEG con buena calidad
      .toBuffer()
    
    console.log('[inkbunny] ✅ Thumbnail generated:', thumbnail.length, 'bytes')
    return thumbnail
  } catch (err) {
    console.error('[inkbunny] ⚠ Failed to generate thumbnail:', err.message)
    return null // Retornar null si falla, continuará sin thumbnail
  }
}
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
  console.log('[inkbunny] 🔐 Logging in as:', username)
  const loginParams = new URLSearchParams({ username, password })
  
  let loginRes
  try {
    loginRes = await axios.post(`${IB_BASE}/api_login.php`, loginParams.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  } catch (err) {
    console.error('[inkbunny] ❌ Login request failed:', err.message)
    throw new Error(`Login de Inkbunny fallido: ${err.message}`)
  }

  const loginData = loginRes.data
  console.log('[inkbunny] Login response:', JSON.stringify(loginData))
  const sid = loginData?.sid

  if (!sid) {
    const errorMsg = loginData?.error_message || loginData?.error_code || 'Login de Inkbunny fallido'
    console.error('[inkbunny] ❌ Login failed:', errorMsg)
    console.error('[inkbunny] Full response:', JSON.stringify(loginData))
    throw new Error(errorMsg)
  }
  
  console.log('[inkbunny] ✅ Logged in, sid:', sid.substring(0, 8) + '...')

  // Step 2 — Download and upload file
  console.log('[inkbunny] 📥 Downloading image:', job.image_url)
  const filename = job.image_url?.split('/').pop() || 'artwork.png'
  const { buffer, contentType } = await downloadImage(job.image_url)
  console.log('[inkbunny] ✅ Downloaded:', buffer.length, 'bytes, type:', contentType)

  // Generate thumbnail for better preview (fixes broken preview on large images)
  console.log('[inkbunny] 🖼️  Generating thumbnail...')
  const thumbnailBuffer = await generateThumbnail(buffer)

  console.log('[inkbunny] 📤 Uploading file to Inkbunny...')
  const uploadForm = new FormData()
  // CRITICAL: append sid FIRST before the file
  uploadForm.append('sid', sid)
  uploadForm.append('uploadedfile[0]', buffer, {
    filename,
    contentType, // This sets the Content-Type header for this specific field
  })
  
  // Upload custom thumbnail if generation succeeded
  if (thumbnailBuffer) {
    uploadForm.append('uploadedthumbnail[]', thumbnailBuffer, {
      filename: 'thumb_' + filename.replace(/\.\w+$/, '.jpg'), // .jpg extension
      contentType: 'image/jpeg',
    })
    console.log('[inkbunny] 📎 Custom thumbnail attached')
  }

  // Log FormData content for debugging
  console.log('[inkbunny] FormData fields:', {
    sid: sid.substring(0, 8) + '...',
    filename,
    contentType,
    bufferSize: buffer.length,
    hasThumbnail: !!thumbnailBuffer
  })

  let uploadRes
  try {
    // axios handles FormData correctly - it will use the proper headers and stream
    uploadRes = await axios.post(`${IB_BASE}/api_upload.php`, uploadForm, {
      headers: uploadForm.getHeaders(), // This is the KEY - axios uses form-data headers properly
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
  } catch (err) {
    console.error('[inkbunny] ❌ Upload request failed:', err.message)
    if (err.response) {
      console.error('[inkbunny] Upload error response:', JSON.stringify(err.response.data))
      const errorMsg = err.response.data?.error_message || err.response.data?.error_code || `HTTP ${err.response.status}`
      throw new Error(errorMsg)
    }
    throw err
  }

  const uploadData = uploadRes.data
  console.log('[inkbunny] Upload response:', JSON.stringify(uploadData))
  
  const submissionId = uploadData?.submission_id

  if (!submissionId) {
    const errorMsg = uploadData?.error_message || uploadData?.error_code || 'Error al subir archivo a Inkbunny'
    console.error('[inkbunny] ❌ Upload failed:', errorMsg)
    console.error('[inkbunny] Full upload response:', JSON.stringify(uploadData))
    throw new Error(errorMsg)
  }
  
  console.log('[inkbunny] ✅ Uploaded, submission_id:', submissionId)

  // Step 3 — Edit submission metadata + publish (visibility=yes)
  console.log('[inkbunny] ✏️ Editing submission metadata...')
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
    visibility: 'no',              // ← DRAFT MODE - not published yet, user can review and publish manually
    notify_followers: 'no',        // ← don't notify since it's a draft
    guest_block: 'no',             // ← allow guest access when published
    ...ratingFields,
  })

  const editRes = await axios.post(`${IB_BASE}/api_editsubmission.php`, editParams.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  const editData = editRes.data
  console.log('[inkbunny] Edit response:', JSON.stringify(editData))

  if (editData?.error_message || editData?.error_code) {
    const errorMsg = editData.error_message || editData.error_code || 'Error al editar submission en Inkbunny'
    console.error('[inkbunny] ❌ Edit failed:', errorMsg)
    console.error('[inkbunny] Full edit response:', JSON.stringify(editData))
    throw new Error(errorMsg)
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
    const res = await axios.post(`${IB_BASE}/api_login.php`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    const data = res.data

    if (data?.sid) {
      return { ok: true, username: data.ratingsmask !== undefined ? username : username }
    }

    return { ok: false, error: data?.error_message || 'Login fallido' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { publishInkbunny, testInkbunny }
