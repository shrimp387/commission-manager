# 🔑 Configurar HuggingFace API Token

## 🚨 Problema Actual

Los taggers (E621-Tagger y P.A.W.F.E.C.T) están fallando con:
```
Failed to fetch | Request failed: Failed to fetch
```

**Causa:** HuggingFace está bloqueando las requests por **rate limiting** (demasiadas requests sin autenticación).

---

## ✅ Solución: Agregar HuggingFace API Token

Un token de HuggingFace:
- ✅ **Es GRATIS**
- ✅ Elimina rate limits
- ✅ Da prioridad a tus requests
- ✅ Permite hasta 30,000 requests/mes gratis

---

## 📋 Paso 1: Crear Cuenta en HuggingFace

1. Ve a: **https://huggingface.co/join**
2. Regístrate con email o GitHub (gratis)
3. Confirma tu email

---

## 🔑 Paso 2: Generar API Token

1. Ve a: **https://huggingface.co/settings/tokens**
2. Click en **"New token"** o **"Create new token"**
3. Configuración:
   - **Name:** `Commission Manager` (o cualquier nombre)
   - **Type:** `Read` (solo lectura, suficiente para inference)
4. Click en **"Generate token"**
5. **Copia el token** (empieza con `hf_...`)
   - ⚠️ **Guárdalo en un lugar seguro**
   - Solo se muestra una vez

---

## ⚙️ Paso 3: Configurar Token en tu App

### **Opción A: Via UI (Cuando esté implementada)**

1. Ve a **Configuración** o **Settings**
2. Busca **"Conexiones"** o **"API Tokens"**
3. Pega tu token en **"HuggingFace Token"**
4. Guarda

### **Opción B: Via Console (Temporal)**

1. Abre tu app web
2. Abre Console (F12)
3. Pega y ejecuta:
```javascript
const config = JSON.parse(localStorage.getItem('app_config') || '{}')
config.hfToken = 'hf_TU_TOKEN_AQUI'  // ← Reemplaza con tu token
localStorage.setItem('app_config', JSON.stringify(config))
console.log('✅ Token configurado!')
```
4. Recarga la página (F5)

---

## 🧪 Paso 4: Probar

1. Recarga la página
2. Ve a PublishPage
3. Intenta generar tags con E621-Tagger
4. Abre Console (F12)

**Deberías ver:**
```
[tagGenerator] 🔑 HF Token: present
[e621Tagger] 🔑 HF Token: present
[e621Tagger] 📡 HF Response status: 200 OK
[e621Tagger] ✅ Generated 45 tags with Poofy1/e621-tagger
```

---

## 🔒 Seguridad del Token

### **¿Es seguro guardar el token en localStorage?**

**Sí**, para este caso:
- ✅ Es un token de **solo lectura** (Read)
- ✅ Solo puede hacer inference (generar tags)
- ✅ NO puede modificar/borrar modelos
- ✅ NO puede acceder a datos privados
- ✅ Puedes revocarlo en cualquier momento

###  **¿Alguien puede robarlo?**

- ⚠️ Técnicamente sí, si alguien tiene acceso físico a tu PC
- ✅ Pero solo podría usar inference (generar tags)
- ✅ No puede hacer daño real
- ✅ Puedes regenerar el token si sospechas

### **Best Practices:**

1. Usa un token de **Read** (no Write)
2. Nómbralo específicamente: "Commission Manager"
3. Si lo pierdes, revócalo y crea uno nuevo

---

## 📊 Límites con Token Gratis

| Feature | Sin Token | Con Token (Free) |
|---------|-----------|------------------|
| **Requests/día** | ~100 | ~1,000 |
| **Requests/mes** | ~3,000 | ~30,000 |
| **Prioridad** | Baja | Media |
| **Rate limit** | Agresivo | Relajado |
| **Costo** | Gratis | Gratis |

**Para tu uso personal:** El tier gratuito es **más que suficiente**.

---

## 🐛 Troubleshooting

### **Error: Invalid token**

**Solución:**
1. Verifica que el token empiece con `hf_`
2. Verifica que no tenga espacios al inicio/final
3. Regenera el token en HuggingFace

### **Sigue fallando con token configurado**

**Causa:** Cache del navegador

**Solución:**
```
1. Ctrl+Shift+Delete → Limpiar cache
2. Ctrl+Shift+N → Modo incógnito
3. Vuelve a configurar el token
4. Prueba de nuevo
```

### **Token configurado pero no se usa**

**Verificar en Console:**
```javascript
const config = JSON.parse(localStorage.getItem('app_config') || '{}')
console.log('HF Token:', config.hfToken)
```

Debe mostrar: `hf_...` (tu token)

---

## 🎯 Alternativa: Usar Mistral Pixtral

Si no quieres usar HuggingFace, puedes usar **Mistral Pixtral** (modelo de pago):

1. Ve a: **https://console.mistral.ai**
2. Crea cuenta y obtén API key
3. En tu app, cambia el backend a **"Mistral Pixtral"**
4. Configura la API key de Mistral

**Costo:** ~$0.15 por 1M tokens (muy barato)

---

## ✅ Resumen

1. **Crear cuenta** en HuggingFace (gratis)
2. **Generar token** (Read) en settings/tokens
3. **Copiar token** (empieza con `hf_`)
4. **Configurar** en app via console o UI
5. **Probar** - debería funcionar inmediatamente

---

## 📝 Próximos Pasos

Después de configurar el token:

```bash
git add .
git commit -m "feat: soporte para HuggingFace API token + mejor manejo de errores"
git push
```

Deploy y listo! 🚀
