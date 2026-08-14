/**
 * huggingFaceClient.js — Cliente directo de HuggingFace desde el navegador
 * 
 * Llama a HuggingFace API directamente desde el navegador (sin Companion App)
 * Esto funciona porque el navegador NO tiene problemas de DNS/firewall
 */

const TIMEOUT_MS = 60000 // 60s

// Thresholds recomendados por modelo
const MODEL_THRESHOLDS = {
  'zerauskii/e621-tagger-jtp': 0.2,  // JTP PILOT2 - threshold recomendado por RedRocket
  'Poofy1/e621-tagger': 0.35,
  'SmilingWolf/wd-vit-tagger-v3': 0.35,
  'lodestones/P.A.W.F.E.C.T-Alpha': 0.35,
  // Default
  'default': 0.35
}

const HF_MODELS = {
  wd: [
    'SmilingWolf/wd-vit-tagger-v3',
    'SmilingWolf/wd-v1-4-swinv2-tagger-v2',
    'SmilingWolf/wd-v1-4-vit-tagger-v2',
  ],
  e621: [
    'zerauskii/e621-tagger-jtp',  // JointTaggerProject PILOT2 - Tu modelo subido
    'Poofy1/e621-tagger',
    'SmilingWolf/wd-vit-tagger-v3',
  ],
  pawfect: [
    'lodestones/P.A.W.F.E.C.T-Alpha',
    'SmilingWolf/wd-vit-tagger-v3',
  ],
}

/**
 * Descarga una imagen desde el navegador
 * Usa canvas fallback para evitar CORS
 */
async function downloadImage(imageUrl) {
  console.log('[HF] 📥 Descargando imagen:', imageUrl)
  
  try {
    // Intento 1: fetch directo
    const cacheBustUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + `_cb=${Date.now()}`
    
    const res = await fetch(cacheBustUrl, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    })
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    
    const arrayBuffer = await res.arrayBuffer()
    console.log('[HF] ✅ Descarga directa:', arrayBuffer.byteLength, 'bytes')
    
    return {
      buffer: new Uint8Array(arrayBuffer),
      contentType: res.headers.get('content-type') || 'image/png'
    }
    
  } catch (err) {
    console.warn('[HF] ⚠️ Descarga directa falló, usando canvas fallback...')
    
    // Fallback: Usar <img> + canvas
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    await new Promise((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Image load failed'))
      setTimeout(() => reject(new Error('Image load timeout')), 30000)
      img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + `_cb=${Date.now()}`
    })
    
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')),
        'image/png',
        0.95
      )
    })
    
    const arrayBuffer = await blob.arrayBuffer()
    console.log('[HF] ✅ Canvas fallback:', arrayBuffer.byteLength, 'bytes')
    
    return {
      buffer: new Uint8Array(arrayBuffer),
      contentType: 'image/png'
    }
  }
}

/**
 * Llama a HuggingFace Inference API
 * @returns {Promise<{predictions: Array, model: string}>} Predicciones y nombre del modelo
 */
async function callHuggingFace(modelName, imageBuffer, hfToken = '') {
  console.log('[HF] 🤖 Modelo:', modelName)
  console.log('[HF] 📊 Buffer:', imageBuffer.length, 'bytes')
  
  const headers = { 'Content-Type': 'application/octet-stream' }
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const url = `https://api-inference.huggingface.co/models/${modelName}`
    console.log('[HF] 📡 URL:', url)
    
    const startTime = Date.now()
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: imageBuffer,
      signal: controller.signal
    })
    const duration = Date.now() - startTime

    clearTimeout(timeout)
    
    console.log('[HF] 📥 Respuesta:', res.status, `(${duration}ms)`)

    // Model loading
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}))
      const wait = Math.min(body.estimated_time ?? 20, 30)
      console.log(`[HF] ⏳ Modelo cargando, esperando ${wait}s...`)
      await new Promise(r => setTimeout(r, wait * 1000))
      
      console.log('[HF] 🔄 Reintentando...')
      return callHuggingFace(modelName, imageBuffer, hfToken)
    }

    if (!res.ok) {
      const errorText = await res.text()
      console.error('[HF] ❌ Error:', errorText.slice(0, 200))
      throw new Error(`HTTP ${res.status}: ${errorText.slice(0, 100)}`)
    }

    const result = await res.json()
    console.log('[HF] ✅ Predicciones:', result.length)
    
    return {
      predictions: result,
      model: modelName
    }
    
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('Timeout (60s)')
    }
    throw err
  }
}

/**
 * Parsea predicciones de HuggingFace
 * @param {Array} predictions - Array de predicciones de HF
 * @param {string} modelName - Nombre del modelo usado
 * @returns {string[]} Array de tags filtrados
 */
function parsePredictions(predictions, modelName) {
  if (!Array.isArray(predictions)) return []
  
  // Usar threshold específico del modelo o el default
  const threshold = MODEL_THRESHOLDS[modelName] || MODEL_THRESHOLDS['default']
  console.log(`[HF] 🎯 Threshold para ${modelName}: ${threshold}`)
  
  return predictions
    .filter(p => p.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(p => {
      let tag = p.label
      tag = tag.replace(/_/g, ' ')
      tag = tag.replace(/\s+/g, ' ')
      tag = tag.trim().toLowerCase()
      return tag
    })
    .filter(tag => tag.length > 0)
    .slice(0, 200)
}

/**
 * Genera tags desde el navegador (sin Companion App)
 * 
 * @param {string} imageUrl - URL de la imagen
 * @param {'wd'|'e621'|'pawfect'} taggerType - Tipo de tagger
 * @param {string} hfToken - Token de HuggingFace (opcional)
 * @param {Function} onStatus - Callback de progreso
 * @returns {Promise<string[]>} Tags generados
 */
export async function generateTagsFromBrowser(imageUrl, taggerType = 'wd', hfToken = '', onStatus = null) {
  console.log('[HF] ━━━━ GENERANDO TAGS DESDE NAVEGADOR ━━━━')
  console.log('[HF] 🖼️  Imagen:', imageUrl)
  console.log('[HF] 🤖 Tagger:', taggerType)
  console.log('[HF] 🔑 Token:', hfToken ? 'Configurado' : 'No configurado')
  
  const models = HF_MODELS[taggerType]
  if (!models) {
    throw new Error(`Tagger type inválido: ${taggerType}`)
  }

  try {
    // Paso 1: Descargar imagen
    onStatus?.('Descargando imagen...')
    const { buffer } = await downloadImage(imageUrl)
    
    // Paso 2: Probar modelos hasta que uno funcione
    const errors = []
    
    for (let i = 0; i < models.length; i++) {
      const model = models[i]
      
      try {
        onStatus?.(`Generando tags con ${model}... (${i + 1}/${models.length})`)
        console.log(`[HF] 🎯 Intento ${i + 1}/${models.length}: ${model}`)
        
        const { predictions, model: usedModel } = await callHuggingFace(model, buffer, hfToken)
        const tags = parsePredictions(predictions, usedModel)
        
        console.log('[HF] ━━━━ ÉXITO ━━━━')
        console.log('[HF] ✅ Modelo:', usedModel)
        console.log('[HF] 📊 Tags:', tags.length)
        console.log('[HF] 🏷️  Top 10:', tags.slice(0, 10).join(', '))
        
        onStatus?.(`✅ ${tags.length} tags generados`)
        
        return tags
        
      } catch (err) {
        console.error(`[HF] ❌ Modelo ${model} falló:`, err.message)
        errors.push(`${model}: ${err.message}`)
        
        if (i < models.length - 1) {
          onStatus?.(`Modelo ${model} falló, probando siguiente...`)
        }
      }
    }
    
    // Todos los modelos fallaron
    console.error('[HF] ❌ TODOS LOS MODELOS FALLARON')
    errors.forEach((e, i) => console.error(`[HF]   ${i + 1}. ${e}`))
    
    throw new Error(`Todos los modelos fallaron: ${errors.join(' | ')}`)
    
  } catch (err) {
    console.error('[HF] ❌ Error fatal:', err.message)
    onStatus?.(`❌ Error: ${err.message}`)
    throw err
  }
}

/**
 * Funciones específicas por tagger (compatibilidad con API anterior)
 */

export async function generateTagsWD(imageUrl, hfToken = '', onStatus = null) {
  return generateTagsFromBrowser(imageUrl, 'wd', hfToken, onStatus)
}

export async function generateTagsE621(imageUrl, hfToken = '', onStatus = null) {
  return generateTagsFromBrowser(imageUrl, 'e621', hfToken, onStatus)
}

export async function generateTagsPAWFECT(imageUrl, hfToken = '', onStatus = null) {
  return generateTagsFromBrowser(imageUrl, 'pawfect', hfToken, onStatus)
}
