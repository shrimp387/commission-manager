/**
 * tagGenerator.js — Generación automática de tags estilo e621 con OpenAI Vision API.
 *
 * Exports:
 *   normalizeTag(s)                    — función pura de normalización (ÚNICA fuente de verdad)
 *   identifyHighResAttachment(attachments) — selecciona el adjunto imagen de mayor tamaño
 *   generateTags(imageUrl)             — genera tags con OpenAI gpt-4o
 *   parseTags(text)                    — parsea texto libre en array de tags normalizados
 *   ConfigError                        — error lanzado cuando falta API Key
 */
import { getConfig } from '../store/appConfig.js'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const TAG_TIMEOUT_MS = 15_000
const MAX_TAGS = 200

// ── Errors ────────────────────────────────────────────────────────────────────

/** Error lanzado cuando falta la API Key de OpenAI en la configuración. */
export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Normaliza un tag al formato e621.
 * Regla: minúsculas + reemplazar cualquier secuencia de espacios por un guión bajo.
 *
 * Esta es la ÚNICA fuente de verdad para normalización en todo el pipeline.
 * No duplicar esta lógica en ningún otro módulo — importar desde aquí.
 *
 * @param {string} s — string a normalizar
 * @returns {string} tag normalizado
 */
export function normalizeTag(s) {
  if (typeof s !== 'string') return ''
  return s.toLowerCase().replace(/\s+/g, '_')
}

/**
 * Identifica el adjunto de imagen de mayor tamaño (High_Res_Attachment).
 * Selecciona el adjunto cuyo `type` comienza con 'image/' y tiene el mayor `size`.
 *
 * @param {Array<{id: string, type: string, size?: number, url: string, name: string}>} attachments
 * @returns {object|null} el adjunto de mayor tamaño, o null si no hay ninguno
 */
export function identifyHighResAttachment(attachments) {
  if (!Array.isArray(attachments)) return null
  const images = attachments.filter(a => typeof a?.type === 'string' && a.type.startsWith('image/'))
  if (images.length === 0) return null
  return images.reduce((best, current) =>
    (current.size ?? 0) > (best.size ?? 0) ? current : best
  )
}

// ── Tag generation ────────────────────────────────────────────────────────────

const TAG_PROMPT = `Analyze this artwork image and generate tags in e621 format.
Return ONLY a comma-separated list of tags, nothing else.
Use these categories:
- species: the species/type of characters (e.g. fox, dragon, cat, human)
- character: specific character names if recognizable
- artist: art style indicators (e.g. digital_art, traditional_art, sketch)
- general: descriptive tags (e.g. solo, duo, anthro, male, female, clothed, outdoor, smile, looking_at_viewer)
- copyright: franchise/series if recognizable
- meta: technical tags (e.g. hi_res, absurd_res, colored, shading, detailed_background)

Rules:
- Use underscores instead of spaces (e.g. "long_hair" not "long hair")
- Use lowercase only
- Be specific and accurate
- Include 15-40 tags total
- Format: tag1, tag2, tag3, ...`

/**
 * Genera tags automáticos estilo e621 para una imagen usando OpenAI Vision (gpt-4o).
 *
 * @param {string} imageUrl — URL pública de la imagen a analizar
 * @returns {Promise<string[]>} array de tags normalizados (máx. 200)
 * @throws {ConfigError} si la API Key de OpenAI no está configurada
 * @throws {Error} si la API falla o supera el timeout de 15s
 */
export async function generateTags(imageUrl) {
  const { openaiApiKey } = getConfig()

  if (!openaiApiKey) {
    throw new ConfigError(
      'Configura tu API Key de OpenAI en Conexiones para usar esta función.'
    )
  }

  // Log diagnóstico seguro — solo primeros 4 chars + ***
  console.debug(`[tagGenerator] key=${openaiApiKey.slice(0, 4)}***, image=${imageUrl}`)

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), TAG_TIMEOUT_MS)

  try {
    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // API Key SOLO en Authorization header — nunca en URL ni body
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: TAG_PROMPT },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      let errMsg
      try {
        const body = await res.json()
        errMsg = body.error?.message || `Error HTTP ${res.status}`
      } catch {
        errMsg = `Error HTTP ${res.status}: ${res.statusText}`
      }
      throw new Error(errMsg)
    }

    const data = await res.json()
    const rawText = data.choices?.[0]?.message?.content ?? ''
    return parseTags(rawText)
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        'No se pudieron generar tags automáticamente. Puedes agregar tags manualmente.'
      )
    }
    if (err instanceof ConfigError) throw err
    throw err
  } finally {
    clearTimeout(timerId)
  }
}

/**
 * Parsea texto libre de la respuesta de OpenAI en un array de tags normalizados.
 * Acepta comas y saltos de línea como separadores.
 *
 * @param {string} text — texto crudo de la respuesta de OpenAI
 * @returns {string[]} array de tags normalizados, máx. MAX_TAGS elementos
 */
export function parseTags(text) {
  if (!text || typeof text !== 'string') return []
  return text
    .split(/[,\n]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(normalizeTag)
    .filter(t => t.length > 0)
    .slice(0, MAX_TAGS)
}
