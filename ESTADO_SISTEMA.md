# Estado del Sistema — Commission Manager
**Última actualización:** Análisis real del código fuente

---

## ARQUITECTURA

```
[Vercel App - Browser]
  ↓ Usuario genera tags
  ↓ inserta en Supabase: tag_requests {status:'pending', tagger_type:'e621'}
[Supabase]
  ↓ Companion App hace polling cada 5s
[Companion App - PC del artista .exe]
  ↓ Detecta request pendiente
  ↓ Descarga imagen (Node.js, sin CORS)
  ↓ POST a HuggingFace API con token
[HuggingFace Inference API]
  ↓ Retorna [{label, score}, ...]
[Companion App]
  ↓ Parsea tags con threshold
  ↓ UPDATE tag_requests {status:'done', tags:[...]}
[Supabase]
  ↓ Vercel polling cada 2s detecta status='done'
[Vercel App - Browser]
  ↓ Muestra tags en UI
```

Para **publicar** (flujo paralelo):
```
[Vercel App]
  ↓ insertPublishJob() → Supabase: publish_jobs {status:'pending'}
[Companion App]
  ↓ Polling cada 5s, procesa job
  ↓ Publica en plataformas (Inkbunny, e621, Weasyl, etc.)
  ↓ UPDATE publish_jobs {status:'completed', results:[...]}
```

---

## QUÉ FUNCIONA

### Companion App (Electron .exe)
- **Polling** de `tag_requests` y `publish_jobs` cada 5s ✅
- **WD-Tagger** (`SmilingWolf/wd-vit-tagger-v3`) — funciona ✅
- **E621-Tagger** (`zerauskii/e621-tagger-jtp` → fallback `SmilingWolf/wd-vit-tagger-v3`) — código correcto ✅
- **PAWFECT-Tagger** (`lodestones/P.A.W.F.E.C.T-Alpha` → fallback WD) ✅
- **Poofy1/e621-tagger** — ELIMINADO del código ✅
- **Publicación Inkbunny** via API ✅
- **Publicación e621, Weasyl, Bluesky, Telegram, Discord** — código implementado ✅
- **OAuth Google** — callback en puerto 54321 ✅
- **Settings UI** — `ui/settings.html` con dark theme ✅
- **Logs window** — `ui/logs.html` ✅
- **Token HF** — guardado en electron-store, se pasa a todos los taggers ✅
- **Supabase** — credenciales hardcodeadas, no requiere config del usuario ✅

### Vercel App (React + Vite)
- **Kanban board** ✅
- **CommissionForm** — crear comisiones ✅
- **Subida de imágenes** a Cloudflare R2 ✅
- **tagGenerator.js** — llama a HuggingFace DIRECTAMENTE desde el browser ✅
  - Usa `huggingFaceClient.js` (no companion app)
  - Modelos: `zerauskii/e621-tagger-jtp` → `Poofy1/e621-tagger` → `SmilingWolf/wd-vit-tagger-v3`
- **tagRequestsDb.js** — canal Supabase para companion app (existe pero NO es el flujo principal) ✅
- **publishJobsDb.js** — inserta publish_jobs para companion app ✅
- **PublishPanel** — envía jobs a companion app ✅

### Base de Datos (Supabase)
- Tabla `tag_requests` — existe con columna `tagger_type` ✅
- Tabla `publish_jobs` — existe con RLS ✅
- RLS configurado para ambas tablas ✅

---

## PROBLEMA REAL: CONFUSIÓN DE FLUJOS

Hay **DOS flujos de tags** que coexisten y crean confusión:

### Flujo A — Browser directo (tagGenerator.js → huggingFaceClient.js)
```
Browser → HuggingFace API directamente
```
- NO usa Companion App
- NO usa Supabase como intermediario
- Depende de CORS (puede fallar desde browser)
- **Este es el flujo activo en producción**

### Flujo B — Via Companion App (tagRequestsDb.js)
```
Browser → Supabase tag_requests → Companion App → HuggingFace → Supabase → Browser
```
- USA Companion App (Node.js, sin CORS)
- Es el flujo correcto para evitar bloqueos
- `e621Tagger.js` (Vercel) tiene código para este flujo
- **Pero tagGenerator.js NO lo usa** — llama directo al browser

### El bug:
`tagGenerator.js` importa `generateTagsFromBrowser` de `huggingFaceClient.js` para TODOS los backends (wd, e621, pawfect). Nunca llama a `tagRequestsDb.js` (companion app). Si HuggingFace bloquea CORS desde el browser, nada funciona.

---

## ARCHIVOS CLAVE

### Vercel App (`src/`)
| Archivo | Función |
|---------|---------|
| `src/lib/tagGenerator.js` | Orquestador — llama HF desde browser |
| `src/lib/huggingFaceClient.js` | Cliente HF para browser (fetch directo + canvas fallback) |
| `src/lib/tagRequestsDb.js` | Canal Supabase → Companion App (no usado por tagGenerator) |
| `src/lib/e621Tagger.js` | Wrapper E621/PAWFECT — llama tagRequestsDb (no usado actualmente) |
| `src/lib/publishJobsDb.js` | Inserta publish_jobs en Supabase |
| `src/lib/supabase.js` | Config Supabase |
| `src/lib/db.js` | Auth helpers |

### Companion App (`companion-app/src/`)
| Archivo | Función |
|---------|---------|
| `main.js` | Entry point — polling, tray, OAuth, tag server puerto 54322 |
| `e621Tagger.js` | E621 + PAWFECT taggers (usa `zerauskii/e621-tagger-jtp`) |
| `wdTagger.js` | WD-Tagger (usa `SmilingWolf/wd-vit-tagger-v3`) |
| `jobRunner.js` | Ejecuta publish jobs por plataforma |
| `platforms/e621.js` | Publica en e621.net |
| `platforms/inkbunny.js` | Publica en Inkbunny via API |
| `platforms/weasyl.js` | Publica en Weasyl |
| `platforms/bluesky.js` | Publica en Bluesky |
| `platforms/telegram.js` | Publica en Telegram |
| `platforms/discord.js` | Publica en Discord |
| `ui/settings.html` | UI configuración |
| `ui/logs.html` | UI logs |

---

## CREDENCIALES / CONFIG

| Variable | Valor | Dónde |
|----------|-------|-------|
| Supabase URL | `https://yhlhsqhlnzgrhagoeosp.supabase.co` | Hardcoded en companion + `.env.local` |
| User ID | `9347035e-7364-4852-a8bd-5f3c3792fd50` | electron-store (post OAuth) |
| HF Token | `hf_YOUR_TOKEN_HERE` | electron-store en companion |
| Modelo JTP | `zerauskii/e621-tagger-jtp` | e621Tagger.js + huggingFaceClient.js |
| Vercel URL | `https://commission-manager-plum.vercel.app` | — |
| R2 Worker | `https://commission-manager-r2.commission-manager-studio.workers.dev` | — |

---

## COMANDOS

```powershell
# Iniciar Vercel app (desarrollo)
npm run dev

# Iniciar Companion App (desarrollo)
cd companion-app ; npm start

# Compilar Companion App (.exe)
cd companion-app ; npm run build
# Output: companion-app/dist/win-unpacked/Commission Manager Companion.exe

# Deploy a Vercel (via GitHub)
python save.py   # commit local
python deploy.py # push → Vercel auto-deploya
```

---

## PENDIENTE / BUGS

1. **tagGenerator.js usa browser directo en vez de companion app**
   - Si HF bloquea CORS desde Vercel, los tags no se generan
   - Fix: hacer que tagGenerator.js use tagRequestsDb.js para e621/pawfect

2. **Companion App versión compilada puede estar desactualizada**
   - El `.exe` en `dist/` puede no tener los últimos cambios
   - Fix: recompilar con `npm run build` después de cada cambio

3. **Tags no confirmados como funcionando end-to-end**
   - No hay evidencia de test exitoso con logs reales
   - Necesita prueba con Companion App abierta + imagen real

4. **Puerto 54322 (tag server local) inútil desde HTTPS**
   - Mixed Content block — browser no puede llamar HTTP desde HTTPS
   - El tag server existe en main.js pero no se usa en producción
