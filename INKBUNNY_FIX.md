# 🔧 Inkbunny Browser Automation - Fix v2.1

## ❌ Problema Anterior

**Error:** `TimeoutError: page.waitForSelector: Timeout 10000ms exceeded - waiting for locator('input[type="file"]') to be visible`

El navegador se abría correctamente e iniciaba sesión, pero NO encontraba el input de archivo para subir la imagen.

---

## ✅ Solución Implementada

### 1. **Múltiples Selectores para File Input**
Antes buscaba solo `input[type="file"]`. Ahora prueba 5 selectores diferentes:
- `input[type="file"][name="uploadedfile[]"]`
- `input[type="file"][name="uploadedfile"]`
- `input[type="file"]`
- `#uploadedfile`
- `input[name="uploadedfile[]"]`

### 2. **Mejor Espera de Página**
- Cambió de `waitUntil: 'domcontentloaded'` a `waitUntil: 'networkidle'`
- Aumentó timeout de 2000ms a 3000ms
- Espera a que TODA la red termine de cargar

### 3. **Screenshots de Debug**
Ahora toma 2 screenshots automáticamente:
1. **Antes de subir** (`inkbunny-debug-TIMESTAMP.png`)
2. **Antes de rellenar form** (`inkbunny-form-TIMESTAMP.png`)

Ubicación: `C:\Users\zerauskii\AppData\Local\Temp\`

### 4. **Logs Super Detallados**
Cada paso muestra exactamente qué está haciendo:
```
[inkbunnyBrowser] Current URL after navigation: https://...
[inkbunnyBrowser] Page title: Upload - Inkbunny
[inkbunnyBrowser] Debug screenshot saved: C:\...\inkbunny-debug-1786600017615.png
[inkbunnyBrowser] Trying selector: input[type="file"][name="uploadedfile[]"]
[inkbunnyBrowser] ✅ Found file input with selector: input[type="file"]
```

### 5. **Múltiples Selectores para TODOS los Campos**
No solo el file input. TODOS los campos del formulario ahora tienen múltiples selectores:

**Title:**
- `input[name="title"]`
- `#title`
- `input[id*="title"]`

**Description:**
- `textarea[name="desc"]`
- `#desc`
- `textarea[id*="desc"]`
- `textarea[name="description"]`

**Keywords:**
- `input[name="keywords"]`
- `textarea[name="keywords"]`
- `#keywords`
- `input[id*="keyword"]`
- `textarea[id*="keyword"]`

**Buttons:**
- `button[type="submit"]`
- `input[type="submit"]`
- `button:has-text("Upload")`
- `input[value*="Upload"]`
- `button:has-text("Continue")`
- `input[value*="Continue"]`
- `.submit-button`

### 6. **Fallback Robusto**
Si un selector falla, intenta el siguiente. Si TODOS fallan, muestra warning pero continúa.

---

## 🚀 Cómo Probar Ahora

### 1. **Cierra Companion App Actual**
- Click derecho en bandeja → Salir

### 2. **Ejecuta Nueva Versión**
```
companion-app\dist\win-unpacked\Commission Manager Companion.exe
```

### 3. **Abre Logs**
- Click derecho en bandeja → Ver Logs

### 4. **Crea Job de Prueba**
- Web app → Comisión "Entregado" → "📢 Preparar publicación"
- Agrega tags manualmente (ej: `furry`, `commission`)
- Selecciona Inkbunny
- Enviar

### 5. **Observa los Logs**
Ahora deberías ver logs MUCHO más detallados:
```
[inkbunnyBrowser] Starting browser automation...
[inkbunnyBrowser] Launching browser...
[inkbunnyBrowser] Checking if already logged in...
[inkbunnyBrowser] Already logged in: true
[inkbunnyBrowser] Navigating to upload page...
[inkbunnyBrowser] Current URL after navigation: https://inkbunny.net/submissionsupload.php
[inkbunnyBrowser] Page title: Upload - Inkbunny
[inkbunnyBrowser] Debug screenshot saved: C:\Users\...\inkbunny-debug-1786600017615.png
[inkbunnyBrowser] Downloading image from: https://...
[inkbunnyBrowser] Image downloaded to: C:\Users\...\inkbunny-upload-1786600017615.png
[inkbunnyBrowser] Looking for file input...
[inkbunnyBrowser] Trying selector: input[type="file"][name="uploadedfile[]"]
[inkbunnyBrowser] ✅ Found file input with selector: input[type="file"][name="uploadedfile[]"]
[inkbunnyBrowser] Setting file input...
[inkbunnyBrowser] File set, waiting for upload...
[inkbunnyBrowser] Looking for upload/continue button...
[inkbunnyBrowser] Found button with selector: button[type="submit"]
[inkbunnyBrowser] Clicking upload button...
[inkbunnyBrowser] Upload button clicked, page loaded
[inkbunnyBrowser] New URL: https://inkbunny.net/submissionsdetails.php?id=...
[inkbunnyBrowser] Filling submission form...
[inkbunnyBrowser] Form screenshot saved: C:\Users\...\inkbunny-form-1786600020615.png
[inkbunnyBrowser] Setting title: coso
[inkbunnyBrowser] Title set using selector: input[name="title"]
[inkbunnyBrowser] Setting description...
[inkbunnyBrowser] Description set using selector: textarea[name="desc"]
[inkbunnyBrowser] Setting keywords/tags: [ 'furry', 'commission' ]
[inkbunnyBrowser] Keywords set: 2 tags using selector
[inkbunnyBrowser] Setting rating: safe
[inkbunnyBrowser] Nudity checkbox unchecked
[inkbunnyBrowser] Sexual content checkbox unchecked
[inkbunnyBrowser] Setting visibility to public...
[inkbunnyBrowser] ✅ Form filled! Browser left open for user review.
[inkbunnyBrowser] 👉 User can now review and click Submit.
```

---

## 🐛 Si Todavía Falla

### ¿Qué hacer?

1. **Mira los screenshots:**
   - Abre: `C:\Users\zerauskii\AppData\Local\Temp\`
   - Busca archivos: `inkbunny-debug-*.png` y `inkbunny-form-*.png`
   - Mira QUÉ página abrió realmente

2. **Copia los logs completos:**
   - Todo lo que diga `[inkbunnyBrowser]`
   - Péga melos en el chat

3. **Dime qué URL abrió:**
   - Revisa en los logs: `[inkbunnyBrowser] Current URL: ...`

Con esa info puedo ver exactamente qué está fallando.

---

## 📊 Diferencias Clave

### Antes (v2.0):
```javascript
// Solo 1 selector
await page.waitForSelector('input[type="file"]', { timeout: 10000 })
const fileInput = await page.$('input[type="file"][name="uploadedfile[]"], input[type="file"]')
```

### Ahora (v2.1):
```javascript
// 5 selectores con fallback
const fileInputSelectors = [
  'input[type="file"][name="uploadedfile[]"]',
  'input[type="file"][name="uploadedfile"]',
  'input[type="file"]',
  '#uploadedfile',
  'input[name="uploadedfile[]"]',
]

let fileInput = null
for (const selector of fileInputSelectors) {
  console.log('[inkbunnyBrowser] Trying selector:', selector)
  try {
    await page.waitForSelector(selector, { timeout: 3000, state: 'attached' })
    fileInput = await page.$(selector)
    if (fileInput) {
      console.log('[inkbunnyBrowser] ✅ Found file input with selector:', selector)
      break
    }
  } catch (err) {
    console.log('[inkbunnyBrowser] Selector not found:', selector)
  }
}
```

---

## ✅ Resultado Esperado

1. ✅ Chrome se abre
2. ✅ Login automático (o usa cookies)
3. ✅ Navega a página de upload
4. ✅ Encuentra input de archivo (con 5 intentos)
5. ✅ Sube la imagen
6. ✅ Click en botón "Upload" o "Continue"
7. ✅ Navega a página de detalles
8. ✅ Rellena título, descripción, tags, rating
9. ✅ Deja navegador abierto para aprobación
10. ✅ Usuario revisa y da click en "Submit"

---

## 🎯 Versión

**v2.1.0** — Inkbunny Browser Automation con múltiples selectores y debug mejorado

**Fecha:** 13 de agosto, 2026  
**Status:** ✅ Compilado y listo para probar
