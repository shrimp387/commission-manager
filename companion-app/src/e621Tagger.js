'use strict'

/**
 * e621Tagger.js — E621 and P.A.W.F.E.C.T tagger implementations for companion app.
 *
 * Runs from the artist's PC via Node.js — no Cloudflare IP blocks or CORS restrictions.
 * Uses HuggingFace Inference API with furry-specific models.
 *
 * Models:
 * 1. Poofy1/e621-tagger: Trained specifically on e621 data
 * 2. P.A.W.F.E.C.T-Alpha (lodestones): Trained on FurAffinity data
 * 3. Fallback: SmilingWolf/wd-vit-tagger-v3 (anime/general purpose)
 */

const THRESHOLD = 0.35
const TIMEOUT_MS = 60_000  // 60s — model may cold start

// ── HuggingFace models for furry art ──────────────────────────────────────────
const E621_MODELS = [
  'Poofy1/e621-tagger',
  'SmilingWolf/wd-vit-tagger-v3', // Fallback
]

const PAWFECT_MODELS = [
  'lodestones/P.A.W.F.E.C.T-Alpha',
  'SmilingWolf/wd-vit-tagger-v3', // Fallback
]

/**
 * Downloads an image from a URL and returns { buffer, contentType }.
 */
async function downloadImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading image`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/png'
    return { buffer, contentType }
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

/**
 * Calls HuggingFace Inference API for image classification.
 * Handles model loading (503) with automatic retry.
 */
async function callHuggingFaceModel(modelName, imageBuffer, hfToken = '') {
  console.log(`[e621Tagger] Calling HuggingFace model: ${modelName}`)
  
  const headers = { 'Content-Type': 'application/octet-stream' }
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${modelName}`, {
      method: 'POST',
      headers,
      body: imageBuffer,
      signal: controller.signal,
    })
    clearTimeout(timer)

    // Model loading — wait and retry once
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}))
      const wait = Math.min(body.estimated_time ?? 20, 30)
      console.log(`[e621Tagger] Model ${modelName} loading, waiting ${wait}s...`)
      await new Promise(r => setTimeout(r, wait * 1000))

      // Retry after waiting
      const res2 = await fetch(`https://api-inference.huggingface.co/models/${modelName}`, {
        method: 'POST',
        headers,
        body: imageBuffer,
      })
      if (!res2.ok) {
        const b = await res2.json().catch(() => ({}))
        throw new Error(`HTTP ${res2.status}: ${b.error || ''}`)
      }
      return await res2.json()
    }

    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      throw new Error(`HTTP ${res.status}: ${b.error || ''}`)
    }

    return await res.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Request timeout (60s)')
    throw err
  }
}

/**
 * Parses HuggingFace image classification predictions into tags.
 */
function parsePredictions(predictions, threshold = THRESHOLD) {
  if (!Array.isArray(predictions)) {
    throw new Error(`Unexpected response format: ${JSON.stringify(predictions).slice(0, 200)}`)
  }
  return predictions
    .filter(p => (p.score ?? 0) >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(p => {
      let tag = p.label
      // Normalize tag format
      tag = tag.replace(/_/g, ' ')      // underscores to spaces
      tag = tag.replace(/\s+/g, ' ')    // multiple spaces to single
      tag = tag.trim().toLowerCase()
      return tag
    })
    .filter(tag => tag.length > 0)
    .slice(0, 200)
}

/**
 * Generates tags using E621-Tagger (Poofy1).
 * Tries multiple models until one succeeds.
 *
 * @param {string} imageUrl - Public URL of the image
 * @param {string} [hfToken] - Optional HuggingFace token (improves rate limits)
 * @returns {Promise<string[]>} Array of normalized tags
 */
async function generateTagsE621(imageUrl, hfToken) {
  console.log(`[e621Tagger] Generating E621 tags for: ${imageUrl}`)
  const { buffer, contentType } = await downloadImage(imageUrl)
  console.log(`[e621Tagger] Image downloaded: ${buffer.length} bytes, type: ${contentType}`)

  const errors = []

  for (const model of E621_MODELS) {
    console.log(`[e621Tagger] Trying model: ${model}`)
    try {
      const predictions = await callHuggingFaceModel(model, buffer, hfToken)
      const tags = parsePredictions(predictions)
      console.log(`[e621Tagger] Generated ${tags.length} tags with ${model}`)
      return tags
    } catch (err) {
      console.error(`[e621Tagger] Model ${model} failed:`, err.message)
      errors.push(`${model}: ${err.message}`)
    }
  }

  throw new Error(`E621-Tagger failed all models: ${errors.join(' | ')}`)
}

/**
 * Generates tags using P.A.W.F.E.C.T-Alpha (FurAffinity trained).
 * Tries multiple models until one succeeds.
 *
 * @param {string} imageUrl - Public URL of the image
 * @param {string} [hfToken] - Optional HuggingFace token (improves rate limits)
 * @returns {Promise<string[]>} Array of normalized tags
 */
async function generateTagsPAWFECT(imageUrl, hfToken) {
  console.log(`[e621Tagger] Generating P.A.W.F.E.C.T tags for: ${imageUrl}`)
  const { buffer, contentType } = await downloadImage(imageUrl)
  console.log(`[e621Tagger] Image downloaded: ${buffer.length} bytes, type: ${contentType}`)

  const errors = []

  for (const model of PAWFECT_MODELS) {
    console.log(`[e621Tagger] Trying model: ${model}`)
    try {
      const predictions = await callHuggingFaceModel(model, buffer, hfToken)
      const tags = parsePredictions(predictions)
      console.log(`[e621Tagger] Generated ${tags.length} tags with ${model}`)
      return tags
    } catch (err) {
      console.error(`[e621Tagger] Model ${model} failed:`, err.message)
      errors.push(`${model}: ${err.message}`)
    }
  }

  throw new Error(`P.A.W.F.E.C.T failed all models: ${errors.join(' | ')}`)
}

module.exports = { generateTagsE621, generateTagsPAWFECT }
