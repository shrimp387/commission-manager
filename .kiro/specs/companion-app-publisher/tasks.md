# Implementation Plan: Companion App Publisher

## Overview

Implementación completa del sistema de publicación de arte en múltiples plataformas usando la companion app Electron como worker. El plan sigue el orden de dependencias: SQL → capa de datos (app web) → módulos de plataformas (Electron) → UI de configuración → integración en PublishPanel.

## Tasks

- [x] 1. Migración SQL — tabla `publish_jobs`
  - [x] 1.1 Crear tabla `publish_jobs` en Supabase
    - Ejecutar el DDL en `companion-app/sql/publish_jobs.sql`:
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
        results       JSONB,
        errors        JSONB,
        created_at    TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE publish_jobs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "users_own_publish_jobs" ON publish_jobs
        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      CREATE INDEX idx_publish_jobs_user_status ON publish_jobs (user_id, status);
      ```
    - Crear el archivo `companion-app/sql/publish_jobs.sql` con el DDL completo
    - _Requerimientos: 7.1, 7.2, 7.3, 7.4_

- [x] 2. Capa de datos — `src/lib/publishJobsDb.js` (app web)
  - [x] 2.1 Crear módulo `publishJobsDb.js`
    - Crear `src/lib/publishJobsDb.js` importando `{ supabase }` desde `./supabase.js` y `{ getCurrentUserId }` desde `./db.js`
    - Implementar `insertPublishJob(jobData)`:
      - Construir el registro con `user_id: getCurrentUserId()` y los campos de `jobData` (taskId → task_id, taskName → task_name, imageUrl → image_url, etc.)
      - `supabase.from('publish_jobs').insert(row).select().single()`
      - Si `error.code === '42501'` (RLS violation), lanzar `'No autorizado para crear jobs de publicación'`
      - Cualquier otro error: lanzar el `error.message` de Supabase
      - Retornar el registro insertado (camelCase)
    - Implementar `getPublishJobs(userId)`:
      - `supabase.from('publish_jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false })`
      - Mapear filas de snake_case a camelCase
      - Retornar array vacío si `data` es null
    - _Requerimientos: 10.1, 10.2, 10.3, 10.4_

- [x] 3. Módulos de plataformas — directorio `companion-app/src/platforms/`
  - [x] 3.1 Crear `e621.js`
    - Crear `companion-app/src/platforms/e621.js`
    - Implementar `publishE621(job, credentials)`:
      - Validar `credentials.username` y `credentials.apiKey` — lanzar `'Credenciales de e621 incompletas'` si faltan
      - Descargar imagen con `node-fetch` y `AbortController` timeout 30s; lanzar `'Timeout al descargar la imagen para e621'` si expira
      - Construir `FormData` (paquete `form-data`) con campos `upload[file]`, `upload[tag_string]` (tags.join(' ')), `upload[rating]`, `upload[description]`, `upload[source]` (vacío)
      - Header `Authorization: Basic <base64(username:apiKey)>` y **`User-Agent: CommissionManagerCompanion/1.0 (contact: woundzengberg)`** (requerido por e621 ToS)
      - `POST https://e621.net/posts.json` — en 200/201: retornar `{ ok: true, url: 'https://e621.net/posts/<data.post.id>' }`
      - En error: extraer `reason` o `message` del JSON; si no hay cuerpo, usar `'HTTP ${status}'`
    - Implementar `testE621(credentials)`:
      - `GET https://e621.net/users/<username>.json` con mismos headers
      - 200 → `{ ok: true, username: credentials.username }` | otro → `{ ok: false, error }`
    - _Requerimientos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 3.2 Crear `inkbunny.js`
    - Crear `companion-app/src/platforms/inkbunny.js`
    - Implementar `publishInkbunny(job, credentials)`:
      - Validar `credentials.username` y `credentials.password`
      - Paso 1 — Login: `POST https://inkbunny.net/api_login.php` con `URLSearchParams({ username, password })`, `Content-Type: application/x-www-form-urlencoded` → extraer `sid` del JSON; si no hay `sid`, lanzar `response.error_message`
      - Paso 2 — Descarga imagen con timeout 30s
      - Paso 3 — Upload: `POST https://inkbunny.net/api_upload.php` con `FormData({ sid, 'uploadedfile[0]': blob })` → extraer `submission_id`
      - Paso 4 — Editar: `POST https://inkbunny.net/api_editsubmission.php` con `URLSearchParams({ sid, submission_id, title: job.title, desc: job.description, keywords: job.tags.join(' '), type: '1' })`
      - Retornar `{ ok: true, url: 'https://inkbunny.net/s/<submission_id>' }`
    - Implementar `testInkbunny(credentials)`:
      - Solo el paso de login; `{ ok: true, username }` si `sid` presente | `{ ok: false, error }`
    - _Requerimientos: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.3 Crear `weasyl.js`
    - Crear `companion-app/src/platforms/weasyl.js`
    - Implementar `publishWeasyl(job, credentials)`:
      - Validar `credentials.apiKey` — lanzar `'API Key de Weasyl requerida'` si falta
      - `GET https://www.weasyl.com/api/whoami` con `X-Weasyl-API-Key` header → obtener `login` (username)
      - Descargar imagen con timeout 30s
      - Mapear rating: `'safe'→10`, `'questionable'→30`, `'explicit'→40`
      - `POST https://www.weasyl.com/api/submissions/submit/visual` con `FormData`: `submitfile`, `title`, `content` (descripción), `tags[]` (un field por tag), `rating`
      - 200 → `{ ok: true, url: 'https://www.weasyl.com/~<login>/submissions/<submitid>' }`
      - Error: extraer `error.message` del JSON
    - Implementar `testWeasyl(credentials)`:
      - `GET whoami` → `{ ok: true, username: data.login }` | `{ ok: false, error }`
    - _Requerimientos: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.4 Crear `bluesky.js`
    - Crear `companion-app/src/platforms/bluesky.js`
    - Implementar `publishBluesky(job, credentials)`:
      - Validar `credentials.handle` y `credentials.appPassword`
      - Paso 1 — Auth: `POST https://bsky.social/xrpc/com.atproto.server.createSession` con `{ identifier: handle, password: appPassword }` → extraer `accessJwt` y `did`
      - Paso 2 — Descarga imagen; detectar mimeType desde extensión o Content-Type
      - Paso 3 — Upload blob: `POST https://bsky.social/xrpc/com.atproto.repo.uploadBlob` con `Authorization: Bearer <accessJwt>`, `Content-Type: <mimeType>`, body = Buffer de imagen → extraer `blob` ref
      - Paso 4 — Crear post: `POST .../createRecord` con `repo: did`, `collection: 'app.bsky.feed.post'`, record con `text` (title, max 300 chars), `embed` de tipo `app.bsky.embed.images#main`, `createdAt`
      - Extraer `rkey` de `uri.split('/').pop()`; retornar `{ ok: true, url: 'https://bsky.app/profile/<handle>/post/<rkey>' }`
      - En error: extraer `message` del JSON de AT Protocol
    - Implementar `testBluesky(credentials)`:
      - Solo `createSession`; `{ ok: true, handle }` | `{ ok: false, error: data.message }`
    - _Requerimientos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 3.5 Crear `telegram.js`
    - Crear `companion-app/src/platforms/telegram.js`
    - Implementar `publishTelegram(job, credentials)`:
      - Validar `credentials.botToken` y `credentials.chatId` — lanzar `'Bot token y chat ID de Telegram son requeridos'` si faltan
      - Construir base URL `https://api.telegram.org/bot${botToken}`
      - Caption = `${job.title}\n${job.description || ''}`.slice(0, 1024)
      - Intentar `sendPhoto` con `{ chat_id, photo: job.image_url, caption, parse_mode: 'HTML' }`
      - Si la respuesta tiene `ok: false` (e.g. error_code 413 o description menciona "too large"): reintentar descargando el archivo y usando `sendDocument` con multipart
      - `ok: true` → `{ ok: true, url: null }` | `ok: false` → lanzar `description`
    - Implementar `testTelegram(credentials)`:
      - `GET .../getMe` → `{ ok: true, botName: result.username }` | `{ ok: false, error: description }`
    - _Requerimientos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 3.6 Crear `discord.js`
    - Crear `companion-app/src/platforms/discord.js`
    - Implementar `publishDiscord(job, credentials)`:
      - Validar `credentials.webhookUrl` comienza con `'https://discord.com/api/webhooks/'` — lanzar `'URL de webhook de Discord inválida'` si no
      - Descargar imagen con timeout 30s
      - Construir `FormData`: campo `files[0]` con buffer de imagen y filename `'artwork.png'`; campo `payload_json` con `JSON.stringify({ embeds: [{ title, description, color: 0x7289DA, image: { url: 'attachment://artwork.png' } }] })`
      - `POST credentials.webhookUrl` con el FormData
      - HTTP 200 o 204 → `{ ok: true, url: credentials.webhookUrl }`
      - Error: extraer `message` del JSON de Discord
    - Implementar `testDiscord(credentials)`:
      - Validar URL; `GET credentials.webhookUrl` → `{ ok: true, channelName: data.name }` | `{ ok: false, error }`
    - _Requerimientos: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 4. UI de configuración — `companion-app/ui/settings.html`
  - [x] 4.1 Crear estructura HTML de `settings.html`
    - Crear directorio `companion-app/ui/`
    - Crear `companion-app/ui/settings.html` con HTML/CSS/JS vanilla (sin bundler)
    - Secciones: Supabase Connection, e621, Inkbunny, Weasyl, Bluesky, Telegram, Discord
    - Cada sección tiene: título, campos de input, botón "💾 Guardar", botón "🧪 Probar" (excepto Supabase que solo tiene "💾 Guardar" y el badge de estado)
    - Campos password: `type="password"` para apiKey, password, appPassword, botToken, webhookUrl, anonKey
    - Badge de estado Supabase: `<span id="status-badge">` con clase `.connected` (verde) o `.disconnected` (rojo)
    - CSS: dark theme consistente con la app web (fondo #1a1a2e, texto #e0e0e0, accent #7c6af5)
    - _Requerimientos: 8.1, 8.4, 8.5_

  - [x] 4.2 Implementar lógica JS de `settings.html`
    - En `DOMContentLoaded`:
      - `const cfg = await window.companion.getConfig()` — pre-rellenar todos los inputs
      - `const status = await window.companion.getStatus()` — actualizar badge Supabase
    - Función `buildConfig()`: leer todos los inputs y construir objeto plano con dot-notation (`'platforms.e621.username'`, etc.) + el checkbox `'platforms.e621.enabled': true`
    - Botón "💾 Guardar" de cada sección: `await window.companion.saveConfig(buildConfig())` → mostrar "✅ Guardado" brevemente
    - Botón "🧪 Probar" de cada plataforma:
      - Deshabilitar botón durante la prueba
      - `const result = await window.companion.testPlatform(platform, localCreds)`
      - Mostrar `.result-ok` con "✅ Conectado como @<username/botName>" o `.result-err` con "❌ Error: <mensaje>"
    - _Requerimientos: 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 5. Integración en `PublishPanel.jsx` — ruta companion
  - [x] 5.1 Añadir `publishJobsDb.js` como dependencia e importar en PublishPanel
    - Agregar import: `import { insertPublishJob } from '../lib/publishJobsDb.js'`
    - Definir constante `COMPANION_PLATFORM_IDS = new Set(['e621','inkbunny','weasyl','bluesky','telegram','discord'])`
    - Exportar función helper `isCompanionPlatform(id) { return COMPANION_PLATFORM_IDS.has(id) }` para testing
    - _Requerimientos: 9.4_

  - [x] 5.2 Agregar companion platforms a la lista de cuentas disponibles
    - En `loadAccounts()`, después de cargar las builtIn y PostyBirb accounts, agregar:
      ```js
      const companionAccts = ['inkbunny','weasyl','bluesky','telegram','discord'].map(p => ({
        id: p, website: p, name: p, isCompanion: true
      }))
      setAccounts([...builtIn, ...companionAccts, ...postybirbAccts])
      ```
    - (e621 ya existe como `__e621__` builtin — no duplicar)
    - _Requerimientos: 9.1_

  - [x] 5.3 Implementar flujo de envío para companion platforms en `handlePublish()`
    - Después del bloque PostyBirb, agregar:
      ```js
      const companionSelected = selected.filter(id => isCompanionPlatform(id) && id !== '__e621__')
      if (companionSelected.length > 0) {
        setSendStep('queuing')
        try {
          await insertPublishJob({
            taskId, taskName: task?.text ?? '',
            imageUrl: highRes.url,
            platforms: companionSelected,
            title: title.trim(), description: desc.trim(),
            tags, rating: 'safe',
          })
          publishedPlatforms.push(...companionSelected)
        } catch (err) {
          errors.push(`companion: ${err.message}`)
        }
      }
      ```
    - Actualizar el mensaje de éxito cuando hay jobs de companion: "✅ Job enviado a la companion app. La publicación se procesará en segundo plano."
    - _Requerimientos: 9.1, 9.2, 9.3, 9.5_

- [ ] 6. Tests de propiedades y unidad
  - [ ]* 6.1 Property 1: Validación de credenciales sin petición HTTP
    - Crear `companion-app/src/platforms/__tests__/platforms.test.js`
    - Para cada módulo (e621, inkbunny, weasyl, bluesky, telegram, discord): verificar que llamar a `publish*(job, {})` con credenciales vacías lanza error **sin realizar ninguna petición HTTP** (mockear `node-fetch` y verificar que no fue llamado)
    - _Requerimientos: 1.5, 2.1, 3.5, 4.1, 5.6, 6.5_

  - [ ]* 6.2 Property 3: Routing determinístico de plataformas
    - Crear `src/lib/__tests__/publishJobsDb.test.js`
    - Probar `isCompanionPlatform` con todos los IDs conocidos y con UUIDs aleatorios
    - Verificar que `COMPANION_PLATFORM_IDS` y PostyBirb UUIDs nunca se superponen
    - _Requerimientos: 9.4_

  - [ ]* 6.3 Property 2: Schema de publish_job tras inserción
    - Mockear Supabase en `src/lib/__tests__/publishJobsDb.test.js`
    - Verificar que `insertPublishJob` llama a `supabase.from('publish_jobs').insert` con `status: 'pending'` y todos los campos requeridos
    - _Requerimientos: 10.1, 10.4_

  - [ ]* 6.4 Property 4: Job `partial` cuando algunas plataformas fallan
    - En `companion-app/src/platforms/__tests__/jobRunner.test.js`, simular que 2 de 3 plataformas retornan `{ ok: true }` y 1 lanza error
    - Verificar que el job se marca como `'partial'` (no `'error'` ni `'completed'`) y que `results.length === 2` y `errors.length === 1`
    - _Requerimientos: 7.2_

- [x] 7. Verificación final
  - Ejecutar `npm test -- --run` en el directorio raíz para verificar que los tests pasan
  - Verificar que la companion app arranca sin errores con `npm run dev` en `companion-app/`
  - Verificar que `settings.html` carga correctamente y pre-rellena los campos
  - Confirmar que `publish_jobs` fue creada en Supabase con el SQL de la tarea 1.1

## Notes

- Los módulos de plataformas usan `node-fetch` y `form-data` (ya en `package.json`)
- El `User-Agent` de e621 es **obligatorio** — sin él se obtiene HTTP 403; incluir siempre
- Las API Keys solo se loguean con los primeros 4 caracteres + `***`
- La companion app solo requiere `supabaseUserId` (no auth completo) para hacer las queries con RLS
- `settings.html` usa JS vanilla para no necesitar bundler en Electron
- La ruta `__e621__` en `PublishPanel` es la publicación directa (existente); los IDs tipo `'e621'` sin guiones bajos son la ruta companion (nueva)
- El orden de las tareas garantiza que cada capa esté lista antes de que la siguiente dependa de ella

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 7, "tasks": ["7"] }
  ]
}
```
