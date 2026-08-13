# Commission Manager — Contexto para nueva sesión

## Stack
- **App web**: React + Vite, desplegada en Vercel (HTTPS)
- **Backend**: Supabase (auth, DB, RLS)
- **Almacenamiento**: Cloudflare R2 (imágenes)
- **Worker**: Cloudflare Worker en `r2-worker/` — proxy de R2 + endpoints API
- **Companion App**: Electron + Node.js v24, en `companion-app/` — `.exe` local en PC del artista
- **Repo**: https://github.com/shrimp387/commission-manager

## Credenciales hardcodeadas (NO tocar)
- Supabase URL: `https://yhlhsqhlnzgrhagoeosp.supabase.co`
- Supabase Anon Key: en `.env.local` como `VITE_SUPABASE_ANON_KEY`
- R2 Worker: `https://commission-manager-r2.commission-manager-studio.workers.dev`

## Usuario
- Email: `warwickiscumingforyou@gmail.com`
- User ID Supabase: `9347035e-7364-4852-a8bd-5f3c3792fd50`

## Deploy
- `git add . ; git commit -m "msg" ; git push origin main` → Vercel auto-deploya
- Worker: `cd r2-worker ; npx wrangler deploy`
- Companion: `cd companion-app ; npm run build` → genera `.exe` en `dist/win-unpacked/`
- NO usar `&&` en PowerShell, usar `;` o comandos separados

---

## Estado actual de funcionalidades

### ✅ Funcionando
- Kanban board completo
- Solicitudes de comisión (CommissionForm)
- Subida de imágenes a R2
- Companion app con browser automation para Inkbunny (Playwright)
- Selector de modelo Mistral en ConnectionsPage
- Thumbnails 80x80 en PublicationsPage + botón eliminar
- Botones publicación en morado (#7c6af5)
- Tags manuales (no bloquea en WD-Tagger)

### ❌ Bug activo: WD-Tagger no funciona
**Problema**: La web app está en HTTPS (Vercel). Intentar llamar a `http://localhost:54322` desde HTTPS causa **Mixed Content block** — el browser lo bloquea aunque el usuario acepte el popup.

**Lo que se intentó:**
1. HuggingFace Inference API directo desde browser → CORS bloqueado
2. HuggingFace via Cloudflare Worker proxy → HTTP 530 (CF IPs baneadas por HF)
3. Gradio Space de WD-Tagger → requiere login, no es público
4. Companion app local en puerto 54322 → Mixed Content block (HTTPS→HTTP)

**Solución pendiente (la correcta):**
Usar Supabase como canal de comunicación entre la web y la companion:
1. Web inserta un "tag_request" en una tabla Supabase con la imageUrl
2. Companion (corriendo en PC) hace polling, recoge el request, llama a HF localmente (sin bloqueos), guarda los tags en Supabase
3. Web hace polling/realtime para recibir los tags

O alternativamente: integrar WD-Tagger directamente en la companion como parte del processJob — cuando procesa un publish_job sin tags, genera los tags automáticamente y los guarda en el job antes de publicar. La web puede leer los tags del job.

**SQL pendiente ejecutar en Supabase:**
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mistral_model TEXT DEFAULT 'pixtral-large-latest';

-- Para tag requests (si se implementa el approach via Supabase):
CREATE TABLE IF NOT EXISTS tag_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending | processing | done | error
  tags TEXT[],
  error_msg TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE tag_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_tag_requests" ON tag_requests FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## Archivos clave

| Archivo | Descripción |
|---------|-------------|
| `src/pages/ConnectionsPage.jsx` | Telegram, Gmail, Companion App, Mistral AI (con selector de modelo) |
| `src/pages/PublishPage.jsx` | Panel multi-paso publicación (4 pasos) — paso 2 = tags |
| `src/pages/PublicationsPage.jsx` | Historial publicaciones (thumbnails 80px, botón eliminar) |
| `src/lib/tagGenerator.js` | Genera tags — intenta localhost:54322 (falla por Mixed Content) → worker CF (falla 530) |
| `src/lib/publishJobsDb.js` | Inserta/lee `publish_jobs` en Supabase |
| `src/store/appConfig.js` | Config global (localStorage + Supabase) — incluye mistralModel, tagBackend |
| `r2-worker/src/index.js` | CF Worker: R2 proxy, /tag endpoint (falla 530), e621 proxy |
| `companion-app/src/main.js` | Electron main: polling jobs, tag server local (puerto 54322), OAuth, processJob con browser automation |
| `companion-app/src/platforms/inkbunny.js` | Publica en Inkbunny via API (visibility=yes, notify_followers=yes) |
| `companion-app/src/platforms/inkbunnyBrowser.js` | **NUEVO:** Browser automation para Inkbunny con Playwright — abre Chrome, rellena todo, deja listo para submit |
| `companion-app/src/jobRunner.js` | Detecta `useBrowser` flag y elige API o browser automation |

## Flujo de publicación (actual)
1. Kanban → tarjeta `stage: Entregado` → botón "📢 Preparar publicación"
2. Navega a `/#/publish/:taskId` (PublishPage.jsx)
3. Paso 1: título, descripción, rating
4. Paso 2: **ROTO** — WD-Tagger falla (Mixed Content / CF 530)
5. Paso 3: seleccionar plataformas
6. Paso 4: confirmar → `insertPublishJob()` → Supabase `publish_jobs`
7. Companion App hace polling → descarga imagen → publica en plataformas

## Tablas Supabase relevantes
- `publish_jobs` — cola de jobs (task_id es TEXT)
- `publications` — historial
- `profiles` — config (mistral_api_key, mistral_model)

## Companion App
- Versión actual compilada: `companion-app/dist/win-unpacked/Commission Manager Companion.exe`
- Puerto 54322: servidor local WD-Tagger (INÚTIL desde HTTPS — Mixed Content)
- Puerto 54321: OAuth callback server (funciona)
- Polling Supabase cada 5s para publish_jobs

## Próximos pasos recomendados
1. **Instalar Playwright browsers:** `cd companion-app ; npx playwright install chromium` (necesario para browser automation)
2. **Recompilar companion app:** `cd companion-app ; npm run build` (versión 2.0.0)
3. **Fix WD-Tagger via Supabase tag_requests table** — si quieres auto-generación de tags (opcional)
