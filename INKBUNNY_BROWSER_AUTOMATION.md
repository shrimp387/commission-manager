# Inkbunny Browser Automation — Implementación Completa

## 🎯 Objetivo

Implementar **browser automation** para Inkbunny usando Playwright, permitiendo que la companion app:
1. Abra un navegador Chrome visible
2. Haga login automático en Inkbunny (guardando sesión)
3. Navegue a la página de upload
4. Suba la imagen automáticamente
5. Rellene título, descripción, tags, rating
6. Deje todo listo para que el usuario solo haga clic en "Submit"

## ✅ Archivos Implementados

### 1. `companion-app/src/platforms/inkbunnyBrowser.js`
**Nuevo módulo** de browser automation para Inkbunny.

**Características:**
- Usa **Playwright** (chromium) en modo visible (`headless: false`)
- **Persistencia de sesión:** guarda cookies en `~/.commission-manager/browser-data/inkbunny-cookies.json`
- **Login automático** si no hay sesión guardada
- **Descarga imagen** desde URL y la guarda temporalmente
- **Upload automático** del archivo de imagen
- **Rellena formulario completo:**
  - Título (`job.title`)
  - Descripción (`job.description`)
  - Keywords/Tags (`job.tags[]` → separados por espacio)
  - Rating (checkboxes de nudity/sexual según `job.rating`)
  - Visibility = "yes" (público, no draft)
  - Notify watchers = checked
  - Guest block = unchecked (acceso público)
- **Deja navegador abierto** para que el usuario revise y haga submit

**Exports:**
```javascript
publishInkbunnyBrowser(job, credentials)  // Abre browser, rellena todo
testInkbunnyBrowser(credentials)          // Test de login en headless
```

---

### 2. `companion-app/src/jobRunner.js` (modificado)
**Actualizado** para soportar modo browser.

**Cambios:**
- Import de `publishInkbunnyBrowser` y `testInkbunnyBrowser`
- Switch en `publishToPlatform()`:
  ```javascript
  case 'inkbunny':
    if (credentials.useBrowser) {
      return publishInkbunnyBrowser(job, credentials)
    }
    return publishInkbunny(job, credentials) // API fallback
  ```
- Switch en `testPlatform()` con mismo approach

---

### 3. `companion-app/ui/settings.html` (modificado)
**Actualizado** para agregar toggle de browser automation.

**Cambios:**
- Nuevo checkbox: `<input type="checkbox" id="ib-useBrowser" />`
- Label: "🌐 Usar automatización de navegador (abre Chrome, rellena todo)"
- Hint explicativo debajo del checkbox

---

### 4. `companion-app/ui/settings.js` (modificado)
**Actualizado** para manejar el campo `useBrowser`.

**Cambios:**
- `buildConfig()`: agrega `'platforms.inkbunny.useBrowser': cb('ib-useBrowser')`
- `prefillForm()`: agrega `setCb('ib-useBrowser', ib.useBrowser)`
- `buildCredentials('inkbunny')`: agrega `useBrowser: cb('ib-useBrowser')`

---

### 5. `companion-app/src/main.js` (modificado)
**Actualizado** para incluir `useBrowser` en defaults.

**Cambios:**
- Default config:
  ```javascript
  inkbunny: { username: '', password: '', enabled: false, useBrowser: false }
  ```

---

## 🚀 Cómo Funciona (Flujo Completo)

### Paso 1: Usuario configura en Settings
1. Abre companion app → Configuración
2. Sección Inkbunny:
   - Username: `mi_usuario`
   - Password: `mi_contraseña`
   - ✅ Habilitar esta plataforma
   - ✅ **Usar automatización de navegador**
3. Click "Guardar"

### Paso 2: Job de publicación se crea
1. Usuario en web app marca una comisión como "Entregado"
2. Click "📢 Preparar publicación"
3. Rellena título, descripción, tags, rating
4. Selecciona plataforma "Inkbunny"
5. Click "Publicar" → se inserta en `publish_jobs` tabla de Supabase

### Paso 3: Companion app procesa el job
1. Polling detecta job pendiente
2. `jobRunner.publishToPlatform('inkbunny', job)` es llamado
3. Detecta `credentials.useBrowser === true`
4. Llama `publishInkbunnyBrowser(job, credentials)`

### Paso 4: Browser automation ejecuta
1. **Lanza Chromium visible** (modo headed)
2. **Crea contexto** con viewport 1280x900
3. **Carga cookies** desde `~/.commission-manager/browser-data/inkbunny-cookies.json`
4. **Navega a** `https://inkbunny.net/`
5. **Verifica login:**
   - Si hay sesión válida → continúa
   - Si no → va a `/login.php`, rellena username/password, hace submit, guarda cookies
6. **Navega a** `https://inkbunny.net/submissionsupload.php`
7. **Descarga imagen** desde `job.image_url` a archivo temporal
8. **Sube archivo** usando `<input type="file">` con `setInputFiles()`
9. **Espera upload** y click "Continue"
10. **Rellena formulario:**
    - `input[name="title"]` → `job.title`
    - `textarea[name="desc"]` → `job.description`
    - `input[name="keywords"]` → `job.tags.join(' ')`
    - Checkboxes rating según `job.rating`:
      - `safe` → nudity=no, sexual=no
      - `questionable` → nudity=yes, sexual=no
      - `explicit` → nudity=yes, sexual=yes
    - `select[name="visibility"]` → "yes" (público)
    - `input[name="notify_followers"]` → checked
    - `input[name="guest_block"]` → unchecked
11. **Guarda cookies** otra vez
12. **Deja navegador abierto** para que usuario revise
13. **Retorna:**
    ```javascript
    {
      ok: true,
      url: 'https://inkbunny.net/submissionsupload.php',
      message: 'Browser opened with form filled. Click Submit to publish.',
      browserOpen: true
    }
    ```

### Paso 5: Usuario aprueba y publica
1. Usuario ve el navegador abierto con el formulario completo
2. Revisa que todo esté correcto
3. Click botón "Submit" en Inkbunny
4. Inkbunny publica la submission
5. Usuario cierra el navegador

---

## 📦 Dependencias

### Ya instalada:
```json
{
  "playwright": "^1.49.1"
}
```

### Comandos ejecutados:
```bash
cd companion-app
npm install playwright
```

---

## 🔧 Configuración de Usuario

### En la companion app (Settings):
```
🐇 Inkbunny
├─ Username: tu_usuario
├─ Password: tu_contraseña
├─ ☑ Habilitar esta plataforma
└─ ☑ 🌐 Usar automatización de navegador
```

### En Supabase (tabla `publish_jobs`):
```javascript
{
  id: 'uuid',
  user_id: 'uuid',
  task_id: 'text',
  title: 'My Artwork',
  description: 'Commission for @client',
  tags: ['furry', 'digital_art', 'commission'],
  rating: 'safe', // 'safe' | 'questionable' | 'explicit'
  image_url: 'https://r2.commission-manager.../image.png',
  platforms: ['inkbunny'],
  status: 'pending'
}
```

---

## 🐛 Casos Edge Manejados

### 1. **Sesión expirada**
- La companion detecta si no hay sesión válida
- Hace login automático desde cero
- Guarda nuevas cookies

### 2. **Imagen no descargable**
- Error: `throw new Error('Failed to download image: 404')`
- Job se marca como error en Supabase

### 3. **Formulario cambiado (Inkbunny actualiza su HTML)**
- Los selectores son genéricos: `input[name="title"]`, `textarea[name="desc"]`
- Si Inkbunny cambia nombres de campos, solo hay que actualizar el módulo

### 4. **Upload tarda mucho**
- Timeout de 30s para download de imagen (`DOWNLOAD_TIMEOUT_MS`)
- `waitForTimeout(2000)` después del upload para dar tiempo al server

### 5. **Usuario no hace submit**
- El navegador queda abierto indefinidamente
- Usuario puede cerrar sin publicar
- Job se queda en estado "running" → hay que manejarlo manualmente o con timeout

---

## 🆚 Comparación: API vs Browser Automation

| Característica | API (inkbunny.js) | Browser (inkbunnyBrowser.js) |
|---------------|-------------------|------------------------------|
| Velocidad | ⚡ Rápido (3-5s) | 🐢 Lento (10-20s) |
| Visibilidad | ❌ Invisible | ✅ Usuario ve todo |
| Aprobación | ❌ Auto-publica | ✅ Usuario aprueba |
| Errores | ⚠️ Difícil debug | ✅ Visual debug |
| Captchas | ❌ Puede fallar | ✅ Usuario resuelve |
| Sesión | 🔑 Login por job | 🍪 Cookies persisten |
| Dependencias | ✅ Node built-ins | 📦 Playwright (~100MB) |

---

## 🎨 UI Flow (Web App → Companion)

```
Web App (Vercel HTTPS)
    ↓
[Usuario crea publish job]
    ↓
Supabase `publish_jobs` table
    ↓
Companion App (Electron, localhost)
    ↓
[Polling detecta job pendiente]
    ↓
jobRunner.publishToPlatform('inkbunny', job)
    ↓
¿useBrowser = true?
    ├─ NO → publishInkbunny() [API]
    └─ YES → publishInkbunnyBrowser() [Playwright]
           ↓
      [Abre Chrome visible]
           ↓
      [Login automático]
           ↓
      [Upload + rellena formulario]
           ↓
      [Deja navegador abierto]
           ↓
      Usuario ve todo rellenado
           ↓
      Usuario click "Submit"
           ↓
      ✅ Publicado en Inkbunny
```

---

## 🔮 Futuras Mejoras

### 1. **Notificación cuando navegador está listo**
- Mostrar notificación OS: "Inkbunny listo para publicar - revisa el navegador"
- Usar `require('node-notifier')` en main.js

### 2. **Auto-submit opcional**
- Agregar checkbox "Auto-submit (no revisar)"
- Si está activado, hace `page.click('button[type="submit"]')` automáticamente
- Espera confirmación y cierra navegador

### 3. **Screenshot antes de submit**
- Tomar screenshot del formulario lleno
- Guardar en `~/.commission-manager/screenshots/`
- Mostrar en UI de logs

### 4. **Timeout handling**
- Si navegador queda abierto > 10 minutos sin submit
- Marcar job como "timeout" en Supabase
- Cerrar navegador automáticamente

### 5. **Multi-plataforma browser automation**
- Extender mismo approach a:
  - FurAffinity (no tiene API pública)
  - DeviantArt (API limitada)
  - Newgrounds (no tiene API)
  - Pixiv (API restrictiva)

---

## 📝 Notas de Implementación

### ¿Por qué Playwright y no Puppeteer?
- **Playwright** es más moderno (mantenido por Microsoft)
- Mejor manejo de navegadores modernos
- API más limpia para file uploads
- Mejor manejo de multi-contexto (cookies, sesiones)

### ¿Por qué no Selenium?
- Playwright es más rápido y ligero
- No requiere drivers externos (geckodriver, chromedriver)
- Mejor para aplicaciones Electron

### ¿Por qué `headless: false`?
- El usuario **necesita ver** lo que se va a publicar
- Permite revisión manual antes de submit
- Usuario puede resolver captchas si aparecen
- Mejor experiencia de usuario (no es "magia negra invisible")

---

## ✅ Testing

### Test manual:
1. Compilar companion app:
   ```bash
   cd companion-app
   npm run build
   ```

2. Ejecutar `.exe` compilado:
   ```bash
   cd dist/win-unpacked
   "Commission Manager Companion.exe"
   ```

3. Abrir Settings → Inkbunny:
   - Username: `tu_usuario`
   - Password: `tu_contraseña`
   - ✅ Habilitar
   - ✅ Usar browser automation
   - Click "Guardar"

4. Crear job de prueba en web app

5. Ver cómo se abre Chrome automáticamente y se rellena todo

---

## 🎉 Resultado Final

Ahora la companion app puede:
- ✅ Usar **API de Inkbunny** (rápido, automático) si `useBrowser = false`
- ✅ Usar **browser automation** (visual, aprobación manual) si `useBrowser = true`
- ✅ **Persistir sesión** con cookies → no hace login cada vez
- ✅ **Rellenar todo automáticamente** → título, descripción, tags, rating, imagen
- ✅ **Dejar navegador abierto** para aprobación del usuario

Es exactamente como **PostyBirb** pero integrado en tu app. 🚀
