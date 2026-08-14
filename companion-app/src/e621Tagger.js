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

const TIMEOUT_MS = 60_000  // 60s — model may cold start

// ── Thresholds específicos por modelo ─────────────────────────────────────────
const MODEL_THRESHOLDS = {
  'zerauskii/e621-tagger-jtp': 0.2,  // JTP PILOT2 - recomendado por RedRocket
  'lodestones/P.A.W.F.E.C.T-Alpha': 0.35,
  'SmilingWolf/wd-vit-tagger-v3': 0.35,
  'default': 0.35
}

// ── HuggingFace models for furry art ──────────────────────────────────────────
const E621_MODELS = [
  'zerauskii/e621-tagger-jtp',  // JTP PILOT2 - Tu modelo personalizado (9,083 tags E621)
  'SmilingWolf/wd-vit-tagger-v3', // Fallback si JTP falla
]

const PAWFECT_MODELS = [
  'lodestones/P.A.W.F.E.C.T-Alpha',
  'SmilingWolf/wd-vit-tagger-v3', // Fallback
]

/**
 * Downloads an image from a URL and returns { buffer, contentType }.
 */
async function downloadImage(url) {
  console.log(`[e621Tagger] ━━━━ DESCARGANDO IMAGEN ━━━━`)
  console.log(`[e621Tagger] 🌐 URL: ${url}`)
  console.log(`[e621Tagger] ⏱️  Timeout: ${TIMEOUT_MS}ms (${TIMEOUT_MS / 1000}s)`)
  
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  
  try {
    console.log(`[e621Tagger] 📡 Iniciando descarga HTTP...`)
    const startTime = Date.now()
    
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    
    const duration = Date.now() - startTime
    console.log(`[e621Tagger] 📥 Respuesta HTTP recibida`)
    console.log(`[e621Tagger] ⏱️  Tiempo descarga: ${duration}ms`)
    console.log(`[e621Tagger] 📊 Status: ${res.status} ${res.statusText}`)
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} downloading image`)
    }
    
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/png'
    
    console.log(`[e621Tagger] ✅ Descarga completada`)
    console.log(`[e621Tagger] 📦 Tamaño: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(2)} KB)`)
    console.log(`[e621Tagger] 🖼️  Content-Type: ${contentType}`)
    
    return { buffer, contentType }
  } catch (err) {
    clearTimeout(timer)
    
    if (err.name === 'AbortError') {
      console.error(`[e621Tagger] ❌ TIMEOUT al descargar imagen`)
      console.error(`[e621Tagger] ⏱️  Excedió ${TIMEOUT_MS}ms`)
      throw new Error(`Timeout al descargar imagen (${TIMEOUT_MS / 1000}s)`)
    }
    
    console.error(`[e621Tagger] ❌ Error descargando imagen`)
    console.error(`[e621Tagger] 💬 ${err.message}`)
    throw err
  }
}

/**
 * Calls HuggingFace Inference API for image classification.
 * Handles model loading (503) with automatic retry.
 */
async function callHuggingFaceModel(modelName, imageBuffer, hfToken = '') {
  console.log(`[e621Tagger] ━━━━ LLAMANDO A HUGGINGFACE ━━━━`)
  console.log(`[e621Tagger] 🤖 Modelo: ${modelName}`)
  console.log(`[e621Tagger] 📊 Tamaño buffer: ${imageBuffer.length} bytes (${(imageBuffer.length / 1024).toFixed(2)} KB)`)
  console.log(`[e621Tagger] 🔑 Token HF: ${hfToken ? `${hfToken.slice(0, 10)}...` : '⚠️  NO CONFIGURADO'}`)
  console.log(`[e621Tagger] 📡 Endpoint: https://api-inference.huggingface.co/models/${modelName}`)
  
  const headers = { 'Content-Type': 'application/octet-stream' }
  if (hfToken) {
    headers['Authorization'] = `Bearer ${hfToken}`
    console.log(`[e621Tagger] 🔐 Authorization header: presente`)
  } else {
    console.log(`[e621Tagger] ⚠️  Sin Authorization header - rate limiting activo`)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    console.log(`[e621Tagger] 📤 Enviando POST request...`)
    const startTime = Date.now()
    
    const res = await fetch(`https://api-inference.huggingface.co/models/${modelName}`, {
      method: 'POST',
      headers,
      body: imageBuffer,
      signal: controller.signal,
    })
    clearTimeout(timer)

    const duration = Date.now() - startTime
    console.log(`[e621Tagger] 📥 Respuesta recibida`)
    console.log(`[e621Tagger] ⏱️  Latencia: ${duration}ms (${(duration / 1000).toFixed(2)}s)`)
    console.log(`[e621Tagger] 📊 HTTP Status: ${res.status}`)

    // Model loading — wait and retry once
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}))
      const wait = Math.min(body.estimated_time ?? 20, 30)
      
      console.log(`[e621Tagger] ⚠️  Modelo en COLD START (503)`)
      console.log(`[e621Tagger] ⏳ Tiempo estimado de carga: ${wait}s`)
      console.log(`[e621Tagger] 💤 Esperando ${wait}s antes de reintentar...`)
      
      await new Promise(r => setTimeout(r, wait * 1000))

      // Retry after waiting
      console.log(`[e621Tagger] 🔄 Reintentando después de espera...`)
      const startTime2 = Date.now()
      
      const res2 = await fetch(`https://api-inference.huggingface.co/models/${modelName}`, {
        method: 'POST',
        headers,
        body: imageBuffer,
      })
      
      const duration2 = Date.now() - startTime2
      console.log(`[e621Tagger] 📥 Respuesta del reintento: HTTP ${res2.status}`)
      console.log(`[e621Tagger] ⏱️  Latencia: ${duration2}ms`)
      
      if (!res2.ok) {
        const b = await res2.json().catch(() => ({}))
        console.error(`[e621Tagger] ❌ Reintento falló: ${res2.status}`)
        console.error(`[e621Tagger] 💬 ${b.error || ''}`)
        throw new Error(`HTTP ${res2.status}: ${b.error || ''}`)
      }
      
      console.log(`[e621Tagger] ✅ Reintento exitoso`)
      return await res2.json()
    }

    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      
      console.error(`[e621Tagger] ❌ Request falló: HTTP ${res.status}`)
      console.error(`[e621Tagger] 💬 Error: ${b.error || res.statusText}`)
      
      // Diagnóstico de errores comunes
      if (res.status === 401 || res.status === 403) {
        console.error(`[e621Tagger] 🚫 CAUSA: Token inválido o sin permisos`)
        console.error(`[e621Tagger] 🔧 SOLUCIÓN: Verifica el token en Settings → IAs & Taggers`)
      } else if (res.status === 429) {
        console.error(`[e621Tagger] ⚠️  CAUSA: Rate limit excedido`)
        console.error(`[e621Tagger] 🔧 SOLUCIÓN: ${hfToken ? 'Espera unas horas' : 'Configura un token HF gratuito'}`)
      } else if (res.status === 400) {
        console.error(`[e621Tagger] 🔍 CAUSA: Request inválido - imagen corrupta o formato no soportado`)
      }
      
      throw new Error(`HTTP ${res.status}: ${b.error || ''}`)
    }

    console.log(`[e621Tagger] ✅ Respuesta OK - parseando JSON...`)
    const result = await res.json()
    console.log(`[e621Tagger] ✅ JSON parseado correctamente`)
    
    return result
  } catch (err) {
    clearTimeout(timer)
    
    if (err.name === 'AbortError') {
      console.error(`[e621Tagger] ❌ TIMEOUT`)
      console.error(`[e621Tagger] ⏱️  Request excedió ${TIMEOUT_MS}ms (${TIMEOUT_MS / 1000}s)`)
      throw new Error('Request timeout (60s)')
    }
    
    throw err
  }
}

/**
 * Parses HuggingFace image classification predictions into tags.
 * Uses model-specific threshold for optimal results.
 * 
 * @param {Array} predictions - Array de predicciones de HuggingFace
 * @param {string} modelName - Nombre del modelo usado
 * @returns {string[]} Array de tags normalizados
 */
function parsePredictions(predictions, modelName) {
  if (!Array.isArray(predictions)) {
    throw new Error(`Unexpected response format: ${JSON.stringify(predictions).slice(0, 200)}`)
  }
  
  // Usar threshold específico del modelo o el default
  const threshold = MODEL_THRESHOLDS[modelName] || MODEL_THRESHOLDS['default']
  console.log(`[e621Tagger] 🎯 Threshold para ${modelName}: ${threshold}`)
  
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
  console.log(`\n[e621Tagger] ╔════════════════════════════════════════════════════╗`)
  console.log(`[e621Tagger] ║     GENERANDO TAGS E621-TAGGER (POOFY1)          ║`)
  console.log(`[e621Tagger] ╚════════════════════════════════════════════════════╝`)
  console.log(`[e621Tagger] 🖼️  Imagen: ${imageUrl}`)
  console.log(`[e621Tagger] 🔑 HF Token: ${hfToken ? 'CONFIGURADO' : '⚠️  NO CONFIGURADO'}`)
  
  const { buffer, contentType } = await downloadImage(imageUrl)

  const errors = []

  for (let i = 0; i < E621_MODELS.length; i++) {
    const model = E621_MODELS[i]
    console.log(`\n[e621Tagger] ─────────────────────────────────────────────────────`)
    console.log(`[e621Tagger] 🤖 Intento ${i + 1}/${E621_MODELS.length}: ${model}`)
    console.log(`[e621Tagger] ─────────────────────────────────────────────────────`)
    
    try {
      const predictions = await callHuggingFaceModel(model, buffer, hfToken)
      const tags = parsePredictions(predictions, model)  // ← Pasar nombre del modelo
      
      console.log(`[e621Tagger] ━━━━ RESULTADOS ━━━━`)
      console.log(`[e621Tagger] ✅ ÉXITO con modelo: ${model}`)
      console.log(`[e621Tagger] 📊 Tags generados: ${tags.length}`)
      console.log(`[e621Tagger] 🏷️  Top 10 tags:`)
      tags.slice(0, 10).forEach((tag, idx) => {
        console.log(`[e621Tagger]    ${idx + 1}. ${tag}`)
      })
      if (tags.length > 10) {
        console.log(`[e621Tagger]    ... y ${tags.length - 10} más`)
      }
      console.log(`[e621Tagger] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      
      return tags
    } catch (err) {
      console.error(`[e621Tagger] ❌ Modelo ${model} FALLÓ`)
      console.error(`[e621Tagger] 💬 Error: ${err.message}`)
      errors.push(`${model}: ${err.message}`)
      
      if (i < E621_MODELS.length - 1) {
        console.log(`[e621Tagger] 🔄 Intentando siguiente modelo fallback...`)
      }
    }
  }

  console.error(`[e621Tagger] ❌ TODOS LOS MODELOS FALLARON`)
  console.error(`[e621Tagger] 📝 Errores:`)
  errors.forEach((e, i) => console.error(`[e621Tagger]    ${i + 1}. ${e}`))
  
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
  console.log(`\n[e621Tagger] ╔════════════════════════════════════════════════════╗`)
  console.log(`[e621Tagger] ║     GENERANDO TAGS P.A.W.F.E.C.T (FURAFFINITY)   ║`)
  console.log(`[e621Tagger] ╚════════════════════════════════════════════════════╝`)
  console.log(`[e621Tagger] 🖼️  Imagen: ${imageUrl}`)
  console.log(`[e621Tagger] 🔑 HF Token: ${hfToken ? 'CONFIGURADO' : '⚠️  NO CONFIGURADO'}`)
  
  const { buffer, contentType } = await downloadImage(imageUrl)

  const errors = []

  for (let i = 0; i < PAWFECT_MODELS.length; i++) {
    const model = PAWFECT_MODELS[i]
    console.log(`\n[e621Tagger] ─────────────────────────────────────────────────────`)
    console.log(`[e621Tagger] 🤖 Intento ${i + 1}/${PAWFECT_MODELS.length}: ${model}`)
    console.log(`[e621Tagger] ─────────────────────────────────────────────────────`)
    
    try {
      const predictions = await callHuggingFaceModel(model, buffer, hfToken)
      const tags = parsePredictions(predictions, model)  // ← Pasar nombre del modelo
      
      console.log(`[e621Tagger] ━━━━ RESULTADOS ━━━━`)
      console.log(`[e621Tagger] ✅ ÉXITO con modelo: ${model}`)
      console.log(`[e621Tagger] 📊 Tags generados: ${tags.length}`)
      console.log(`[e621Tagger] 🏷️  Top 10 tags:`)
      tags.slice(0, 10).forEach((tag, idx) => {
        console.log(`[e621Tagger]    ${idx + 1}. ${tag}`)
      })
      if (tags.length > 10) {
        console.log(`[e621Tagger]    ... y ${tags.length - 10} más`)
      }
      console.log(`[e621Tagger] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      
      return tags
    } catch (err) {
      console.error(`[e621Tagger] ❌ Modelo ${model} FALLÓ`)
      console.error(`[e621Tagger] 💬 Error: ${err.message}`)
      errors.push(`${model}: ${err.message}`)
      
      if (i < PAWFECT_MODELS.length - 1) {
        console.log(`[e621Tagger] 🔄 Intentando siguiente modelo fallback...`)
      }
    }
  }

  console.error(`[e621Tagger] ❌ TODOS LOS MODELOS FALLARON`)
  console.error(`[e621Tagger] 📝 Errores:`)
  errors.forEach((e, i) => console.error(`[e621Tagger]    ${i + 1}. ${e}`))
  
  throw new Error(`P.A.W.F.E.C.T failed all models: ${errors.join(' | ')}`)
}

module.exports = { generateTagsE621, generateTagsPAWFECT }
