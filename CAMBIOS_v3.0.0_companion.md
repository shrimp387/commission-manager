# 🎉 Cambios v3.0.0 - Companion App

## 📋 Resumen

Esta versión mejora la experiencia de usuario eliminando opciones innecesarias, mejorando el debugging, mostrando información de usuario más clara, y agregando herramientas de diagnóstico.

---

## ✅ Cambios Implementados

### 1. **Inkbunny: Eliminada Opción de Automatización de Navegador**

**Problema anterior:**
- Había una opción confusa "Usar automatización de navegador" que abría Chrome
- No era necesaria ya que Inkbunny funciona perfectamente via API

**Solución:**
- ❌ Eliminado checkbox "Usar automatización de navegador"
- ✅ Inkbunny ahora solo usa API directa
- ✅ Las submissions quedan en modo DRAFT automáticamente
- ✅ Mensaje claro explicando que puedes revisar antes de publicar

**Archivos modificados:**
- `companion-app/ui/settings.html` - Eliminado checkbox y texto
- `companion-app/ui/settings.js` - Eliminada lógica de `useBrowser`
- `companion-app/src/main.js` - Removido de defaults

---

### 2. **Mostrar Nombre de Usuario en vez de ID de Supabase**

**Problema anterior:**
- Se mostraba el UUID largo de Supabase (ej: `9347035e-7364-4852-a8bd-5f3c3792fd50`)
- Difícil de identificar qué cuenta está conectada

**Solución:**
- ✅ Ahora muestra el **email** de Google (ej: `tuusuario@gmail.com`)
- ✅ Muestra el **nombre** de la cuenta de Google debajo
- ✅ Interfaz más amigable y reconocible

**Ejemplo antes:**
```
👤 Sesión activa
   9347035e-7364-4852-a8bd-5f3c3792fd50
```

**Ejemplo después:**
```
👤 tuusuario@gmail.com
   Tu Nombre
```

**Archivos modificados:**
- `companion-app/ui/settings.html` - Cambiado layout
- `companion-app/ui/settings.js` - Actualizado `updateAuthUI()`
- `companion-app/src/main.js` - Mejorado `get-status` handler

---

### 3. **Debugging Completo para Login de Google OAuth**

**Agregado:**
- ✅ Logs detallados en cada paso del flujo OAuth
- ✅ Logs cuando se abre el navegador
- ✅ Logs cuando se recibe el callback
- ✅ Logs cuando se guarda la sesión
- ✅ Logs de información del usuario (email, nombre, ID)

**Ejemplo de logs:**
```
[googleLogin] 🔑 Starting Google OAuth flow...
[googleLogin] 📡 Calling signInWithOAuth...
[googleLogin] 🌐 Opening OAuth URL in browser: https://yhlhsqhlnzgrhagoeosp.supabase.co/auth...
[googleLogin] ✅ Browser opened, waiting for callback...
[oauth] 📨 Received session POST request
[oauth] 🔑 Access token received, setting session...
[oauth] ✅ Session saved successfully
[oauth] 👤 User: { id: '9347...', email: 'user@gmail.com', name: 'User Name' }
```

**Archivos modificados:**
- `companion-app/src/main.js` - Agregado debugging en:
  - `google-login` handler
  - `/auth/session` endpoint
  - `get-status` handler

---

### 4. **Debugging Completo para Taggers (E621 y P.A.W.F.E.C.T)**

**Problema anterior:**
- Error genérico "Failed to download image: Failed to fetch"
- No se sabía si era problema de CORS, de HuggingFace, de la imagen, etc.

**Solución:**
- ✅ Logs detallados en cada paso de generación de tags
- ✅ Logs de descarga de imagen (URL, tamaño, headers CORS)
- ✅ Logs de llamada a HuggingFace (modelo, token, respuesta)
- ✅ Logs de cantidad de tags generados
- ✅ Logs de errores específicos con detalles

**Ejemplo de logs:**
```
[e621Tagger] 🎯 Starting E621-Tagger generation
[e621Tagger] 🖼️ Image URL: https://commission-manager-r2...
[e621Tagger] 📥 Downloading image: https://...
[e621Tagger] 📡 Response status: 200 OK
[e621Tagger] 📋 Response headers: { content-type: 'image/png', content-length: '2928711', access-control-allow-origin: '*' }
[e621Tagger] 📦 Reading arrayBuffer...
[e621Tagger] ✅ Downloaded: 2928711 bytes
[e621Tagger] 🔄 Trying model: Poofy1/e621-tagger
[e621Tagger] 🤖 Calling HuggingFace model: Poofy1/e621-tagger
[e621Tagger] 📊 Image buffer size: 2928711 bytes
[e621Tagger] 🔑 HF Token: not provided
[e621Tagger] 📡 Sending request to: https://api-inference.huggingface.co/models/Poofy1/e621-tagger
[e621Tagger] 📡 HF Response status: 200 OK
[e621Tagger] 📊 HF Response: 150 predictions
[e621Tagger] ✅ Generated 45 tags with Poofy1/e621-tagger
[e621Tagger] 🏷️ Tags: anthro, fox, digital art, solo, male, ...
```

**Archivos modificados:**
- `src/lib/e621Tagger.js` - Agregado debugging completo en:
  - `downloadImageForTagging()` - Descarga de imagen
  - `callHuggingFaceModel()` - Llamadas a HuggingFace
  - `generateTagsE621()` - Flujo completo E621
  - `generateTagsPAWFECT()` - Flujo completo P.A.W.F.E.C.T

---

### 5. **Botón "Probar Conexión" para Supabase**

**Agregado:**
- ✅ Nuevo botón "🔌 Probar conexión" en la sección de cuenta
- ✅ Verifica que Supabase esté conectado correctamente
- ✅ Muestra resultado inmediato (conectado/desconectado)
- ✅ Útil para diagnosticar problemas de conexión

**Ubicación:** 
En la companion app, sección "Cuenta" → después de iniciar sesión

**Archivos modificados:**
- `companion-app/ui/settings.html` - Agregado botón
- `companion-app/ui/settings.js` - Agregada función `testConnection()`

---

## 🔧 Archivos Modificados

### Companion App:
1. `companion-app/package.json` - Version 2.9.0 → **3.0.0**
2. `companion-app/src/main.js` - Debugging OAuth + get-status mejorado
3. `companion-app/ui/settings.html` - UI mejorada (nombre usuario + botón test)
4. `companion-app/ui/settings.js` - Lógica actualizada

### Web App:
5. `src/lib/e621Tagger.js` - Debugging completo para taggers

---

## 📦 Cómo Probar

### 1. Rebuil Companion App:
```bash
cd companion-app
npm run build
```

### 2. Ejecutar:
```
companion-app\dist\win-unpacked\Commission Manager Companion.exe
```

### 3. Verificar Cambios:

**✅ Inkbunny sin navegador:**
- Abre configuración → Inkbunny
- Ya NO debe aparecer el checkbox "Usar automatización de navegador"
- Debe decir "Inkbunny publica via API directamente..."

**✅ Nombre de usuario:**
- Inicia sesión con Google
- Debe mostrar tu email y nombre, NO el UUID

**✅ Debugging login:**
- Abre la companion app desde terminal o mira los logs
- Al hacer login debes ver logs como:
  ```
  [googleLogin] 🔑 Starting Google OAuth flow...
  [oauth] 👤 User: { email: '...', name: '...' }
  ```

**✅ Debugging taggers:**
- En la web app, intenta generar tags
- Abre DevTools Console (F12)
- Debes ver logs detallados como:
  ```
  [e621Tagger] 🎯 Starting E621-Tagger generation
  [e621Tagger] 📥 Downloading image: ...
  ```

**✅ Botón probar conexión:**
- Después de iniciar sesión, haz click en "🔌 Probar conexión"
- Debe mostrar "✅ Conectado a Supabase correctamente"

---

## 🐛 Problemas Conocidos y Soluciones

### Error "Failed to download image" en taggers

**Causa:** CORS bloqueando la descarga desde R2 a HuggingFace

**Solución temporal:** 
El debugging ahora muestra exactamente qué está fallando. Si ves:
```
access-control-allow-origin: null
```
Significa que R2 no está permitiendo CORS.

**Fix permanente:**
Necesitas configurar CORS en tu bucket de Cloudflare R2:
```json
{
  "AllowedOrigins": ["*"],
  "AllowedMethods": ["GET"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["Content-Length", "Content-Type"]
}
```

---

## 📝 Notas Técnicas

### Conexión Companion App ↔ Web App

**No necesita configuración adicional.** La conexión funciona así:

1. **Web App (Vercel)** → Escribe jobs en Supabase
2. **Companion App** → Lee jobs de Supabase cada 5 segundos
3. **Companion App** → Publica en plataformas
4. **Companion App** → Escribe resultados en Supabase
5. **Web App** → Lee resultados de Supabase

**Requisitos:**
- Companion App debe tener sesión iniciada (Google OAuth)
- Misma cuenta de Google en web app y companion app
- Supabase credentials ya están hardcoded en ambas apps

**No se necesita:**
- ❌ Configurar URLs adicionales
- ❌ Abrir puertos
- ❌ Configurar webhooks
- ❌ Instalar nada más

---

## 🎯 Siguiente Paso

**Deploy Web App:**
```bash
git add .
git commit -m "feat: debugging completo para taggers, UI mejorada companion app v3.0.0"
git push
```

**Listo! 🚀**
