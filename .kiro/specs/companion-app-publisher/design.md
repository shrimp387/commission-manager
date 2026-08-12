# Design: Companion App Publisher

## Overview

La companion app publisher es un sistema en dos capas:

1. **Companion App (Electron)** — Corre en la PC del artista. Hace polling de `publish_jobs` en Supabase cada 5 segundos y ejecuta cada job llamando al módulo de plataforma correspondiente.
2. **App Web (Vercel/React)** — Cuando el artista hace clic en "Publicar" en el `PublishPanel`, inserta un job en `publish_jobs` vía `publishJobsDb.js` y la companion app lo recoge automáticamente.

El flujo es: `PublishPanel.jsx` → `publish_jobs` (Supabase) → `main.js` polling → `jobRunner.js` → módulo de plataforma.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              App Web (Vercel)                    │
│                                                  │
│  PublishPanel.jsx                                │
│       │                                          │
│       ├─ PostyBirb accounts ──→ postybirb.js     │
│       └─ Companion platforms ──→ publishJobsDb.js│
│                   │                              │
│                   ▼                              │
│          Supabase: publish_jobs                  │
└─────────────────────┬───────────────────────────┘
                      │ polling each 5s
┌─────────────────────▼───────────────────────────┐
│              Companion App (Electron)            │
│                                                  │
│  main.js ──→ jobRunner.js                        │
│                   │                              │
│    ┌──────────────┼──────────────────┐           │
│    ▼              ▼                  ▼           │
│  e621.js    inkbunny.js   weasyl.js  bluesky.js  │
│  telegram.js              discord.js             │
│                                                  │
│  electron-store (credenciales cifradas en disco) │
│  settings.html (ventana de configuración)        │
└─────────────────────────────────────────────────┘
```

---

## Database Schema

### Tabla `publish_jobs`

```sql
CREATE TABLE publish_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id       UUID,
  task_name     TEXT,
  image_url     TEXT        NOT NULL,
  platforms     TEXT[]      NOT NULL,
  title         TEXT        NOT NULL,
  description   TEXT,
  tags          TEXT[],
  rating        TEXT        DEFAULT 'safe',
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','completed','partial','error')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  results       JSONB,      -- [{ platform, ok, url }]
  errors        JSONB,      -- [{ platform, error }]
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE publish_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_publish_jobs" ON publish_jobs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for polling performance
CREATE INDEX idx_publish_jobs_user_status
  ON publish_jobs (user_id, status);
```

El campo `results` almacena el resultado por plataforma: `[{ platform: 'e621', ok: true, url: 'https://e621.net/posts/123' }]`. El campo `errors` almacena fallos por plataforma: `[{ platform: 'inkbunny', error: 'Login failed' }]`.

---

## Component Design

### 1. Módulos de plataformas (`companion-app/src/platforms/`)

Cada módulo sigue el contrato definido en `jobRunner.js`:

```js
// Interfaz requerida por jobRunner.js
module.exports = {
  publish<Platform>(job, credentials) → Promise<{ ok: true, url: string|null }>
  test<Platform>(credentials)         → Promise<{ ok: boolean, username?: string, error?: string }>
}
```

El objeto `job` que recibe cada módulo tiene la forma:
```js
{
  id:          string,   // UUID del job
  image_url:   string,   // URL pública en R2
  title:       string,
  description: string,
  tags:        string[], // array de tags normalizados
  rating:      string,   // 'safe' | 'questionable' | 'explicit'
  task_name:   string,
}
```

#### `e621.js`

```
publishE621(job, credentials)
  1. Validar credentials.username + credentials.apiKey → error si faltan
  2. Descargar imagen desde job.image_url con fetch + AbortController(30s)
  3. Construir FormData: upload[file], upload[tag_string], upload[rating], upload[description], upload[source]
  4. POST https://e621.net/posts.json con Authorization: Basic base64(user:apiKey) y User-Agent requerido
  5. Parsear respuesta JSON → { ok: true, url: 'https://e621.net/posts/<id>' }

testE621(credentials)
  1. GET https://e621.net/users/<username>.json con Authorization: Basic
  2. 200 → { ok: true, username }  |  otro → { ok: false, error }
```

**Nota importante sobre e621:** La API requiere un `User-Agent` descriptivo con nombre de app y contacto, e.g. `CommissionManagerCompanion/1.0 (woundzengberg)`. Sin este header, devuelve 403.

#### `inkbunny.js`

```
publishInkbunny(job, credentials)
  1. Validar credentials.username + credentials.password
  2. POST https://inkbunny.net/api_login.php (x-www-form-urlencoded: username, password)
     → extraer sid del JSON de respuesta
  3. Descargar imagen desde job.image_url
  4. POST https://inkbunny.net/api_upload.php (multipart: sid, uploadedfile[0])
     → extraer submission_id
  5. POST https://inkbunny.net/api_editsubmission.php (multipart: sid, submission_id, title, desc, keywords, type=1)
  6. Retornar { ok: true, url: 'https://inkbunny.net/s/<submission_id>' }

testInkbunny(credentials)
  1. Intentar solo el paso 2 (login)
  2. { ok: true, username } si sid presente | { ok: false, error: error_message }
```

#### `weasyl.js`

```
publishWeasyl(job, credentials)
  1. Validar credentials.apiKey
  2. GET https://www.weasyl.com/api/whoami para obtener el login del usuario
  3. Descargar imagen desde job.image_url
  4. POST https://www.weasyl.com/api/submissions/submit/visual (multipart)
     Headers: X-Weasyl-API-Key
     Campos: submitfile (imagen), title, content (descripción), tags (array), rating (10=general)
     → extraer submitid del JSON de respuesta
  5. Retornar { ok: true, url: 'https://www.weasyl.com/~<login>/submissions/<submitid>' }

testWeasyl(credentials)
  1. GET https://www.weasyl.com/api/whoami con X-Weasyl-API-Key
  2. { ok: true, username: data.login } | { ok: false, error }
```

**Nota sobre ratings de Weasyl:** `10` = General, `30` = Mature, `40` = Explicit. El job usa `'safe'/'questionable'/'explicit'` → mapear a `10/30/40`.

#### `bluesky.js`

```
publishBluesky(job, credentials)
  1. Validar credentials.handle + credentials.appPassword
  2. POST https://bsky.social/xrpc/com.atproto.server.createSession
     Body: { identifier: handle, password: appPassword }
     → extraer accessJwt y did
  3. Descargar imagen desde job.image_url → obtener blob + mimeType
  4. POST https://bsky.social/xrpc/com.atproto.repo.uploadBlob
     Headers: Authorization: Bearer <accessJwt>, Content-Type: <mimeType>
     Body: raw image bytes
     → extraer blob ref
  5. POST https://bsky.social/xrpc/com.atproto.repo.createRecord
     Body: {
       repo: did,
       collection: 'app.bsky.feed.post',
       record: {
         $type: 'app.bsky.feed.post',
         text: title (max 300 chars),
         embed: { $type: 'app.bsky.embed.images#main', images: [{ image: blobRef, alt: title }] },
         createdAt: new Date().toISOString()
       }
     }
     → extraer uri → rkey = uri.split('/').pop()
  6. Retornar { ok: true, url: 'https://bsky.app/profile/<handle>/post/<rkey>' }

testBluesky(credentials)
  1. Solo paso 2 (createSession)
  2. { ok: true, handle } | { ok: false, error: message }
```

#### `telegram.js`

```
publishTelegram(job, credentials)
  1. Validar credentials.botToken + credentials.chatId
  2. Intentar POST .../sendPhoto con: chat_id, photo (URL), caption (title + '\n' + desc, max 1024 chars), parse_mode: 'HTML'
  3. Si falla (respuesta ok: false con error_code 400/413): reintentar con sendDocument (mismo body pero 'document' en vez de 'photo')
  4. Retornar { ok: true, url: null }

testTelegram(credentials)
  1. GET .../getMe
  2. { ok: true, botName: result.username } | { ok: false, error: description }
```

#### `discord.js`

```
publishDiscord(job, credentials)
  1. Validar credentials.webhookUrl empieza con 'https://discord.com/api/webhooks/'
  2. Descargar imagen desde job.image_url
  3. Construir FormData:
     - files[0]: imagen con filename 'artwork.png'
     - payload_json: JSON.stringify({
         embeds: [{
           title: job.title,
           description: job.description || '',
           color: 0x7289DA,
           image: { url: 'attachment://artwork.png' }
         }]
       })
  4. POST credentials.webhookUrl con el FormData
  5. 200 o 204 → { ok: true, url: credentials.webhookUrl }

testDiscord(credentials)
  1. GET credentials.webhookUrl
  2. { ok: true, channelName: data.name } | { ok: false, error }
```

---

### 2. Tabla SQL y migración

Archivo: `companion-app/sql/publish_jobs.sql`

Contiene el DDL completo (CREATE TABLE, RLS, políticas, índice) listo para ejecutar en el SQL Editor de Supabase.

---

### 3. `settings.html` + `ui/settings.js`

La ventana carga `companion-app/ui/settings.html` como archivo local (no hay servidor). Usa solo HTML/CSS/JS vanilla para compatibilidad con Electron sin bundler.

**Estructura de secciones:**

```html
<main>
  <section id="sec-supabase">    Supabase Connection  </section>
  <section id="sec-e621">        e621                 </section>
  <section id="sec-inkbunny">    Inkbunny             </section>
  <section id="sec-weasyl">      Weasyl               </section>
  <section id="sec-bluesky">     Bluesky              </section>
  <section id="sec-telegram">    Telegram             </section>
  <section id="sec-discord">     Discord              </section>
</main>
```

Cada sección tiene:
- Campos de input (text/password según tipo)
- Botón "💾 Guardar" → llama a `window.companion.saveConfig(buildConfig())`
- Botón "🧪 Probar" → llama a `window.companion.testPlatform(platform, creds)` → muestra resultado
- Área de resultado con clase `.result-ok` o `.result-err`

**Carga inicial (`DOMContentLoaded`):**

```js
const cfg = await window.companion.getConfig()
const status = await window.companion.getStatus()
// Pre-rellenar todos los inputs desde cfg
// Mostrar badge Supabase verde/rojo según status.connected
```

**`buildConfig()`** — función que lee todos los inputs actuales y construye el objeto plano para `saveConfig`:

```js
function buildConfig() {
  return {
    supabaseUrl: ...,
    supabaseAnonKey: ...,
    supabaseUserId: ...,
    'platforms.e621.username': ...,
    'platforms.e621.apiKey': ...,
    'platforms.e621.enabled': ...,
    // ...etc para cada plataforma
  }
}
```

`electron-store` acepta dot-notation, por lo que `store.set('platforms.e621.username', value)` funciona directamente.

---

### 4. `src/lib/publishJobsDb.js` (app web)

Sigue el patrón de `publicationsDb.js` — importa `supabase` desde `./supabase.js` y `getCurrentUserId` desde `./db.js`.

```js
// Funciones exportadas:

insertPublishJob(jobData)
  // jobData: { taskId, taskName, imageUrl, platforms, title, description, tags, rating }
  // → INSERT en publish_jobs con user_id = getCurrentUserId()
  // → retorna el registro insertado
  // → lanza 'No autorizado para crear jobs de publicación' si error de RLS

getPublishJobs(userId)
  // → SELECT * FROM publish_jobs WHERE user_id = userId ORDER BY created_at DESC
```

El tipo `PublishJob`:
```js
{
  id:          string,   // UUID (generado por Supabase)
  userId:      string,
  taskId:      string | null,
  taskName:    string | null,
  imageUrl:    string,
  platforms:   string[],
  title:       string,
  description: string,
  tags:        string[],
  rating:      'safe' | 'questionable' | 'explicit',
  status:      'pending' | 'running' | 'completed' | 'partial' | 'error',
  startedAt:   string | null,
  completedAt: string | null,
  results:     object[] | null,
  errors:      object[] | null,
  createdAt:   string,
}
```

---

### 5. Integración en `PublishPanel.jsx`

El `PublishPanel` ya maneja dos rutas: `__e621__` (directo) y PostyBirb (IDs de cuentas). Se agrega una tercera ruta: **companion app**.

**Detección de tipo de cuenta:**

Los IDs de companion platforms siguen el patrón de string simple: `'e621'`, `'inkbunny'`, `'weasyl'`, `'bluesky'`, `'telegram'`, `'discord'`. PostyBirb usa UUIDs. El `__e621__` existente es la ruta directa legacy.

```js
const COMPANION_PLATFORM_IDS = new Set(['e621','inkbunny','weasyl','bluesky','telegram','discord'])

function isCompanionPlatform(id) {
  return COMPANION_PLATFORM_IDS.has(id)
}
```

**En `loadAccounts()`** — agregar companion platforms como cuentas virtuales si están disponibles (consultando si la companion está conectada a Supabase del mismo usuario — o simplemente mostrarlas siempre como opción):

```js
const companionPlatforms = ['e621','inkbunny','weasyl','bluesky','telegram','discord'].map(p => ({
  id: p,
  website: p,
  name: p,
  isCompanion: true,
}))
```

**En `handlePublish()`** — añadir rama para companion:

```js
const companionSelected = selected.filter(id => isCompanionPlatform(id))

if (companionSelected.length > 0) {
  setSendStep('queuing')
  await insertPublishJob({
    taskId,
    taskName: task?.text ?? '',
    imageUrl: highRes.url,
    platforms: companionSelected,
    title: title.trim(),
    description: desc.trim(),
    tags,
    rating: 'safe',
  })
  publishedPlatforms.push(...companionSelected)
}
```

---

## File Structure

```
companion-app/
├── src/
│   ├── main.js              (existente — sin cambios)
│   ├── preload.js           (existente — sin cambios)
│   ├── jobRunner.js         (existente — sin cambios)
│   └── platforms/           (nuevo directorio)
│       ├── e621.js
│       ├── inkbunny.js
│       ├── weasyl.js
│       ├── bluesky.js
│       ├── telegram.js
│       └── discord.js
├── ui/                      (nuevo directorio)
│   ├── settings.html
│   └── settings.js
├── sql/                     (nuevo directorio)
│   └── publish_jobs.sql
└── package.json             (existente)

src/lib/
└── publishJobsDb.js         (nuevo — app web)

src/components/
└── PublishPanel.jsx         (modificar — añadir ruta companion)
```

---

## Correctness Properties

Las siguientes propiedades son verificables con tests:

**Property 1: Contrato de módulos de plataforma**
Todo módulo de plataforma que recibe `credentials` con campos obligatorios vacíos debe lanzar un error sin realizar ninguna petición HTTP.

**Property 2: Idempotencia del schema de publish_job**
`insertPublishJob(job)` seguido de `getPublishJobs(userId)` retorna un array que contiene un registro con exactamente los campos de `job` y `status === 'pending'`.

**Property 3: Routing determinístico**
Para cualquier lista de plataformas seleccionadas, `isCompanionPlatform` clasifica cada ID correctamente sin superposición entre companion, PostyBirb y directo.

**Property 4: Inmutabilidad de resultados parciales**
Si la companion app completa 2 de 3 plataformas, el job se marca como `partial` (no `error` ni `completed`) y `results` contiene exactamente los 2 éxitos y `errors` contiene exactamente 1 fallo.

---

## Security Considerations

- Las credenciales se almacenan en `electron-store` con `encryptionKey` fija en disco — adecuado para uso personal en PC propia.
- Los campos API Key/password en `settings.html` usan `type="password"`.
- El `User-Agent` de e621 incluye contacto del artista para cumplir con los TOS de e621 (requerido, sin este header se obtiene 403).
- Las API Keys nunca se loguean completas — solo los primeros 4 caracteres + `***`.
- La tabla `publish_jobs` tiene RLS: el artista solo puede ver/insertar sus propios jobs.
- La companion app usa `supabaseAnonKey` con `supabaseUserId` para hacer las queries — la app solo puede leer jobs del `user_id` configurado.
