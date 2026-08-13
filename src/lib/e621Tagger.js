/**
 * e621Tagger.js — E621-specific tagger implementations
 *
 * Provides two furry-focused auto-tagging models:
 * 1. Poofy1/e621-tagger: Trained specifically on e621 data
 * 2. P.A.W.F.E.C.T-Alpha (lodestones): Trained on FurAffinity data
 *
 * Both are better for furry art than WD-Tagger (which is anime-focused).
 */

const THRESHOLD = 0.35

// ── HuggingFace models for furry art ──────────────────────────────────────────
const E621_MODELS = {
  // Poofy1's e621-specific tagger (if available as HF model)
  poofy: [
    'Poofy1/e621-tagger',  // Check if exists
    'SmilingWolf/wd-vit-tagger-v3', // Fallback (still good for general anime/furry)
  ],
  
  // P.A.W.F.E.C.T-Alpha: FurAffinity trained model
  pawfect: [
    'lodestones/P.A.W.F.E.C.T-Alpha',
    'SmilingWolf/wd-vit-tagger-v3', // Fallback
  ],
}

/**
 * Downloads image as buffer for processing
 */
async function downloadImageForTagging(imageUrl) {
  try {
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    
    const arrayBuffer = await res.arrayBuffer()
    return {
      buffer: new Uint8Array(arrayBuffer),
      contentType: res.headers.get('content-type') || 'image/png'
    }
  } catch (err) {
    throw new Error(`Failed to download image: ${err.message}`)
  }
}

/**
 * Calls HuggingFace Inference API for image classification
 */
async function callHuggingFaceModel(modelName, imageBuffer, hfToken = '') {
  const headers = { 'Content-Type': 'application/octet-stream' }
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${modelName}`,
      {
        method: 'POST',
        headers,
        body: imageBuffer,
        signal: controller.signal
      }
    )

    clearTimeout(timeout)

    // Model loading
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}))
      const wait = Math.min(body.estimated_time ?? 20, 30)
      console.log(`[e621Tagger] Model ${modelName} loading, waiting ${wait}s...`)
      await new Promise(r => setTimeout(r, wait * 1000))
      
      // Retry after waiting
      return callHuggingFaceModel(modelName, imageBuffer, hfToken)
    }

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`HTTP ${res.status}: ${errorText}`)
    }

    return await res.json()
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('Request timeout (30s)')
    }
    throw err
  }
}

/**
 * Parses predictions from HF image classification models
 */
function parsePredictions(predictions, threshold = THRESHOLD) {
  if (!Array.isArray(predictions)) return []
  
  return predictions
    .filter(p => p.score >= threshold)
    .map(p => {
      let tag = p.label
      // Clean up tag format
      tag = tag.replace(/_/g, ' ')      // underscores to spaces
      tag = tag.replace(/\s+/g, ' ')    // multiple spaces to single
      tag = tag.trim()
      return tag
    })
    .filter(tag => tag.length > 0)
}

/**
 * Generates tags using Poofy1/e621-tagger or fallback
 * 
 * @param {string} imageUrl - URL of the image to tag
 * @param {string} hfToken - Optional HuggingFace API token
 * @param {Function} onStatus - Optional status callback
 * @returns {Promise<string[]>} - Array of tags
 */
export async function generateTagsE621(imageUrl, hfToken = '', onStatus = null) {
  onStatus?.('Descargando imagen...')
  const { buffer } = await downloadImageForTagging(imageUrl)
  
  const errors = []
  
  for (const modelName of E621_MODELS.poofy) {
    try {
      onStatus?.(`Analizando con ${modelName.split('/')[1]}...`)
      const predictions = await callHuggingFaceModel(modelName, buffer, hfToken)
      const tags = parsePredictions(predictions)
      
      if (tags.length > 0) {
        console.log(`[e621Tagger] Generated ${tags.length} tags with ${modelName}`)
        return tags
      }
    } catch (err) {
      console.warn(`[e621Tagger] ${modelName} failed:`, err.message)
      errors.push(`${modelName}: ${err.message}`)
    }
  }
  
  throw new Error(`E621-Tagger failed all models: ${errors.join(' | ')}`)
}

/**
 * Generates tags using P.A.W.F.E.C.T-Alpha (FurAffinity trained)
 * 
 * @param {string} imageUrl - URL of the image to tag
 * @param {string} hfToken - Optional HuggingFace API token
 * @param {Function} onStatus - Optional status callback
 * @returns {Promise<string[]>} - Array of tags
 */
export async function generateTagsPAWFECT(imageUrl, hfToken = '', onStatus = null) {
  onStatus?.('Descargando imagen...')
  const { buffer } = await downloadImageForTagging(imageUrl)
  
  const errors = []
  
  for (const modelName of E621_MODELS.pawfect) {
    try {
      onStatus?.(`Analizando con ${modelName.split('/')[1]}...`)
      const predictions = await callHuggingFaceModel(modelName, buffer, hfToken)
      const tags = parsePredictions(predictions)
      
      if (tags.length > 0) {
        console.log(`[e621Tagger] Generated ${tags.length} tags with ${modelName}`)
        return tags
      }
    } catch (err) {
      console.warn(`[e621Tagger] ${modelName} failed:`, err.message)
      errors.push(`${modelName}: ${err.message}`)
    }
  }
  
  throw new Error(`P.A.W.F.E.C.T failed all models: ${errors.join(' | ')}`)
}
