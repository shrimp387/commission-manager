/**
 * tagGenerator.js — Generación automática de tags estilo e621 con Mistral Vision API.
 *
 * Exports:
 *   normalizeTag(s)                        — función pura de normalización
 *   identifyHighResAttachment(attachments) — selecciona el adjunto imagen de mayor tamaño
 *   generateTags(imageUrl)                 — genera tags con Mistral Pixtral (NSFW-aware)
 *   parseTags(text)                        — parsea texto libre en array de tags normalizados
 *   ConfigError                            — error lanzado cuando falta API Key
 */
import { getConfig } from '../store/appConfig.js'

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'
const TAG_TIMEOUT_MS  = 20_000
const MAX_TAGS        = 200

// ── Error ─────────────────────────────────────────────────────────────────────

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Normaliza un tag al formato e621.
 * ÚNICA fuente de verdad — no duplicar en otros módulos.
 */
export function normalizeTag(s) {
  if (typeof s !== 'string') return ''
  return s.toLowerCase().replace(/\s+/g, '_')
}

/**
 * Identifica el adjunto de imagen de mayor tamaño.
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

const TAG_PROMPT = `You are an expert e621 tagger. Analyze this artwork image in detail and generate as many accurate tags as possible in e621 format.

Return ONLY a comma-separated list of tags, nothing else. No explanations, no categories, just tags.

Include tags from these categories:
- species: all species present (e.g. fox, dragon, wolf, cat, human, anthro, feral)
- body: physical features (e.g. fur, scales, tail, ears, wings, claws, paws, mane)
- character: character names if recognizable
- gender: male, female, intersex, ambiguous_gender
- anatomy: body parts visible (e.g. breasts, penis, vagina, nipples, butt, abs) — be explicit and accurate
- sexual_acts: any sexual acts depicted (e.g. sex, oral, anal, penetration, masturbation, cum) — be explicit
- clothing: clothed, partially_clothed, nude, naked
- count: solo, duo, trio, group
- pose: standing, lying, sitting, on_all_fours, spread_legs, etc.
- expression: smile, blush, open_mouth, tongue_out, moaning, etc.
- setting: indoor, outdoor, bedroom, forest, etc.
- art_style: digital_art, traditional_art, sketch, watercolor, 3d_render, etc.
- quality: hi_res, absurd_res, detailed, shading, colored, etc.
- rating: rating:e (explicit), rating:q (questionable), rating:s (safe)

Rules:
- Use underscores instead of spaces
- Lowercase only
- Be thorough — aim for 50-120 tags
- Do NOT censor NSFW content — tag everything you see
- Format: tag1, tag2, tag3, ...`

/**
 * Genera tags automáticos estilo e621 usando Mistral Pixtral (NSFW-aware).
 *
 * @param {string} imageUrl — URL pública de la imagen
 * @returns {Promise<string[]>} array de tags normalizados (máx. 200)
 * @throws {ConfigError} si falta la API Key de Mistral
 */
export async function generateTags(imageUrl) {
  const cfg = getConfig()
  const mistralApiKey = cfg.mistralApiKey

  console.debug('[tagGenerator] config keys:', Object.keys(cfg).filter(k => k.includes('mistral') || k.includes('api')))

  if (!mistralApiKey) {
    throw new ConfigError(
      'Configura tu API Key de Mistral en Conexiones → Mistral AI y haz clic en Guardar.'
    )
  }

  console.debug(`[tagGenerator] mistral key=${mistralApiKey.slice(0, 4)}***, image=${imageUrl}`)

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), TAG_TIMEOUT_MS)

  try {
    const res = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: 'pixtral-large-latest',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: TAG_PROMPT },
              { type: 'image_url', image_url: { url: imageUrl } },
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
      throw new Error('Timeout al generar tags. Puedes agregar tags manualmente.')
    }
    if (err instanceof ConfigError) throw err
    throw err
  } finally {
    clearTimeout(timerId)
  }
}

/**
 * Parsea texto libre en un array de tags normalizados.
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
