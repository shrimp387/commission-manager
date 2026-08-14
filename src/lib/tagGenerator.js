/**
 * tagGenerator.js — Generación de tags via Companion App + JTP local
 *
 * Flujo: Vercel → Supabase tag_requests → Companion App → JTP (localhost:5621)
 * NO usa HuggingFace. El modelo corre localmente en la PC del artista.
 */
import { getConfig } from '../store/appConfig.js'
import { requestTagsFromCompanion } from './tagRequestsDb.js'

const MAX_TAGS = 200

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function normalizeTag(s) {
  if (typeof s !== 'string') return ''
  return s.toLowerCase().replace(/\s+/g, '_')
}

export function identifyHighResAttachment(attachments) {
  if (!Array.isArray(attachments)) return null
  const images = attachments.filter(a => typeof a?.type === 'string' && a.type.startsWith('image/'))
  if (images.length === 0) return null
  return images.reduce((best, current) =>
    (current.size ?? 0) > (best.size ?? 0) ? current : best
  )
}

// ── Mistral Vision (único backend que NO usa companion) ───────────────────────
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'
const MISTRAL_TIMEOUT_MS = 20_000
const VISION_MODELS = new Set(['pixtral-12b-2409', 'pixtral-large-latest'])

const TAG_PROMPT = `You are an expert e621 tagger. Analyze this artwork image in detail and generate as many accurate tags as possible in e621 format.

Return ONLY a comma-separated list of tags, nothing else. No explanations, no categories, just tags.

Include tags from these categories:
- species: all species present (e.g. fox, dragon, wolf, cat, human, anthro, feral)
- body: physical features (e.g. fur, scales, tail, ears, wings, claws, paws, mane)
- character: character names if recognizable
- gender: male, female, intersex, ambiguous_gender
- anatomy: body parts visible
- clothing: clothed, partially_clothed, nude, naked
- count: solo, duo, trio, group
- pose: standing, lying, sitting, etc.
- expression: smile, blush, open_mouth, etc.
- setting: indoor, outdoor, bedroom, forest, etc.
- art_style: digital_art, traditional_art, sketch, etc.
- quality: hi_res, detailed, shading, colored, etc.

Rules: underscores instead of spaces, lowercase, 50-120 tags.
Format: tag1, tag2, tag3, ...`

async function generateTagsMistral(imageUrl) {
  const cfg = getConfig()
  const mistralApiKey = cfg.mistralApiKey
  const mistralModel  = cfg.mistralModel || 'pixtral-large-latest'

  if (!mistralApiKey) throw new ConfigError('Configura tu API Key de Mistral en Conexiones → Mistral AI.')
  if (!VISION_MODELS.has(mistralModel)) throw new ConfigError(`El modelo "${mistralModel}" no soporta imágenes. Cambia a Pixtral.`)

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), MISTRAL_TIMEOUT_MS)

  try {
    const res = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mistralApiKey}` },
      body: JSON.stringify({
        model: mistralModel,
        max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'text', text: TAG_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ]}],
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error?.message || `HTTP ${res.status}`)
    }
    const data = await res.json()
    return parseTags(data.choices?.[0]?.message?.content ?? '')
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout con Mistral')
    if (err instanceof ConfigError) throw err
    throw err
  } finally {
    clearTimeout(timerId)
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateTags(imageUrl, backend, onStatus) {
  const cfg = getConfig()
  const resolvedBackend = backend ?? cfg.tagBackend ?? 'e621'

  console.log('[tagGenerator] 🎯 Backend:', resolvedBackend)
  console.log('[tagGenerator] 🖥️  Método: Companion App → JTP local (localhost:5621)')

  if (resolvedBackend === 'mistral') {
    return generateTagsMistral(imageUrl)
  }

  // Todos los demás backends van via companion app
  // La companion app llama al servidor JTP local en puerto 5621
  const taggerType = ['e621', 'pawfect', 'wd'].includes(resolvedBackend) ? resolvedBackend : 'e621'
  console.log(`[tagGenerator] 📡 Enviando request a companion app (tagger: ${taggerType})...`)
  onStatus?.(`Enviando a Companion App para generar tags con JTP...`)

  return requestTagsFromCompanion(imageUrl, taggerType, onStatus)
}

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
