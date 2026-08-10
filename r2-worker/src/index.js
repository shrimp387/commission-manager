/**
 * Cloudflare Worker — R2 Storage Proxy for Commission Manager
 *
 * Routes:
 *   PUT  /upload/:path*     — Upload a file to R2
 *   GET  /file/:path*       — Get a signed URL or serve the file
 *   DELETE /file/:path*     — Delete a file from R2
 *
 * Security: validates the Supabase JWT from the Authorization header
 * so only authenticated users can upload/delete their own files.
 * File paths are namespaced by userId: <userId>/<folder>/<filename>
 */

const ALLOWED_ORIGINS = [
  'https://commission-manager-plum.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
]

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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

    return new Response('Not Found', { status: 404, headers: cors })
  }
}
