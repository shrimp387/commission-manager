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
  console.log(`[wdTagger] ━━━━ DESCARGANDO IMAGEN ━━━━`)
  console.log(`[wdTagger] 🌐 URL: ${url}`)
  console.log(`[wdTagger] ⏱️  Timeout: ${TIMEOUT_MS}ms (${TIMEOUT_MS / 1000}s)`)
  
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  
  try {
    console.log(`[wdTagger] 📡 Iniciando descarga HTTP...`)
    const startTime = Date.now()
    
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    
    const duration = Date.now() - startTime
    console.log(`[wdTagger] 📥 Respuesta HTTP recibida`)
    console.log(`[wdTagger] ⏱️  Tiempo descarga: ${duration}ms`)
    console.log(`[wdTagger] 📊 Status: ${res.status} ${res.statusText}`)
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} downloading image`)
    }
    
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/png'
    
    console.log(`[wdTagger] ✅ Descarga completada`)
    console.log(`[wdTagger] 📦 Tamaño: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(2)} KB)`)
    console.log(`[wdTagger] 🖼️  Content-Type: ${contentType}`)
    
    return { buffer, contentType }
  } catch (err) {
    clearTimeout(timer)
    
    if (err.name === 'AbortError') {
      console.error(`[wdTagger] ❌ TIMEOUT al descargar imagen`)
      console.error(`[wdTagger] ⏱️  Excedió ${TIMEOUT_MS}ms`)
      throw new Error(`Timeout al descargar imagen (${TIMEOUT_MS / 1000}s)`)
    }
    
    console.error(`[wdTagger] ❌ Error descargando imagen`)
    console.error(`[wdTagger] 💬 ${err.message}`)
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
  console.log(`\n[wdTagger] ╔════════════════════════════════════════════════════╗`)
  console.log(`[wdTagger] ║     GENERANDO TAGS WD-TAGGER (SMILINGWOLF)       ║`)
  console.log(`[wdTagger] ╚════════════════════════════════════════════════════╝`)
  console.log(`[wdTagger] 🖼️  Imagen: ${imageUrl}`)
  console.log(`[wdTagger] 🔑 HF Token: ${hfToken ? 'CONFIGURADO' : '⚠️  NO CONFIGURADO'}`)
  
  const { buffer, contentType } = await downloadImage(imageUrl)

  const headers = { 'Content-Type': contentType }
  if (hfToken) {
    headers['Authorization'] = `Bearer ${hfToken}`
  }

  const errors = []

  for (let i = 0; i < HF_MODELS.length; i++) {
    const model = HF_MODELS[i]
    console.log(`\n[wdTagger] ─────────────────────────────────────────────────────`)
    console.log(`[wdTagger] 🤖 Intento ${i + 1}/${HF_MODELS.length}: ${model}`)
    console.log(`[wdTagger] ─────────────────────────────────────────────────────`)
    
    try {
      console.log(`[wdTagger] ━━━━ LLAMANDO A HUGGINGFACE ━━━━`)
      console.log(`[wdTagger] 📊 Tamaño buffer: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(2)} KB)`)
      console.log(`[wdTagger] 🔑 Token: ${hfToken ? `${hfToken.slice(0, 10)}...` : '⚠️  NO CONFIGURADO'}`)
      console.log(`[wdTagger] 📡 Endpoint: https://api-inference.huggingface.co/models/${model}`)
      
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      console.log(`[wdTagger] 📤 Enviando POST request...`)
      const startTime = Date.now()
      
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers,
        body: buffer,
        signal: controller.signal,
      })
      clearTimeout(timer)

      const duration = Date.now() - startTime
      console.log(`[wdTagger] 📥 Respuesta recibida`)
      console.log(`[wdTagger] ⏱️  Latencia: ${duration}ms (${(duration / 1000).toFixed(2)}s)`)
      console.log(`[wdTagger] 📊 HTTP Status: ${res.status}`)

      if (res.status === 503) {
        // Model loading — wait and retry once
        const body = await res.json().catch(() => ({}))
        const wait = Math.min(body.estimated_time ?? 20, 30)
        
        console.log(`[wdTagger] ⚠️  Modelo en COLD START (503)`)
        console.log(`[wdTagger] ⏳ Tiempo estimado de carga: ${wait}s`)
        console.log(`[wdTagger] 💤 Esperando ${wait}s antes de reintentar...`)
        
        await new Promise(r => setTimeout(r, wait * 1000))

        console.log(`[wdTagger] 🔄 Reintentando después de espera...`)
        const startTime2 = Date.now()
        
        const res2 = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST',
          headers,
          body: buffer,
        })
        
        const duration2 = Date.now() - startTime2
        console.log(`[wdTagger] 📥 Respuesta del reintento: HTTP ${res2.status}`)
        console.log(`[wdTagger] ⏱️  Latencia: ${duration2}ms`)
        
        if (!res2.ok) {
          const b = await res2.json().catch(() => ({}))
          console.error(`[wdTagger] ❌ Reintento falló: ${res2.status}`)
          console.error(`[wdTagger] 💬 ${b.error || ''}`)
          errors.push(`${model}: ${res2.status} ${b.error || ''}`)
          
          if (i < HF_MODELS.length - 1) {
            console.log(`[wdTagger] 🔄 Intentando siguiente modelo fallback...`)
          }
          continue
        }
        
        console.log(`[wdTagger] ✅ Reintento exitoso`)
        const predictions2 = await res2.json()
        const tags = parsePredictions(predictions2)
        
        console.log(`[wdTagger] ━━━━ RESULTADOS ━━━━`)
        console.log(`[wdTagger] ✅ ÉXITO con modelo: ${model}`)
        console.log(`[wdTagger] 📊 Tags generados: ${tags.length}`)
        console.log(`[wdTagger] 🏷️  Top 10 tags:`)
        tags.slice(0, 10).forEach((tag, idx) => {
          console.log(`[wdTagger]    ${idx + 1}. ${tag}`)
        })
        if (tags.length > 10) {
          console.log(`[wdTagger]    ... y ${tags.length - 10} más`)
        }
        console.log(`[wdTagger] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        
        return tags
      }

      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        
        console.error(`[wdTagger] ❌ Request falló: HTTP ${res.status}`)
        console.error(`[wdTagger] 💬 Error: ${b.error || res.statusText}`)
        
        // Diagnóstico de errores comunes
        if (res.status === 401 || res.status === 403) {
          console.error(`[wdTagger] 🚫 CAUSA: Token inválido o sin permisos`)
          console.error(`[wdTagger] 🔧 SOLUCIÓN: Verifica el token en Settings → IAs & Taggers`)
        } else if (res.status === 429) {
          console.error(`[wdTagger] ⚠️  CAUSA: Rate limit excedido`)
          console.error(`[wdTagger] 🔧 SOLUCIÓN: ${hfToken ? 'Espera unas horas' : 'Configura un token HF gratuito'}`)
        } else if (res.status === 400) {
          console.error(`[wdTagger] 🔍 CAUSA: Request inválido - imagen corrupta o formato no soportado`)
        }
        
        errors.push(`${model}: ${res.status} ${b.error || ''}`)
        
        if (i < HF_MODELS.length - 1) {
          console.log(`[wdTagger] 🔄 Intentando siguiente modelo fallback...`)
        }
        continue
      }

      console.log(`[wdTagger] ✅ Respuesta OK - parseando JSON...`)
      const predictions = await res.json()
      console.log(`[wdTagger] ✅ JSON parseado correctamente`)
      
      const tags = parsePredictions(predictions)
      
      console.log(`[wdTagger] ━━━━ RESULTADOS ━━━━`)
      console.log(`[wdTagger] ✅ ÉXITO con modelo: ${model}`)
      console.log(`[wdTagger] 📊 Tags generados: ${tags.length}`)
      console.log(`[wdTagger] 🏷️  Top 10 tags:`)
      tags.slice(0, 10).forEach((tag, idx) => {
        console.log(`[wdTagger]    ${idx + 1}. ${tag}`)
      })
      if (tags.length > 10) {
        console.log(`[wdTagger]    ... y ${tags.length - 10} más`)
      }
      console.log(`[wdTagger] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      
      return tags

    } catch (err) {
      console.error(`[wdTagger] ❌ Modelo ${model} FALLÓ`)
      console.error(`[wdTagger] 💬 Error: ${err.message}`)
      
      if (err.name === 'AbortError') {
        console.error(`[wdTagger] ⏱️  TIMEOUT: Request excedió ${TIMEOUT_MS}ms`)
      }
      
      errors.push(`${model}: ${err.message}`)
      
      if (i < HF_MODELS.length - 1) {
        console.log(`[wdTagger] 🔄 Intentando siguiente modelo fallback...`)
      }
    }
  }

  console.error(`[wdTagger] ❌ TODOS LOS MODELOS FALLARON`)
  console.error(`[wdTagger] 📝 Errores:`)
  errors.forEach((e, i) => console.error(`[wdTagger]    ${i + 1}. ${e}`))
  
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
