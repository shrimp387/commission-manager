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
const MAX_WAIT_MS      = 90_000 // 90s máximo de espera

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

  if (insertErr) throw new Error(`Error creando tag_request: ${insertErr.message}`)

  const requestId = req.id
  onStatus?.(`Esperando que la Companion App genere los tags con ${taggerName}...`)

  // Polling hasta recibir resultado
  const start = Date.now()
  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const { data: result } = await supabase
      .from('tag_requests')
      .select('status, tags, error_msg')
      .eq('id', requestId)
      .single()

    if (!result) continue

    if (result.status === 'done' && Array.isArray(result.tags)) {
      onStatus?.(`✅ ${result.tags.length} tags generados con ${taggerName}`)
      // Limpiar el request
      supabase.from('tag_requests').delete().eq('id', requestId).then(() => {})
      return result.tags
    }

    if (result.status === 'error') {
      throw new Error(result.error_msg || `La Companion App falló al generar tags con ${taggerName}`)
    }

    if (result.status === 'processing') {
      onStatus?.(`Analizando imagen con ${taggerName}...`)
    }
  }

  // Timeout — limpiar y tirar error
  supabase.from('tag_requests').delete().eq('id', requestId).then(() => {})
  throw new Error(`Timeout: La Companion App no respondió en 90 segundos. ¿Está abierta?`)
}
