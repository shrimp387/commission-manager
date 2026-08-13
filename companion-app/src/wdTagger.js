'use strict'

/**
 * wdTagger.js — WD-Tagger local client for the companion app.
 *
 * Runs from the artist's PC via Node.js — no Cloudflare IP blocks.
 * Uses HuggingFace Inference API with the WD-Tagger model.
 *
 * Model: SmilingWolf/wd-vit-tagger-v3 (latest, best accuracy)
 * Fallbacks: wd-v1-4-swinv2-tagger-v2, wd-v1-4-vit-tagger-v2
 */

const fs   = require('fs')
const path = require('path')
const os   = require('os')

const WD_THRESHOLD = 0.35
const TIMEOUT_MS   = 60_000  // 60s — model may cold start

const HF_MODELS = [
  'SmilingWolf/wd-vit-tagger-v3',
  'SmilingWolf/wd-v1-4-swinv2-tagger-v2',
  'SmilingWolf/wd-v1-4-vit-tagger-v2',
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
 * Generates WD-Tagger tags for an image URL.
 * Tries multiple models until one succeeds.
 *
 * @param {string} imageUrl - Public URL of the image
 * @param {string} [hfToken] - Optional HuggingFace token (improves rate limits)
 * @returns {Promise<string[]>} Array of normalized tags
 */
async function generateTagsWDTagger(imageUrl, hfToken) {
  console.log(`[wdTagger] Downloading image: ${imageUrl}`)
  const { buffer, contentType } = await downloadImage(imageUrl)
  console.log(`[wdTagger] Image downloaded: ${buffer.length} bytes, type: ${contentType}`)

  const headers = { 'Content-Type': contentType }
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

  const errors = []

  for (const model of HF_MODELS) {
    console.log(`[wdTagger] Trying model: ${model}`)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers,
        body: buffer,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.status === 503) {
        // Model loading — wait and retry once
        const body = await res.json().catch(() => ({}))
        const wait = Math.min(body.estimated_time ?? 20, 30)
        console.log(`[wdTagger] Model loading, waiting ${wait}s...`)
        await new Promise(r => setTimeout(r, wait * 1000))

        const res2 = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST',
          headers,
          body: buffer,
        })
        if (!res2.ok) {
          const b = await res2.json().catch(() => ({}))
          errors.push(`${model}: ${res2.status} ${b.error || ''}`)
          continue
        }
        const predictions2 = await res2.json()
        return parsePredictions(predictions2)
      }

      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        errors.push(`${model}: ${res.status} ${b.error || ''}`)
        continue
      }

      const predictions = await res.json()
      const tags = parsePredictions(predictions)
      console.log(`[wdTagger] Generated ${tags.length} tags with ${model}`)
      return tags

    } catch (err) {
      errors.push(`${model}: ${err.message}`)
    }
  }

  throw new Error(`WD-Tagger failed all models: ${errors.join(' | ')}`)
}

/**
 * Parses HuggingFace image classification predictions into e621 tags.
 * @param {Array<{label: string, score: number}>} predictions
 * @returns {string[]}
 */
function parsePredictions(predictions) {
  if (!Array.isArray(predictions)) {
    throw new Error(`Unexpected response: ${JSON.stringify(predictions).slice(0, 200)}`)
  }
  return predictions
    .filter(p => (p.score ?? 0) >= WD_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(p => p.label.toLowerCase().replace(/\s+/g, '_'))
    .filter(t => t.length > 0)
    .slice(0, 200)
}

module.exports = { generateTagsWDTagger }
