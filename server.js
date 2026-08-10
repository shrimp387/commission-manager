/**
 * Proxy server para evitar CORS al llamar la API de Taskade desde el browser.
 * Corre en puerto 3001 y reenvía todas las peticiones a taskade.com/api/v1
 */
import http from 'http'
import https from 'https'
import { URL } from 'url'

const PORT = 3001
const TASKADE_API = 'https://www.taskade.com/api/v1'
const API_KEY = process.env.VITE_TASKADE_API_KEY || process.env.TASKADE_API_KEY

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const server = http.createServer((req, res) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  // Collect full request body first (needed for POST/PUT/DELETE with body)
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks)

    // Strip /proxy prefix
    const path = req.url.replace(/^\/proxy/, '')
    const target = new URL(TASKADE_API + path)

    const options = {
      hostname: target.hostname,
      port: 443,
      path: target.pathname + target.search,
      method: req.method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Only set Content-Length if there's a body
        ...(body.length > 0 ? { 'Content-Length': body.length } : {}),
      },
    }

    const proxy = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...CORS_HEADERS,
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      })
      proxyRes.pipe(res)
    })

    proxy.on('error', (err) => {
      res.writeHead(500, CORS_HEADERS)
      res.end(JSON.stringify({ ok: false, statusMessage: err.message }))
    })

    // Write collected body to proxy request
    if (body.length > 0) {
      proxy.write(body)
    }
    proxy.end()
  })

  req.on('error', (err) => {
    res.writeHead(500, CORS_HEADERS)
    res.end(JSON.stringify({ ok: false, statusMessage: err.message }))
  })
})

server.listen(PORT, () => {
  console.log(`✅ Proxy Taskade corriendo en http://localhost:${PORT}`)
  console.log(`   Ejemplo: GET http://localhost:${PORT}/proxy/workspaces`)
})
