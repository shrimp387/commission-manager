/**
 * bluesky.js — Publisher module for Bluesky (AT Protocol)
 *
 * Uses Node.js built-in fetch (Node 18+) — no node-fetch dependency needed.
 */

'use strict'

const BSKY_BASE = 'https://bsky.social/xrpc'
const BSKY_APP = 'https://bsky.app'
const DOWNLOAD_TIMEOUT_MS = 30_000
const POST_TEXT_MAX = 300

// ── Helpers ───────────────────────────────────────────────────────────────────

async function downloadImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Timeout al descargar la imagen para Bluesky')
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`Error al descargar imagen: HTTP ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  return { buffer, contentType }
}

/**
 * Extracts the AT Protocol error message from a response.
 */
async function extractAtpError(res) {
  try {
    const json = await res.json()
    return json?.message || json?.error || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

/**
 * Converts a Bluesky URI (at://did.../app.bsky.feed.post/rkey) to an app URL.
 */
function uriToUrl(uri, handle) {
  if (!uri) return null
  const rkey = uri.split('/').pop()
  return `${BSKY_APP}/profile/${handle}/post/${rkey}`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Publishes an artwork job to Bluesky.
 *
 * @param {object} job         — publish job from Supabase
 * @param {object} credentials — { handle, appPassword, enabled }
 * @returns {Promise<{ ok: true, url: string }>}
 */
async function publishBluesky(job, credentials) {
  const { handle, appPassword } = credentials ?? {}

  if (!handle || !appPassword) {
    throw new Error('Handle y app password de Bluesky son requeridos')
  }

  // Step 1 — Authenticate
  const sessionRes = await fetch(`${BSKY_BASE}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  })

  if (!sessionRes.ok) {
    const errMsg = await extractAtpError(sessionRes)
    throw new Error(`Bluesky auth: ${errMsg}`)
  }

  const session = await sessionRes.json()
  const { accessJwt, did } = session

  // Step 2 — Download and upload image blob
  const { buffer, contentType } = await downloadImage(job.image_url)

  const blobRes = await fetch(`${BSKY_BASE}/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessJwt}`,
      'Content-Type': contentType,
    },
    body: buffer,
  })

  if (!blobRes.ok) {
    const errMsg = await extractAtpError(blobRes)
    throw new Error(`Bluesky uploadBlob: ${errMsg}`)
  }

  const blobData = await blobRes.json()
  const blobRef = blobData?.blob

  // Step 3 — Create post record
  const postText = [job.title, job.description]
    .filter(Boolean)
    .join('\n')
    .slice(0, POST_TEXT_MAX)

  const record = {
    $type: 'app.bsky.feed.post',
    text: postText,
    embed: {
      $type: 'app.bsky.embed.images#main',
      images: [
        {
          image: blobRef,
          alt: job.title ?? 'artwork',
        },
      ],
    },
    createdAt: new Date().toISOString(),
  }

  const postRes = await fetch(`${BSKY_BASE}/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
  })

  if (!postRes.ok) {
    const errMsg = await extractAtpError(postRes)
    throw new Error(`Bluesky createRecord: ${errMsg}`)
  }

  const postData = await postRes.json()
  const url = uriToUrl(postData?.uri, handle)

  return { ok: true, url }
}

/**
 * Tests Bluesky credentials by attempting authentication only.
 *
 * @param {object} credentials — { handle, appPassword }
 * @returns {Promise<{ ok: boolean, handle?: string, error?: string }>}
 */
async function testBluesky(credentials) {
  const { handle, appPassword } = credentials ?? {}

  if (!handle || !appPassword) {
    return { ok: false, error: 'Handle y app password de Bluesky son requeridos' }
  }

  try {
    const res = await fetch(`${BSKY_BASE}/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    })

    if (res.ok) {
      return { ok: true, handle }
    }

    const errMsg = await extractAtpError(res)
    return { ok: false, error: errMsg }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { publishBluesky, testBluesky }
