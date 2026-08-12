/**
 * discord.js — Publisher module for Discord (Webhook)
 *
 * Uses Node.js built-in fetch (Node 18+) — no node-fetch dependency needed.
 */

'use strict'

const FormData = require('form-data')

const DISCORD_WEBHOOK_PREFIX = 'https://discord.com/api/webhooks/'
const DOWNLOAD_TIMEOUT_MS = 30_000
const EMBED_COLOR = 0x7289DA // Discord blurple

// ── Helpers ───────────────────────────────────────────────────────────────────

async function downloadImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Timeout al descargar la imagen para Discord')
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`Error al descargar imagen: HTTP ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/png'
  return { buffer, contentType }
}

function validateWebhookUrl(webhookUrl) {
  if (!webhookUrl || !webhookUrl.startsWith(DISCORD_WEBHOOK_PREFIX)) {
    throw new Error('URL de webhook de Discord inválida')
  }
}

async function extractError(res) {
  try {
    const json = await res.json()
    return json?.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Publishes an artwork job to a Discord channel via webhook.
 *
 * Sends the image as a file attachment with an embed for title/description.
 *
 * @param {object} job         — publish job from Supabase
 * @param {object} credentials — { webhookUrl, enabled }
 * @returns {Promise<{ ok: true, url: string }>}
 */
async function publishDiscord(job, credentials) {
  const { webhookUrl } = credentials ?? {}
  validateWebhookUrl(webhookUrl)

  // Download image
  const filename = job.image_url?.split('/').pop()?.split('?')[0] || 'artwork.png'
  const { buffer, contentType } = await downloadImage(job.image_url)

  // Build payload
  const payload = {
    embeds: [
      {
        title: job.title ?? '',
        description: job.description ?? '',
        color: EMBED_COLOR,
        image: { url: `attachment://${filename}` },
      },
    ],
  }

  const form = new FormData()
  form.append('files[0]', buffer, { filename, contentType })
  form.append('payload_json', JSON.stringify(payload))

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: form.getHeaders(),
    body: form,
  })

  // Discord returns 200 (with body) or 204 (no content) on success
  if (res.status === 200 || res.status === 204) {
    return { ok: true, url: webhookUrl }
  }

  const errMsg = await extractError(res)
  throw new Error(`Discord: ${errMsg}`)
}

/**
 * Tests a Discord webhook URL by fetching its metadata (GET request).
 *
 * @param {object} credentials — { webhookUrl }
 * @returns {Promise<{ ok: boolean, channelName?: string, error?: string }>}
 */
async function testDiscord(credentials) {
  const { webhookUrl } = credentials ?? {}

  try {
    validateWebhookUrl(webhookUrl)
  } catch (err) {
    return { ok: false, error: err.message }
  }

  try {
    const res = await fetch(webhookUrl, { method: 'GET' })

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: true, channelName: data?.name || 'canal' }
    }

    const errMsg = await extractError(res)
    return { ok: false, error: errMsg }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { publishDiscord, testDiscord }
