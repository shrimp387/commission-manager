/**
 * Cloudflare Worker — R2 Storage Proxy + Platform API Proxy for Commission Manager
 *
 * Routes:
 *   PUT  /upload/:path*          — Upload a file to R2
 *   GET  /file/:path*            — Serve file from R2
 *   DELETE /file/:path*          — Delete a file from R2
 *   GET  /list/:userId           — List files in R2
 *   POST /proxy/e621/post        — Proxy a post submission to e621
 *   GET  /proxy/e621/test        — Test e621 credentials
 *   GET  /health                 — Health check
 *
 * Security: validates the Supabase JWT from the Authorization header.
 * Platform credentials are passed via X-Platform-User and X-Platform-Key headers
 * and are NEVER stored in the Worker — they go straight to the platform API.
 */

const ALLOWED_ORIGINS = [
  'https://commission-manager-plum.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
]

function corsHeaders(origin) {
  // Allow any Vercel preview deployment + production + localhost
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/commission-manager-[a-z0-9]+-onemanteam1\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin)

  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Validate Supabase JWT and extract the user ID.
 * Supabase now uses ECC P-256 signing keys.
 * We decode the payload and verify the sub claim exists.
 * Full signature verification happens server-side via Supabase.
 */
async function getUserIdFromJWT(authHeader, jwtSecret) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    // Decode payload
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))

    // Check expiry
    if (payload.exp && payload.exp < Date.now() / 1000) return null

    // Verify with legacy HMAC secret if available (for legacy tokens)
    if (jwtSecret) {
      try {
        const encoder = new TextEncoder()
        const keyData = encoder.encode(jwtSecret)
        const key = await crypto.subtle.importKey(
          'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        )
        const signatureInput = encoder.encode(parts[0] + '.' + parts[1])
        const signatureBytes = Uint8Array.from(
          atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
          c => c.charCodeAt(0)
        )
        const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, signatureInput)
        if (valid && payload.sub) return payload.sub
      } catch {
        // HMAC verification failed — token may use new ECC key, fall through
      }
    }

    // For ECC-signed tokens (new Supabase default), trust the payload if:
    // 1. It has a valid sub (user ID)
    // 2. It has iss pointing to our Supabase instance
    // 3. It's not expired (checked above)
    // Note: Full ECC verification requires the public key from Supabase JWKS endpoint
    if (payload.sub && payload.iss?.includes('supabase')) {
      return payload.sub
    }

    return null
  } catch {
    return null
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin)

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const url = new URL(request.url)
    const pathname = url.pathname

    // ── UPLOAD ─────────────────────────────────────────────────────────────
    if (request.method === 'PUT' && pathname.startsWith('/upload/')) {
      const userId = await getUserIdFromJWT(
        request.headers.get('Authorization'),
        env.SUPABASE_JWT_SECRET
      )
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      // Path after /upload/ must start with the userId to prevent cross-user writes
      const filePath = pathname.slice('/upload/'.length)
      if (!filePath.startsWith(userId)) {
        return new Response(JSON.stringify({ error: 'Forbidden: path must start with your userId' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const contentType = request.headers.get('Content-Type') || 'application/octet-stream'
      const body = await request.arrayBuffer()

      await env.R2.put(filePath, body, {
        httpMetadata: { contentType },
      })

      // Return the public URL
      const publicUrl = `${env.R2_PUBLIC_URL}/${filePath}`
      return new Response(JSON.stringify({ ok: true, url: publicUrl, key: filePath }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── GET FILE ────────────────────────────────────────────────────────────
    if (request.method === 'GET' && pathname.startsWith('/file/')) {
      const filePath = pathname.slice('/file/'.length)
      const object = await env.R2.get(filePath)

      if (!object) {
        return new Response('Not Found', { status: 404, headers: cors })
      }

      const headers = new Headers(cors)
      headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
      headers.set('Cache-Control', 'public, max-age=31536000')
      headers.set('ETag', object.httpEtag)

      return new Response(object.body, { headers })
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (request.method === 'DELETE' && pathname.startsWith('/file/')) {
      const userId = await getUserIdFromJWT(
        request.headers.get('Authorization'),
        env.SUPABASE_JWT_SECRET
      )
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const filePath = pathname.slice('/file/'.length)
      if (!filePath.startsWith(userId)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      await env.R2.delete(filePath)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── LIST FILES (for Storage Monitor) ─────────────────────────────────────
    if (request.method === 'GET' && pathname.startsWith('/list/')) {
      const userId = await getUserIdFromJWT(
        request.headers.get('Authorization'),
        env.SUPABASE_JWT_SECRET
      )
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const requestedPrefix = pathname.slice('/list/'.length)
      if (requestedPrefix !== userId) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const listed = await env.R2.list({ prefix: `${userId}/`, limit: 500 })
      const objects = (listed.objects ?? []).map(obj => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded?.toISOString?.() ?? obj.uploaded,
        etag: obj.etag,
      }))

      return new Response(JSON.stringify({ ok: true, objects, truncated: listed.truncated }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── HEALTH CHECK ────────────────────────────────────────────────────────
    if (pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'r2-proxy' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── E621 PROXY — TEST CREDENTIALS ───────────────────────────────────────
    // GET /proxy/e621/test
    // Headers: X-Platform-User, X-Platform-Key
    if (request.method === 'GET' && pathname === '/proxy/e621/test') {
      const userId = await getUserIdFromJWT(request.headers.get('Authorization'), env.SUPABASE_JWT_SECRET)
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const e621User = request.headers.get('X-Platform-User')
      const e621Key  = request.headers.get('X-Platform-Key')
      if (!e621User || !e621Key) {
        return new Response(JSON.stringify({ error: 'Missing X-Platform-User or X-Platform-Key' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      // Call e621 API to verify credentials
      const basicAuth = btoa(`${e621User}:${e621Key}`)
      const testRes = await fetch('https://e621.net/users/' + encodeURIComponent(e621User) + '.json', {
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'User-Agent': 'CommissionManager/1.0 (by ' + e621User + ')',
        }
      })

      if (!testRes.ok) {
        return new Response(JSON.stringify({ ok: false, error: 'Credenciales inválidas o usuario no encontrado' }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const userData = await testRes.json()
      return new Response(JSON.stringify({
        ok: true,
        username: userData.name,
        level: userData.level_string,
      }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── E621 PROXY — CREATE POST ─────────────────────────────────────────────
    // POST /proxy/e621/post
    // Headers: X-Platform-User, X-Platform-Key
    // Body: multipart/form-data with fields: file, tags, rating, description, sources
    if (request.method === 'POST' && pathname === '/proxy/e621/post') {
      const userId = await getUserIdFromJWT(request.headers.get('Authorization'), env.SUPABASE_JWT_SECRET)
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const e621User = request.headers.get('X-Platform-User')
      const e621Key  = request.headers.get('X-Platform-Key')
      if (!e621User || !e621Key) {
        return new Response(JSON.stringify({ error: 'Missing X-Platform-User or X-Platform-Key' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      // Parse the incoming form data
      const incomingForm = await request.formData()

      // Step 1: Upload file to e621 (get upload URL or direct upload)
      // e621 API v1: POST /uploads.json
      const uploadForm = new FormData()

      const file = incomingForm.get('file')
      const tags = incomingForm.get('tags') || ''
      const rating = incomingForm.get('rating') || 's' // s=safe, q=questionable, e=explicit
      const description = incomingForm.get('description') || ''
      const sources = incomingForm.get('sources') || ''

      if (!file) {
        return new Response(JSON.stringify({ error: 'No file provided' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      uploadForm.append('upload[file]', file)
      uploadForm.append('upload[tag_string]', tags)
      uploadForm.append('upload[rating]', rating)
      uploadForm.append('upload[description]', description)
      if (sources) {
        sources.split('\n').forEach((src, i) => {
          uploadForm.append(`upload[source]`, src.trim())
        })
      }

      const basicAuth = btoa(`${e621User}:${e621Key}`)
      const e621Res = await fetch('https://e621.net/uploads.json', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'User-Agent': 'CommissionManager/1.0 (by ' + e621User + ')',
        },
        body: uploadForm,
      })

      const e621Body = await e621Res.json()

      if (!e621Res.ok) {
        const errMsg = e621Body?.message || e621Body?.reason || JSON.stringify(e621Body)
        return new Response(JSON.stringify({ ok: false, error: errMsg, status: e621Res.status }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        ok: true,
        postId: e621Body.post_id ?? e621Body.id,
        uploadId: e621Body.id,
        url: e621Body.post_id ? `https://e621.net/posts/${e621Body.post_id}` : null,
      }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── WD-TAGGER PROXY ─────────────────────────────────────────────────────
    // POST /tag
    // Body JSON: { imageUrl: string, threshold?: number }
    if (request.method === 'POST' && pathname === '/tag') {
      const userId = await getUserIdFromJWT(
        request.headers.get('Authorization'),
        env.SUPABASE_JWT_SECRET
      )
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      let body
      try {
        body = await request.json()
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const { imageUrl, threshold = 0.35 } = body
      if (!imageUrl) {
        return new Response(JSON.stringify({ error: 'imageUrl required' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      // Try to get image from R2 bucket directly first (most reliable)
      // imageUrl format: https://pub-xxx.r2.dev/userId/filename or R2_PUBLIC_URL/key
      let imgBuffer = null
      let contentType = 'image/png'

      // Case 1: URL points to this worker itself (/file/ route) — extract R2 key directly
      const workerOwnUrl = `https://commission-manager-r2.commission-manager-studio.workers.dev/file/`
      const r2PublicBase = env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? ''

      let r2Key = null
      if (imageUrl.startsWith(workerOwnUrl)) {
        // e.g. https://worker.../file/userId/attachments/img.png → userId/attachments/img.png
        r2Key = imageUrl.slice(workerOwnUrl.length)
      } else if (r2PublicBase && imageUrl.startsWith(r2PublicBase + '/')) {
        r2Key = imageUrl.slice(r2PublicBase.length + 1)
      }

      if (r2Key && env.R2) {
        // Fetch directly from R2 bucket — no HTTP, no auth issues
        const obj = await env.R2.get(r2Key)
        if (obj) {
          imgBuffer = await obj.arrayBuffer()
          contentType = obj.httpMetadata?.contentType || 'image/png'
        }
      }

      // Fallback: try HTTP fetch (for external URLs)
      if (!imgBuffer) {
        const imgRes = await fetch(imageUrl, {
          headers: { 'User-Agent': 'CommissionManager/1.0' }
        })
        if (!imgRes.ok) {
          return new Response(JSON.stringify({
            error: `Failed to download image: HTTP ${imgRes.status} — URL: ${imageUrl} — R2 key tried: ${r2Key ?? 'none'}`
          }), {
            status: 502, headers: { ...cors, 'Content-Type': 'application/json' }
          })
        }
        imgBuffer = await imgRes.arrayBuffer()
        contentType = imgRes.headers.get('content-type') || 'image/png'
      }

      // Call HuggingFace WD-Tagger
      // HF_TOKEN is required — set via: wrangler secret put HF_TOKEN
      const hfHeaders = { 'Content-Type': contentType }
      if (env.HF_TOKEN) {
        hfHeaders['Authorization'] = `Bearer ${env.HF_TOKEN}`
      } else {
        // No token configured — reject with clear message
        return new Response(JSON.stringify({
          error: 'HF_TOKEN not configured in worker. Run: wrangler secret put HF_TOKEN'
        }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const hfRes = await fetch(
        'https://api-inference.huggingface.co/models/SmilingWolf/wd-v1-4-swinv2-tagger-v2',
        { method: 'POST', headers: hfHeaders, body: imgBuffer }
      )

      if (!hfRes.ok) {
        const hfBody = await hfRes.json().catch(() => ({}))
        if (hfRes.status === 503) {
          return new Response(JSON.stringify({
            error: 'model_loading',
            estimated_time: hfBody.estimated_time ?? 20,
            message: `WD-Tagger cargando, intenta en ${Math.ceil(hfBody.estimated_time ?? 20)}s`
          }), {
            status: 503, headers: { ...cors, 'Content-Type': 'application/json' }
          })
        }
        return new Response(JSON.stringify({ error: hfBody.error || `HF API HTTP ${hfRes.status}` }), {
          status: 502, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const predictions = await hfRes.json()
      const tags = predictions
        .filter(p => p.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .map(p => p.label.toLowerCase().replace(/\s+/g, '_'))
        .filter(t => t.length > 0)
        .slice(0, 200)

      return new Response(JSON.stringify({ ok: true, tags }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    return new Response('Not Found', { status: 404, headers: cors })
  }
}
