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
 * Uses aggressive cache-busting and fallback to handle CORS issues
 */
async function downloadImageForTagging(imageUrl) {
  console.log('[e621Tagger] 📥 Downloading image:', imageUrl)
  
  try {
    // Add cache-busting parameter to force fresh request (avoids cached CORS errors)
    // Use random value in addition to timestamp for extra cache-busting
    const cacheBustUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + `_cb=${Date.now()}&_r=${Math.random()}`
    console.log('[e621Tagger] 🔄 Attempting direct download with cache-busting...')
    
    const res = await fetch(cacheBustUrl, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store', // Don't cache this request
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
    console.log('[e621Tagger] 📡 Response status:', res.status, res.statusText)
    console.log('[e621Tagger] 📋 Response headers:', {
      'content-type': res.headers.get('content-type'),
      'content-length': res.headers.get('content-length'),
      'access-control-allow-origin': res.headers.get('access-control-allow-origin'),
    })
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    
    console.log('[e621Tagger] 📦 Reading arrayBuffer...')
    const arrayBuffer = await res.arrayBuffer()
    console.log('[e621Tagger] ✅ Downloaded via direct fetch:', arrayBuffer.byteLength, 'bytes')
    
    return {
      buffer: new Uint8Array(arrayBuffer),
      contentType: res.headers.get('content-type') || 'image/png'
    }
  } catch (directErr) {
    console.warn('[e621Tagger] ⚠️ Direct download failed:', directErr.message)
    console.log('[e621Tagger] 🔄 Trying fallback: Canvas proxy method...')
    
    // Fallback: Load image via HTML Image element (bypasses CORS restrictions)
    // This works because the browser allows loading images cross-origin,
    // even if fetch() is blocked by CORS
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      const loadPromise = new Promise((resolve, reject) => {
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Image load failed'))
        setTimeout(() => reject(new Error('Image load timeout (30s)')), 30000)
      })
      
      // Load image with cache-busting (both timestamp and random for aggressive cache invalidation)
      img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + `_cb=${Date.now()}&_r=${Math.random()}`
      await loadPromise
      
      console.log('[e621Tagger] ✅ Image loaded via <img> element:', img.naturalWidth, 'x', img.naturalHeight)
      
      // Convert image to canvas and extract bytes
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      
      console.log('[e621Tagger] 🎨 Converting canvas to blob...')
      
      // Get image data as blob
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')),
          'image/png',
          0.95
        )
      })
      
      const arrayBuffer = await blob.arrayBuffer()
      console.log('[e621Tagger] ✅ Downloaded via canvas fallback:', arrayBuffer.byteLength, 'bytes')
      
      return {
        buffer: new Uint8Array(arrayBuffer),
        contentType: 'image/png'
      }
    } catch (canvasErr) {
      console.error('[e621Tagger] ❌ Canvas fallback also failed:', canvasErr.message)
      console.error('[e621Tagger] 🔍 Direct error:', directErr)
      console.error('[e621Tagger] 🔍 Canvas error:', canvasErr)
      
      // Provide helpful error message
      throw new Error(
        `Failed to download image. CORS is blocking access. ` +
        `Please wait 5 minutes for CORS configuration to propagate, ` +
        `then try again in an incognito window to clear cache.`
      )
    }
  }
}

/**
 * Calls HuggingFace Inference API for image classification
 */
async function callHuggingFaceModel(modelName, imageBuffer, hfToken = '') {
  console.log('[e621Tagger] 🤖 Calling HuggingFace model:', modelName)
  console.log('[e621Tagger] 📊 Image buffer size:', imageBuffer.length, 'bytes')
  console.log('[e621Tagger] 🔑 HF Token:', hfToken ? 'present' : 'not provided')
  
  const headers = { 'Content-Type': 'application/octet-stream' }
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const url = `https://api-inference.huggingface.co/models/${modelName}`
    console.log('[e621Tagger] 📡 Sending request to:', url)
    
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: imageBuffer,
      signal: controller.signal
    })

    clearTimeout(timeout)
    
    console.log('[e621Tagger] 📡 HF Response status:', res.status, res.statusText)

    // Model loading
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}))
      const wait = Math.min(body.estimated_time ?? 20, 30)
      console.log(`[e621Tagger] ⏳ Model ${modelName} loading, waiting ${wait}s...`)
      await new Promise(r => setTimeout(r, wait * 1000))
      
      // Retry after waiting
      console.log('[e621Tagger] 🔄 Retrying after model load...')
      return callHuggingFaceModel(modelName, imageBuffer, hfToken)
    }

    if (!res.ok) {
      const errorText = await res.text()
      console.error('[e621Tagger] ❌ HF Error response:', errorText)
      throw new Error(`HTTP ${res.status}: ${errorText}`)
    }

    const result = await res.json()
    console.log('[e621Tagger] 📊 HF Response:', Array.isArray(result) ? `${result.length} predictions` : 'unexpected format')
    
    return result
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      console.error('[e621Tagger] ⏱️ Request timeout (30s)')
      throw new Error('Request timeout (30s)')
    }
    console.error('[e621Tagger] ❌ HF Request failed:', err.message)
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
  console.log('[e621Tagger] 🎯 Starting E621-Tagger generation')
  console.log('[e621Tagger] 🖼️ Image URL:', imageUrl)
  
  onStatus?.('Descargando imagen...')
  const { buffer } = await downloadImageForTagging(imageUrl)
  
  const errors = []
  
  for (const modelName of E621_MODELS.poofy) {
    try {
      console.log('[e621Tagger] 🔄 Trying model:', modelName)
      onStatus?.(`Analizando con ${modelName.split('/')[1]}...`)
      const predictions = await callHuggingFaceModel(modelName, buffer, hfToken)
      const tags = parsePredictions(predictions)
      
      if (tags.length > 0) {
        console.log(`[e621Tagger] ✅ Generated ${tags.length} tags with ${modelName}`)
        console.log(`[e621Tagger] 🏷️ Tags:`, tags.slice(0, 10).join(', '), '...')
        return tags
      } else {
        console.warn(`[e621Tagger] ⚠️ ${modelName} returned 0 tags`)
      }
    } catch (err) {
      console.error(`[e621Tagger] ❌ ${modelName} failed:`, err.message)
      errors.push(`${modelName}: ${err.message}`)
    }
  }
  
  const errorMsg = `E621-Tagger failed all models: ${errors.join(' | ')}`
  console.error('[e621Tagger] ❌', errorMsg)
  throw new Error(errorMsg)
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
  console.log('[e621Tagger] 🎯 Starting P.A.W.F.E.C.T generation')
  console.log('[e621Tagger] 🖼️ Image URL:', imageUrl)
  
  onStatus?.('Descargando imagen...')
  const { buffer } = await downloadImageForTagging(imageUrl)
  
  const errors = []
  
  for (const modelName of E621_MODELS.pawfect) {
    try {
      console.log('[e621Tagger] 🔄 Trying model:', modelName)
      onStatus?.(`Analizando con ${modelName.split('/')[1]}...`)
      const predictions = await callHuggingFaceModel(modelName, buffer, hfToken)
      const tags = parsePredictions(predictions)
      
      if (tags.length > 0) {
        console.log(`[e621Tagger] ✅ Generated ${tags.length} tags with ${modelName}`)
        console.log(`[e621Tagger] 🏷️ Tags:`, tags.slice(0, 10).join(', '), '...')
        return tags
      } else {
        console.warn(`[e621Tagger] ⚠️ ${modelName} returned 0 tags`)
      }
    } catch (err) {
      console.error(`[e621Tagger] ❌ ${modelName} failed:`, err.message)
      errors.push(`${modelName}: ${err.message}`)
    }
  }
  
  const errorMsg = `P.A.W.F.E.C.T failed all models: ${errors.join(' | ')}`
  console.error('[e621Tagger] ❌', errorMsg)
  throw new Error(errorMsg)
}
