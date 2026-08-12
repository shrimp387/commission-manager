# Requirements: Companion App Publisher

## Introduction

La companion app es una aplicación de escritorio Electron (Node.js v24) que corre en segundo plano en la PC del artista. Se conecta a Supabase para recibir trabajos de publicación (`publish_jobs`) enviados desde la app web en Vercel, y los ejecuta publicando la obra directamente en múltiples plataformas: e621, Inkbunny, Weasyl, Bluesky, Telegram y Discord.

Los archivos base ya existen (`main.js`, `preload.js`, `jobRunner.js`), pero faltan: los módulos de plataformas, la tabla SQL, la UI de configuración y la integración en la app web para enviar jobs.

## Glossary

- **publish_job**: Registro en Supabase que representa una solicitud de publicación pendiente, con metadata de la obra y plataformas destino.
- **platform module**: Archivo Node.js en `companion-app/src/platforms/` que implementa la lógica de autenticación y publicación para una plataforma específica.
- **electron-store**: Librería de almacenamiento cifrado en disco para credenciales de la companion app.
- **settings.html**: Ventana de configuración de la companion app donde el artista introduce sus credenciales por plataforma.
- **AT Protocol**: Protocolo abierto usado por Bluesky para publicación de posts.
- **webhook**: URL de Discord que acepta payloads HTTP POST para publicar mensajes/imágenes.
- **job polling**: Proceso de la companion app que consulta Supabase cada N segundos buscando jobs con `status = 'pending'`.

---

## Requirement 1: Módulo de publicación para e621

**User Story:** Como artista, quiero que la companion app pueda publicar mi obra en e621 usando mis credenciales de API Key, para no tener que subir manualmente cada pieza.

### Acceptance Criteria

1. WHERE el módulo `e621.js` es requerido, WHEN se llama a `publishE621(job, credentials)`, THE module SHALL enviar una petición `POST` a `https://e621.net/posts.json` con las cabeceras de autenticación HTTP Basic (`username:api_key` en Base64) y el formulario multipart con los campos: `upload[file]`, `upload[tag_string]`, `upload[rating]`, `upload[description]`, `upload[source]`.
2. WHEN la respuesta de e621 es HTTP 201 o 200, THE module SHALL retornar `{ ok: true, url: 'https://e621.net/posts/<id>' }` donde `<id>` se extrae del campo `post.id` del JSON de respuesta.
3. WHEN la respuesta de e621 es un error HTTP (4xx/5xx), THE module SHALL lanzar un error con el mensaje extraído del campo `reason` o `message` del JSON de respuesta, o el status HTTP si no hay cuerpo JSON.
4. WHEN se llama a `testE621(credentials)`, THE module SHALL hacer una petición `GET` a `https://e621.net/users/<username>.json` y retornar `{ ok: true, username }` si responde 200, o `{ ok: false, error: mensaje }` si falla.
5. IF `credentials.username` o `credentials.apiKey` están vacíos o son undefined, THEN el módulo SHALL lanzar un error `'Credenciales de e621 incompletas'` sin realizar ninguna petición HTTP.
6. WHEN se descarga la imagen desde la URL del job, THE module SHALL usar un timeout de 30 segundos mediante `AbortController`; si el timeout expira, SHALL lanzar `'Timeout al descargar la imagen para e621'`.

---

## Requirement 2: Módulo de publicación para Inkbunny

**User Story:** Como artista, quiero que la companion app pueda publicar mi obra en Inkbunny usando mi username y password, para automatizar las subidas a esa plataforma.

### Acceptance Criteria

1. WHERE el módulo `inkbunny.js` es requerido, WHEN se llama a `publishInkbunny(job, credentials)`, THE module SHALL primero autenticarse vía `https://inkbunny.net/api_login.php` con `POST` enviando `username` y `password` para obtener un `sid` (session ID).
2. WHEN el login es exitoso (campo `sid` presente en la respuesta JSON), THE module SHALL subir el archivo con `POST` a `https://inkbunny.net/api_upload.php` usando `multipart/form-data` con campos `sid`, `uploadedfile[0]`.
3. WHEN la subida es exitosa, THE module SHALL actualizar los detalles de la submission vía `https://inkbunny.net/api_editsubmission.php` con campos `sid`, `submission_id`, `title`, `desc`, `keywords` (tags separados por espacio), `type` (1 = imagen).
4. WHEN todos los pasos son exitosos, THE module SHALL retornar `{ ok: true, url: 'https://inkbunny.net/s/<submission_id>' }`.
5. WHEN cualquier paso del flujo de tres pasos falla, THE module SHALL lanzar un error con el mensaje del campo `error_message` de la respuesta JSON de Inkbunny, o descripción del error HTTP.
6. WHEN se llama a `testInkbunny(credentials)`, THE module SHALL intentar el login y retornar `{ ok: true, username }` si el `sid` se obtiene correctamente, o `{ ok: false, error: mensaje }` si falla.

---

## Requirement 3: Módulo de publicación para Weasyl

**User Story:** Como artista, quiero que la companion app pueda publicar mi obra en Weasyl usando mi API Key, para automatizar las subidas a esa plataforma.

### Acceptance Criteria

1. WHERE el módulo `weasyl.js` es requerido, WHEN se llama a `publishWeasyl(job, credentials)`, THE module SHALL enviar una petición `POST` a `https://www.weasyl.com/api/submissions/submit/character` o `https://www.weasyl.com/api/submissions/submit/visual` (tipo visual para ilustraciones) con la cabecera `X-Weasyl-API-Key: <apiKey>` y el cuerpo multipart con el archivo y metadata.
2. WHEN la respuesta de Weasyl es exitosa (HTTP 200), THE module SHALL retornar `{ ok: true, url: submitid construido como 'https://www.weasyl.com/~<username>/submissions/<submitid>' }`.
3. WHEN la respuesta es error HTTP, THE module SHALL lanzar un error con el mensaje del campo `error.message` del JSON de respuesta.
4. WHEN se llama a `testWeasyl(credentials)`, THE module SHALL llamar a `GET https://www.weasyl.com/api/whoami` con la cabecera `X-Weasyl-API-Key` y retornar `{ ok: true, username: data.login }` si responde 200, o `{ ok: false, error: mensaje }` si falla.
5. IF `credentials.apiKey` está vacío o undefined, THE module SHALL lanzar `'API Key de Weasyl requerida'` sin realizar peticiones.

---

## Requirement 4: Módulo de publicación para Bluesky

**User Story:** Como artista, quiero que la companion app pueda publicar mi obra en Bluesky usando mi handle y app password, para compartir automáticamente en esa red social.

### Acceptance Criteria

1. WHERE el módulo `bluesky.js` es requerido, WHEN se llama a `publishBluesky(job, credentials)`, THE module SHALL autenticarse primero vía `POST https://bsky.social/xrpc/com.atproto.server.createSession` con `{ identifier: handle, password: appPassword }` para obtener `accessJwt`.
2. WHEN el token se obtiene, THE module SHALL subir la imagen como blob vía `POST https://bsky.social/xrpc/com.atproto.repo.uploadBlob` con la cabecera `Authorization: Bearer <accessJwt>` y el `Content-Type` correcto de la imagen.
3. WHEN el blob es subido exitosamente, THE module SHALL crear un post vía `POST https://bsky.social/xrpc/com.atproto.repo.createRecord` con `collection: 'app.bsky.feed.post'`, texto con título y descripción (máximo 300 caracteres combinados), y el embed de imagen con el `blob` obtenido en el paso anterior.
4. WHEN el post se crea exitosamente, THE module SHALL retornar `{ ok: true, url: 'https://bsky.app/profile/<handle>/post/<rkey>' }` construido desde los campos `uri` de la respuesta.
5. WHEN cualquier paso falla (auth, upload o createRecord), THE module SHALL lanzar un error descriptivo con el campo `message` del error de AT Protocol.
6. WHEN se llama a `testBluesky(credentials)`, THE module SHALL intentar solo el paso de autenticación y retornar `{ ok: true, handle }` o `{ ok: false, error: mensaje }`.

---

## Requirement 5: Módulo de publicación para Telegram

**User Story:** Como artista, quiero que la companion app pueda enviar mi obra a un canal o chat de Telegram usando un bot, para notificar automáticamente a mis seguidores.

### Acceptance Criteria

1. WHERE el módulo `telegram.js` es requerido, WHEN se llama a `publishTelegram(job, credentials)`, THE module SHALL enviar una petición `POST` a `https://api.telegram.org/bot<botToken>/sendPhoto` (para imágenes) con `chat_id`, `photo` (URL de la imagen o fichero), y `caption` (título + descripción, máximo 1024 caracteres).
2. IF la imagen supera 10 MB o el envío de `sendPhoto` falla por tamaño, THE module SHALL intentar con `sendDocument` en lugar de `sendPhoto` para enviar como archivo adjunto.
3. WHEN Telegram responde con `{ ok: true }`, THE module SHALL retornar `{ ok: true, url: null }` (Telegram no provee URL directa al mensaje).
4. WHEN Telegram responde con `{ ok: false, description: '...' }`, THE module SHALL lanzar un error con el campo `description`.
5. WHEN se llama a `testTelegram(credentials)`, THE module SHALL llamar a `GET https://api.telegram.org/bot<botToken>/getMe` y retornar `{ ok: true, botName: result.username }` o `{ ok: false, error: mensaje }`.
6. IF `credentials.botToken` o `credentials.chatId` están vacíos, THE module SHALL lanzar `'Bot token y chat ID de Telegram son requeridos'`.

---

## Requirement 6: Módulo de publicación para Discord

**User Story:** Como artista, quiero que la companion app pueda enviar mi obra a un canal de Discord mediante un webhook, para compartir automáticamente mis publicaciones con mi servidor.

### Acceptance Criteria

1. WHERE el módulo `discord.js` es requerido, WHEN se llama a `publishDiscord(job, credentials)`, THE module SHALL enviar una petición `POST` a `credentials.webhookUrl` con `Content-Type: multipart/form-data`, incluyendo el fichero de imagen como `files[0]` y un payload JSON con `embeds[0]` que contiene `title`, `description` y el color de embed.
2. WHEN la respuesta del webhook es HTTP 200 o 204, THE module SHALL retornar `{ ok: true, url: credentials.webhookUrl }`.
3. WHEN la respuesta es un error HTTP, THE module SHALL lanzar un error con el mensaje del campo `message` del JSON de respuesta de Discord.
4. WHEN se llama a `testDiscord(credentials)`, THE module SHALL enviar un `GET` al webhook URL (Discord acepta GET en webhooks) y retornar `{ ok: true, channelName: data.name }` o `{ ok: false, error: mensaje }`.
5. IF `credentials.webhookUrl` está vacío o no comienza con `https://discord.com/api/webhooks/`, THE module SHALL lanzar `'URL de webhook de Discord inválida'` sin realizar peticiones.

---

## Requirement 7: Tabla SQL `publish_jobs` en Supabase

**User Story:** Como artista, quiero que los trabajos de publicación se almacenen en Supabase para que la companion app los recoja y ejecute de forma asíncrona.

### Acceptance Criteria

1. WHEN se ejecuta la migración SQL, THE database SHALL crear la tabla `publish_jobs` con las columnas: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL`, `task_id UUID`, `task_name TEXT`, `image_url TEXT NOT NULL`, `platforms TEXT[] NOT NULL`, `title TEXT NOT NULL`, `description TEXT`, `tags TEXT[]`, `rating TEXT DEFAULT 'safe'`, `status TEXT NOT NULL DEFAULT 'pending'`, `started_at TIMESTAMPTZ`, `completed_at TIMESTAMPTZ`, `results JSONB`, `errors JSONB`, `created_at TIMESTAMPTZ DEFAULT now()`.
2. THE table SHALL tener un `CHECK (status IN ('pending', 'running', 'completed', 'partial', 'error'))` en la columna `status`.
3. THE table SHALL tener RLS habilitado con una policy que permita a `auth.uid() = user_id` realizar `SELECT`, `INSERT`, `UPDATE`.
4. THE table SHALL tener un índice en `(user_id, status)` para optimizar las consultas de polling.
5. WHEN la companion app hace polling, THE query SHALL ser `.select('*').eq('user_id', userId).eq('status', 'pending').order('created_at', { ascending: true }).limit(5)`.

---

## Requirement 8: UI de configuración `settings.html`

**User Story:** Como artista, quiero una ventana de configuración en la companion app donde pueda introducir mis credenciales por plataforma y probar la conexión, sin necesidad de editar archivos de configuración manualmente.

### Acceptance Criteria

1. WHERE `settings.html` es cargado por la ventana de Electron, THE page SHALL mostrar secciones separadas para: Supabase (URL, anon key, user ID), e621 (username, API key), Inkbunny (username, password), Weasyl (API key), Bluesky (handle, app password), Telegram (bot token, chat ID), Discord (webhook URL).
2. WHEN el usuario hace clic en "💾 Guardar" en cualquier sección, THE page SHALL llamar a `window.companion.saveConfig(config)` con el objeto de configuración completo (combinando valores actuales con los nuevos de esa sección).
3. WHEN el usuario hace clic en "🧪 Probar" en una sección de plataforma, THE page SHALL llamar a `window.companion.testPlatform(platform, credentials)` y mostrar el resultado: "✅ Conectado como @<username>" si `ok: true`, o "❌ Error: <mensaje>" si `ok: false`.
4. WHEN la página carga, THE page SHALL llamar a `window.companion.getConfig()` y pre-rellenar todos los campos con los valores almacenados; los campos de tipo password/api_key SHALL mostrarse como `type="password"`.
5. THE page SHALL tener un indicador de estado de conexión a Supabase (verde/rojo) que muestra si las credenciales están configuradas, usando `window.companion.getStatus()`.
6. WHEN el usuario hace clic en "Salir" o cierra la ventana, THE page SHALL no requerir confirmación si no hay cambios sin guardar.

---

## Requirement 9: Integración en PublishPanel para enviar jobs a Supabase

**User Story:** Como artista, quiero que el botón de publicación en la app web pueda enviar trabajos directamente a la tabla `publish_jobs` de Supabase (en lugar de solo PostyBirb), para que la companion app los procese y publique en las plataformas configuradas.

### Acceptance Criteria

1. WHERE la app web tiene el `PublishPanel.jsx`, WHEN el usuario selecciona plataformas que son manejadas por la companion app (e621, Inkbunny, Weasyl, Bluesky, Telegram, Discord), THE panel SHALL insertar un registro en `publish_jobs` con todos los campos requeridos: `user_id`, `task_id`, `task_name`, `image_url`, `platforms`, `title`, `description`, `tags`, `rating`.
2. WHEN el insert en `publish_jobs` es exitoso, THE panel SHALL mostrar "✅ Job enviado a la companion app. La publicación se procesará en segundo plano." y cerrar tras 2 segundos.
3. WHEN el insert falla (error de Supabase), THE panel SHALL mostrar el mensaje de error y permitir reintento sin cerrar el panel.
4. THE `PublishPanel` SHALL detectar si las plataformas seleccionadas son cuentas de PostyBirb (IDs de cuentas reales) o plataformas de companion app (IDs de strings como `'e621'`, `'inkbunny'`, etc.) para enrutar correctamente.
5. WHEN hay plataformas mixtas (algunas PostyBirb, algunas companion), THE panel SHALL ejecutar ambas rutas en paralelo y reportar el resultado consolidado.

---

## Requirement 10: Capa de datos `publishJobsDb.js` en la app web

**User Story:** Como desarrollador, quiero una capa de acceso a datos para la tabla `publish_jobs` en la app web, para insertar y consultar jobs de forma consistente con el resto del stack.

### Acceptance Criteria

1. WHEN se crea `src/lib/publishJobsDb.js`, THE module SHALL exportar la función `insertPublishJob(jobData)` que hace `supabase.from('publish_jobs').insert(jobData)` y retorna el registro insertado o lanza un error descriptivo.
2. THE module SHALL exportar `getPublishJobs(userId)` que retorna todos los jobs del usuario ordenados por `created_at DESC`.
3. THE module SHALL importar el cliente Supabase desde el módulo de `db.js` existente en el proyecto, sin crear una nueva instancia.
4. IF la inserción falla por RLS (error de permisos), THE function SHALL lanzar un error con el mensaje `'No autorizado para crear jobs de publicación'`.
