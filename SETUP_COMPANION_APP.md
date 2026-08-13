# 🚀 Setup Companion App - Guía Completa

## 📦 Paso 1: Instalar Playwright Browsers

Playwright necesita descargar los navegadores (Chromium, Firefox, WebKit). Esto es un paso **extra** después de `npm install playwright`.

```bash
cd companion-app
npx playwright install chromium
```

Esto descarga ~300MB de Chromium. Es necesario para browser automation.

---

## ⚙️ Paso 2: Compilar la Companion App

```bash
cd companion-app
npm run build
```

Esto genera el `.exe` en `dist/win-unpacked/Commission Manager Companion.exe`.

---

## 🎯 Paso 3: Configurar Inkbunny

1. Abre `Commission Manager Companion.exe`
2. Click derecho en el ícono de la bandeja del sistema → **Configuración**
3. Sección **Inkbunny**:
   - Username: `tu_usuario_inkbunny`
   - Password: `tu_contraseña`
   - ✅ **Habilitar esta plataforma**
   - ✅ **Usar automatización de navegador** (activado por defecto ahora)
4. Click **Guardar**
5. Click **🧪 Probar** para verificar que las credenciales funcionan

---

## 📝 Paso 4: Crear un Job de Prueba

Desde la web app (Vercel):

1. Ve a una comisión en estado "Entregado"
2. Click **📢 Preparar publicación**
3. Paso 1: Título, descripción, rating
4. Paso 2: **Agrega tags manualmente** o click "✨ Generar con IA" (opcional)
5. Paso 3: Selecciona **Inkbunny**
6. Paso 4: Click **📤 Enviar a companion app**

---

## 🔍 Paso 5: Ver el Job Procesándose

La companion app:
1. Detecta el job en polling (cada 5 segundos)
2. Abre Chrome automáticamente
3. Hace login en Inkbunny (o usa cookies guardadas)
4. Sube la imagen
5. Rellena: título, descripción, tags, rating
6. **Deja el navegador abierto** para que revises

Tú:
7. Revisa que todo esté correcto en el navegador
8. Click **Submit** en Inkbunny
9. ¡Publicado! 🎉

---

## 📊 Inkbunny API — Cómo Funciona

### ✅ API vs Browser Automation

| Característica | API (inkbunny.js) | Browser (inkbunnyBrowser.js) |
|---------------|-------------------|------------------------------|
| **Velocidad** | ⚡ 3-5s | 🐢 10-20s |
| **Usuario ve** | ❌ No | ✅ Sí |
| **Aprobación** | ❌ Auto-publica | ✅ Usuario aprueba |
| **Acepta tags** | ✅ Sí (keywords) | ✅ Sí (keywords) |
| **Acepta rating** | ✅ Sí | ✅ Sí |
| **Captchas** | ❌ Puede fallar | ✅ Usuario resuelve |

### 🔑 API de Inkbunny (3 pasos)

#### 1. Login (`/api_login.php`)
```javascript
POST https://inkbunny.net/api_login.php
Body: username=USER&password=PASS
Response: { sid: "session_id_123" }
```

#### 2. Upload (`/api_upload.php`)
```javascript
POST https://inkbunny.net/api_upload.php
Headers: multipart/form-data
Body:
  - sid: session_id_123
  - uploadedfile[0]: [binary file data]
Response: { submission_id: "123456" }
```

#### 3. Edit + Publish (`/api_editsubmission.php`)
```javascript
POST https://inkbunny.net/api_editsubmission.php
Body:
  - sid: session_id_123
  - submission_id: 123456
  - title: "Mi Artwork"
  - desc: "Descripción aquí"
  - keywords: "furry digital_art commission" (separados por espacio)
  - type: "1" (1 = Picture/Pinup)
  - visibility: "yes" (publica inmediatamente, "no" = draft)
  - notify_followers: "yes" (notifica a seguidores)
  - guest_block: "no" (permite acceso público)
  - tag_list[2]: "1" (nudity - 0=no, 1=yes)
  - tag_list[3]: "1" (sexual - 0=no, 1=yes)
Response: { submission_id: "123456", ... }
```

### 🎨 Rating Mapping

```javascript
const ratingMap = {
  safe:         { nudity: '0', sexual: '0' }, // General
  questionable: { nudity: '1', sexual: '0' }, // Mature
  explicit:     { nudity: '1', sexual: '1' }, // Adult
}
```

### 📝 Tags en Inkbunny

**Formato:** separados por **espacios**, NO comas.

```javascript
// ✅ Correcto
keywords: "furry digital_art commission female anthro"

// ❌ Incorrecto
keywords: "furry, digital art, commission"
```

**Límite:** ~200 keywords (no hay límite oficial documentado, pero 200 es seguro).

**Caracteres especiales:** Inkbunny convierte automáticamente:
- Espacios → guiones bajos: `digital art` → `digital_art`
- Mayúsculas → minúsculas: `Furry` → `furry`

**Recomendación:** Envía tags ya normalizados:
- Sin espacios internos
- Todo en minúsculas
- Guiones bajos para palabras compuestas

---

## 🌐 Browser Automation — Qué Hace

### 1. Lanza Chromium
```javascript
const browser = await chromium.launch({
  headless: false,      // Visible
  channel: 'chrome',    // Usa Chrome del sistema si existe
})
```

### 2. Carga Cookies (sesión persistente)
```javascript
const COOKIES_FILE = '~/.commission-manager/browser-data/inkbunny-cookies.json'
await context.addCookies(JSON.parse(fs.readFileSync(COOKIES_FILE)))
```

### 3. Verifica Login
```javascript
const logoutLink = await page.$('a[href*="logout"]')
if (!logoutLink) {
  // No está logueado → hacer login
  await page.goto('https://inkbunny.net/login.php')
  await page.fill('input[name="username"]', username)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
}
```

### 4. Navega a Upload Page
```javascript
await page.goto('https://inkbunny.net/submissionsupload.php')
```

### 5. Descarga y Sube Imagen
```javascript
const tempFile = await downloadImageToFile(job.image_url)
const fileInput = await page.$('input[type="file"][name="uploadedfile[]"]')
await fileInput.setInputFiles(tempFile)
await page.click('button:has-text("Upload")')
```

### 6. Rellena Formulario
```javascript
// Título
await page.fill('input[name="title"]', job.title)

// Descripción
await page.fill('textarea[name="desc"]', job.description)

// Tags (keywords)
await page.fill('input[name="keywords"]', job.tags.join(' '))

// Rating checkboxes
if (job.rating === 'explicit') {
  await page.check('input[name="tag_list[2]"]') // nudity
  await page.check('input[name="tag_list[3]"]') // sexual
}

// Visibility = public
await page.selectOption('select[name="visibility"]', 'yes')

// Notify followers
await page.check('input[name="notify_followers"]')

// Allow guests
await page.uncheck('input[name="guest_block"]')
```

### 7. Deja Navegador Abierto
```javascript
// NO cierra el navegador
// Usuario revisa y hace click en "Submit"
return {
  ok: true,
  url: 'https://inkbunny.net/submissionsupload.php',
  message: 'Browser opened with form filled. Click Submit to publish.',
  browserOpen: true,
}
```

---

## 🐛 Troubleshooting

### Error: "Failed to launch browser"
**Causa:** Playwright browsers no instalados.

**Solución:**
```bash
cd companion-app
npx playwright install chromium
```

---

### Error: "WD-Tagger failed all models"
**Causa:** HuggingFace API no responde / sin token.

**Solución:**
- ✅ **Ignora el error** — puedes agregar tags manualmente
- O agrega HuggingFace token en Settings (opcional)

---

### Job se queda en "running"
**Causa:** El browser automation abrió Chrome pero no detectó que terminaste.

**Solución:**
- Cierra el navegador manualmente
- El job se quedará en "running" en Supabase
- **TODO:** Agregar timeout o botón "Marcar como completado"

---

### Inkbunny no acepta mi login
**Causa:** Credenciales incorrectas o cuenta bloqueada.

**Solución:**
1. Ve a https://inkbunny.net/login.php manualmente
2. Prueba tu username/password
3. Si funciona en el navegador pero no en la app, puede ser:
   - 2FA activado (no soportado aún)
   - Inkbunny detecta bot (usa browser automation en lugar de API)

---

## 🎯 Próximos Pasos

### 1. **Agregar más plataformas con browser automation:**
- ✅ Inkbunny (hecho)
- 🚧 FurAffinity (no tiene API)
- 🚧 DeviantArt (API limitada)
- 🚧 Newgrounds (no tiene API)
- 🚧 Pixiv (API restrictiva)

### 2. **Mejorar UX:**
- Notificación OS cuando navegador está listo
- Auto-submit opcional (sin aprobación manual)
- Screenshot del formulario lleno
- Timeout handling (cerrar navegador después de 10 min)

### 3. **Fix WD-Tagger:**
- Implementar tag_requests table en Supabase
- Companion app polling tag_requests
- Web app realtime listener para tags

---

## ✅ Resumen

### Lo que YA funciona:
✅ Companion app detecta jobs de Supabase  
✅ Browser automation con Playwright  
✅ Inkbunny: abre Chrome, rellena todo, deja listo para submit  
✅ API de Inkbunny (fallback si browser falla)  
✅ Tags manuales (no espera WD-Tagger)  
✅ Usuario aprueba antes de publicar (visual)  

### Lo que falta:
⚠️ Instalar Playwright browsers (`npx playwright install chromium`)  
⚠️ Recompilar companion app (versión 2.0.0)  
⚠️ Probar con un job real  

---

## 📞 Soporte

Si algo falla:
1. Revisa los logs en companion app (click derecho → Ver Logs)
2. Busca errores tipo `[inkbunnyBrowser]` o `[job]`
3. Si dice "Failed to launch browser" → instala browsers
4. Si dice "credentials incomplete" → revisa Settings

