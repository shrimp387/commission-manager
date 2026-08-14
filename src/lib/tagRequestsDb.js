/**
 * tagRequestsDb.js — Canal de comunicación web ↔ companion para WD-Tagger.
 *
 * La web inserta un tag_request en Supabase.
 * La companion (corriendo en la PC del artista) hace polling, genera los tags
 * localmente con WD-Tagger (sin bloqueos de CF/CORS), y guarda el resultado.
 * La web hace polling hasta recibir los tags.
 */
import { supabase } from './supabase.js'
import { getCurrentUserId } from './db.js'

const POLL_INTERVAL_MS = 2000   // cada 2s
const MAX_WAIT_MS      = 30_000 // 30s máximo — si la companion no responde, cae al browser

/**
 * Solicita tags para una imagen via la companion app.
 * Inserta un tag_request en Supabase y espera el resultado.
 *
 * @param {string} imageUrl
 * @param {'wd' | 'e621' | 'pawfect'} taggerType — tipo de tagger a usar
 * @param {(status: string) => void} [onStatus] — callback de progreso
 * @returns {Promise<string[]>} array de tags normalizados
 */
export async function requestTagsFromCompanion(imageUrl, taggerType = 'wd', onStatus) {
  const userId = getCurrentUserId()
  if (!userId) throw new Error('Usuario no autenticado')

  // Validar taggerType
  const validTypes = ['wd', 'e621', 'pawfect']
  if (!validTypes.includes(taggerType)) {
    throw new Error(`Tipo de tagger inválido: ${taggerType}. Debe ser uno de: ${validTypes.join(', ')}`)
  }

  const taggerNames = {
    wd: 'WD-Tagger',
    e621: 'E621-Tagger',
    pawfect: 'P.A.W.F.E.C.T'
  }
  const taggerName = taggerNames[taggerType]

  console.log(`[tagRequestsDb] ━━━━ SOLICITANDO TAGS ━━━━`)
  console.log(`[tagRequestsDb] 🖼️  Imagen: ${imageUrl.slice(0, 80)}${imageUrl.length > 80 ? '...' : ''}`)
  console.log(`[tagRequestsDb] 🤖 Tagger: ${taggerType} (${taggerName})`)
  console.log(`[tagRequestsDb] 👤 User ID: ${userId}`)

  onStatus?.(`Enviando solicitud a la Companion App (${taggerName})...`)

  // Insertar solicitud con tagger_type
  const { data: req, error: insertErr } = await supabase
    .from('tag_requests')
    .insert({ 
      user_id: userId, 
      image_url: imageUrl, 
      tagger_type: taggerType,
      status: 'pending' 
    })
    .select()
    .single()

  if (insertErr) {
    console.error(`[tagRequestsDb] ❌ Error insertando tag_request`)
    console.error(`[tagRequestsDb] 💬 ${insertErr.message}`)
    throw new Error(`Error creando tag_request: ${insertErr.message}`)
  }

  const requestId = req.id
  console.log(`[tagRequestsDb] ✅ Tag request creado`)
  console.log(`[tagRequestsDb] 🆔 Request ID: ${requestId}`)
  console.log(`[tagRequestsDb] 📡 Status inicial: pending`)
  
  onStatus?.(`Esperando que la Companion App genere los tags con ${taggerName}...`)

  // Polling hasta recibir resultado
  const start = Date.now()
  let lastStatus = 'pending'
  
  console.log(`[tagRequestsDb] 🔄 Iniciando polling (máximo ${MAX_WAIT_MS / 1000}s)...`)
  
  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const elapsed = Math.floor((Date.now() - start) / 1000)
    console.log(`[tagRequestsDb] 🔄 Polling... (${elapsed}s transcurridos)`)

    const { data: result } = await supabase
      .from('tag_requests')
      .select('status, tags, error_msg')
      .eq('id', requestId)
      .single()

    if (!result) {
      console.warn(`[tagRequestsDb] ⚠️  Request no encontrado en Supabase`)
      continue
    }

    // Log cambio de status
    if (result.status !== lastStatus) {
      console.log(`[tagRequestsDb] 📊 Status cambió: ${lastStatus} → ${result.status}`)
      lastStatus = result.status
    }

    if (result.status === 'done' && Array.isArray(result.tags)) {
      console.log(`[tagRequestsDb] ━━━━ TAGS RECIBIDOS ━━━━`)
      console.log(`[tagRequestsDb] ✅ Status: done`)
      console.log(`[tagRequestsDb] 📊 Cantidad: ${result.tags.length} tags`)
      console.log(`[tagRequestsDb] ⏱️  Tiempo total: ${((Date.now() - start) / 1000).toFixed(2)}s`)
      console.log(`[tagRequestsDb] 🏷️  Muestra: ${result.tags.slice(0, 5).join(', ')}${result.tags.length > 5 ? '...' : ''}`)
      console.log(`[tagRequestsDb] 🧹 Limpiando request de Supabase...`)
      
      onStatus?.(`✅ ${result.tags.length} tags generados con ${taggerName}`)
      
      // Limpiar el request
      supabase.from('tag_requests').delete().eq('id', requestId).then(() => {
        console.log(`[tagRequestsDb] ✅ Request limpiado`)
      })
      
      return result.tags
    }

    if (result.status === 'error') {
      console.error(`[tagRequestsDb] ━━━━ ERROR ━━━━`)
      console.error(`[tagRequestsDb] ❌ Status: error`)
      console.error(`[tagRequestsDb] 💬 Mensaje: ${result.error_msg || 'Sin mensaje de error'}`)
      console.error(`[tagRequestsDb] 🧹 Limpiando request de Supabase...`)
      
      // Limpiar el request
      supabase.from('tag_requests').delete().eq('id', requestId).then(() => {})
      
      throw new Error(result.error_msg || `La Companion App falló al generar tags con ${taggerName}`)
    }

    if (result.status === 'processing') {
      console.log(`[tagRequestsDb] ⚙️  Status: processing - Companion App está generando tags...`)
      onStatus?.(`Analizando imagen con ${taggerName}...`)
    }
  }

  // Timeout — limpiar y tirar error
  console.error(`[tagRequestsDb] ━━━━ TIMEOUT ━━━━`)
  console.error(`[tagRequestsDb] ⏱️  Excedió ${MAX_WAIT_MS / 1000}s`)
  console.error(`[tagRequestsDb] ❓ ¿Está la Companion App abierta?`)
  console.error(`[tagRequestsDb] 🧹 Limpiando request de Supabase...`)
  
  supabase.from('tag_requests').delete().eq('id', requestId).then(() => {})
  throw new Error(`Timeout: La Companion App no respondió en 90 segundos. ¿Está abierta?`)
}
