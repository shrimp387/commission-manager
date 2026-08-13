# Commission Manager — Contexto para nueva sesión

## Stack
- **App web**: React + Vite, desplegada en Vercel
- **Backend**: Supabase (auth, DB, RLS)
- **Almacenamiento**: Cloudflare R2 (imágenes)
- **Companion App**: Electron + Node.js v24, en `companion-app/`
- **Repo**: https://github.com/shrimp387/commission-manager

## Credenciales hardcodeadas (NO tocar)
- Supabase URL: `https://yhlhsqhlnzgrhagoeosp.supabase.co`
- Supabase Anon Key: en `.env.local` como `VITE_SUPABASE_ANON_KEY`
- R2 Worker: `https://commission-manager-r2.commission-manager-studio.workers.dev`

## Usuario
- Email: `warwickiscumingforyou@gmail.com`
- User ID Supabase: `9347035e-7364-4852-a8bd-5f3c3792fd50`

## Deploy
- `git add . && git commit -m "msg" && git push origin main` → Vercel auto-deploya
- NO usar `&&` en PowerShell, usar `;` o comandos separados

---

## Bugs pendientes a resolver en NUEVA SESIÓN

### Bug 1 — Mistral: modelo `pixtral-large-latest` inválido con API key general
**Error**: `Invalid model: pixtral-large-latest`
**Causa**: Las API keys "generales" de Mistral no tienen acceso a Pixtral. Pixtral requiere plan de pago o API key específica.
**Fix**: 
- En `src/pages/ConnectionsPage.jsx` → tarjeta Mistral AI → agregar un **selector de modelo** (dropdown)
- Modelos disponibles para listar:
  - `mistral-small-latest` (barato, sin visión)
  - `mistral-medium-latest` (sin visión)  
  - `open-mistral-7b` (gratis, sin visión)
  - `pixtral-12b-2409` (visión, requiere plan)
  - `pixtral-large-latest` (visión NSFW, requiere plan)
  - Opción "otro" → campo manual
- Guardar modelo elegido en `appConfig` como `mistralModel`
- En `src/lib/tagGenerator.js` → leer `mistralModel` de config en vez de hardcodear `pixtral-large-latest`
- Si el modelo NO tiene visión → mostrar advertencia "Este modelo no puede analizar imágenes"

### Bug 2 — Página Publicaciones: imagen a tamaño completo
**Archivo**: `src/pages/PublicationsPage.jsx`
**Problema**: Las imágenes en la lista de publicaciones se muestran a tamaño completo (ocupa toda la pantalla)
**Fix**:
- Thumbnail: `width: 80px, height: 80px, object-fit: cover, border-radius: 8px`
- Botón "🗑 Eliminar" por registro → llama a `supabase.from('publications').delete().eq('id', record.id)`
- Botón "Ver" lleva a la comisión en el tablero
- Botones en color azul accent (`var(--accent)` o `#7c6af5`) en vez de blanco

### Bug 3 — Botones feos (blancos)
**Archivos**: `src/pages/PublishPage.jsx`, `src/pages/PublicationsPage.jsx`
**Fix**: Cambiar `.pub-btn-next`, `.pub-submit-btn` a color azul/purple `#7c6af5` en vez del verde actual.
El `--green` del proyecto es el acento verde del usuario. Los botones de publicación deberían ser morados/azules para diferenciarse.

---

## Archivos clave

| Archivo | Descripción |
|---------|-------------|
| `src/pages/ConnectionsPage.jsx` | Telegram, Gmail, Companion App, Mistral AI |
| `src/pages/PublishPage.jsx` | Panel multi-paso de publicación (4 pasos) |
| `src/pages/PublicationsPage.jsx` | Historial de publicaciones |
| `src/lib/tagGenerator.js` | Genera tags con Mistral (usa `mistralApiKey` + `mistralModel`) |
| `src/lib/publishJobsDb.js` | Inserta/lee `publish_jobs` en Supabase |
| `src/lib/publicationsDb.js` | Inserta/lee `publications` en Supabase |
| `src/store/appConfig.js` | Config global (localStorage + Supabase profiles) |
| `src/lib/AuthContext.jsx` | Carga perfil desde Supabase al login, incluye `mistralApiKey` |
| `companion-app/src/main.js` | Electron main: polling de publish_jobs, OAuth Google |
| `companion-app/src/platforms/` | e621, inkbunny, weasyl, bluesky, telegram, discord |
| `companion-app/ui/settings.html/js` | UI de configuración de la companion |
| `companion-app/dist/win-unpacked/` | `.exe` ya compilado |

## Tablas Supabase relevantes
- `publish_jobs` — cola de jobs (task_id es TEXT, no UUID)
- `publications` — historial de publicaciones
- `profiles` — config del usuario (incluye `mistral_api_key`, `mistral_model`)

## SQL ejecutado
```sql
-- Ya ejecutado:
ALTER TABLE publish_jobs ALTER COLUMN task_id TYPE TEXT USING task_id::TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mistral_api_key TEXT;

-- PENDIENTE ejecutar:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mistral_model TEXT DEFAULT 'pixtral-large-latest';
```

## Flujo de publicación
1. Kanban → tarjeta con `stage: Entregado` → botón "📢 Preparar publicación"
2. Navega a `/#/publish/:taskId` (PublishPage.jsx)
3. Paso 1: título, descripción, rating
4. Paso 2: Mistral genera tags (usa `mistralApiKey` + `mistralModel` de appConfig)
5. Paso 3: seleccionar plataformas (e621, inkbunny, weasyl, bluesky, telegram, discord)
6. Paso 4: confirmar → `insertPublishJob()` → Supabase `publish_jobs`
7. Companion App (Electron) hace polling cada 5s → procesa el job → abre navegador pre-llenado
