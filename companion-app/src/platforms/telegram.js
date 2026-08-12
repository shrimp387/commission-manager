/**
 * telegram.js — Publisher module for Telegram
 *
 * Uses Node.js built-in fetch (Node 18+) — no node-fetch dependency needed.
 */

'use strict'

const FormData = require('form-data')

const DOWNLOAD_TIMEOUT_MS = 30_000
const CAPTION_MAX = 1024

// ── Helpers ───────────────────────────────────────────────────────────────────

function botUrl(botToken, method) {
  return `https://api.telegram.org/bot${botToken}/${method}`
}

async function downloadImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Timeout al descargar la imagen para Telegram')
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`Error al descargar imagen: HTTP ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  return { buffer, contentType }
}

/**
 * Returns true if the Telegram error indicates the file is too large.
 */
function isSizeTooLargeError(description) {
  if (!description) return false
  const lower = description.toLowerCase()
  return lower.includes('too large') || lower.includes('file size') || lower.includes('413')
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Publishes an artwork job to a Telegram chat/channel.
 *
 * @param {object} job         — publish job from Supabase
 * @param {object} credentials — { botToken, chatId, enabled }
 * @returns {Promise<{ ok: true, url: null }>}
 */
async function publishTelegram(job, credentials) {
  const { botToken, chatId } = credentials ?? {}

  if (!botToken || !chatId) {
    throw new Error('Bot token y chat ID de Telegram son requeridos')
  }

  const caption = [job.title, job.description]
    .filter(Boolean)
    .join('\n')
    .slice(0, CAPTION_MAX)

  // Attempt 1 — sendPhoto with URL (no download needed)
  const photoRes = await fetch(botUrl(botToken, 'sendPhoto'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: job.image_url,
      caption,
      parse_mode: 'HTML',
    }),
  })

  const photoData = await photoRes.json().catch(() => ({}))

  if (photoData?.ok) {
    return { ok: true, url: null }
  }

  // If size too large or sendPhoto failed, fallback to sendDocument with file upload
  const shouldFallback = !photoData?.ok && (
    isSizeTooLargeError(photoData?.description) ||
    photoData?.error_code === 413 ||
    !photoRes.ok
  )

  if (shouldFallback) {
    const filename = job.image_url?.split('/').pop() || 'artwork.jpg'
    const { buffer, contentType } = await downloadImage(job.image_url)

    const form = new FormData()
    form.append('chat_id', String(chatId))
    form.append('caption', caption)
    form.append('parse_mode', 'HTML')
    form.append('document', buffer, { filename, contentType })

    const docRes = await fetch(botUrl(botToken, 'sendDocument'), {
      method: 'POST',
      headers: form.getHeaders(),
      body: form,
    })

    const docData = await docRes.json().catch(() => ({}))

    if (docData?.ok) {
      return { ok: true, url: null }
    }

    throw new Error(`Telegram: ${docData?.description || `HTTP ${docRes.status}`}`)
  }

  throw new Error(`Telegram: ${photoData?.description || `HTTP ${photoRes.status}`}`)
}

/**
 * Tests Telegram credentials using the getMe endpoint.
 *
 * @param {object} credentials — { botToken }
 * @returns {Promise<{ ok: boolean, botName?: string, error?: string }>}
 */
async function testTelegram(credentials) {
  const { botToken } = credentials ?? {}

  if (!botToken) {
    return { ok: false, error: 'Bot token de Telegram requerido' }
  }

  try {
    const res = await fetch(botUrl(botToken, 'getMe'))
    const data = await res.json().catch(() => ({}))

    if (data?.ok) {
      return { ok: true, botName: data.result?.username }
    }

    return { ok: false, error: data?.description || `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { publishTelegram, testTelegram }
