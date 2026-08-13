# Mejoras Implementadas v2.9.0

## ✅ COMPLETADO - Companion App

### 1. Ventana más pequeña y posicionada
```javascript
width: 420,    // Antes: 700px
height: 650,   // Antes: 600px
x: 20,         // Pegadita al lado izquierdo
y: 100,        // Un poco abajo del top
resizable: true,     // Puede redimensionar
maximizable: true,   // Puede maximizar
```

### 2. Thumbnail Generation con Sharp
- ✅ Instalado `sharp` para procesamiento de imágenes
- ✅ Función `generateThumbnail(buffer)` que:
  - Redimensiona a máximo 800x800px (mantiene aspect ratio)
  - Convierte a JPEG con calidad 85%
  - No agranda imágenes pequeñas
- ✅ Se sube automáticamente como `uploadedthumbnail[]` a Inkbunny
- ✅ **Resultado**: El preview ahora NO estará roto en la galería

### 3. Icono de la App
- ⚠️ **PENDIENTE**: Agregar archivo `companion-app/assets/icon.png`
- Requisitos:
  - 256x256px o 512x512px
  - Formato PNG con transparencia
  - Colores del tema (#7c6af5, #1a1a2e)

---

## 📋 PENDIENTE - App Web (Vercel)

### 1. Quitar WD Tagger completamente
- [ ] Eliminar referencias en el código
- [ ] Quitar imports y componentes relacionados
- [ ] Limpiar UI

### 2. Agregar Poofy1/e621-tagger
- [ ] Investigar API endpoint o modelo local
- [ ] Implementar integración
- [ ] UI para selección de modelo

### 3. Agregar P.A.W.F.E.C.T-Alpha como alternativa
- [ ] Investigar API o modelo
- [ ] Implementar como segunda opción
- [ ] Toggle en UI: "Use e621-tagger" vs "Use P.A.W.F.E.C.T"

### 4. Interfaz de Crop/Thumbnail Manual
- [ ] Agregar librería de crop (react-image-crop o similar)
- [ ] UI para recortar imagen antes de subir
- [ ] Guardar thumbnail personalizado
- [ ] Enviar thumbnail en el job de publicación

---

## 🔧 CÓMO PROBAR v2.9.0

1. **Agregar icono** (opcional por ahora):
   ```
   Copia un PNG de 256x256 a:
   companion-app/assets/icon.png
   ```

2. **Rebuild**:
   ```bash
   cd companion-app
   npm run build
   ```

3. **Ejecutar**:
   ```
   dist/win-unpacked/Commission Manager Companion.exe
   ```

4. **Verificar**:
   - La ventana debe aparecer más pequeña en la esquina izquierda
   - Puede maximizarse con el botón de maximizar
   - Al subir a Inkbunny, el preview NO debe salir roto

---

## 📚 RECURSOS PARA e621-TAGGER

### Poofy1/e621-tagger
- GitHub: https://github.com/Poofy1/e621-tagger
- Descripción: Web interface para auto-tagging furry art
- Características:
  - Entrenado específicamente con e621
  - Soporta NSFW y SFW
  - No requiere GPU
  - Tiene web interface y potencialmente API

### P.A.W.F.E.C.T-Alpha
- HuggingFace: https://huggingface.co/lodestones/P.A.W.F.E.C.T-Alpha
- Descripción: Modelo entrenado con FurAffinity
- Características:
  - 25k+ tags de contenido nicho (vore, etc.)
  - Tags precisos de FA
  - Se recomienda merge con FluffyRock para mejor control

### Implementación Sugerida
1. **API Approach** (recomendado):
   - Buscar si Poofy tiene API pública
   - Si no, descargar modelo y servir localmente
   
2. **Local Model**:
   - Descargar ONNX o PyTorch checkpoint
   - Servidor Python local (FastAPI)
   - Companion app llama a localhost:8000/predict

3. **HuggingFace Inference API**:
   - Usar HF Inference API (requiere API key)
   - Más simple pero requiere internet

---

## 🎯 PRÓXIMOS PASOS

1. ✅ Testear v2.9.0 con thumbnail generation
2. Agregar icono a la app
3. Investigar API de Poofy1/e621-tagger
4. Implementar en app web (Vercel):
   - Quitar WD Tagger
   - Agregar e621-tagger
   - Agregar P.A.W.F.E.C.T
   - UI de crop/thumbnail
5. Versión final: v3.0.0

---

## 🐛 BUGS CONOCIDOS

- Ninguno reportado en v2.9.0

---

## 📝 CHANGELOG

### v2.9.0
- ✅ Ventana de companion app más pequeña (420x650) y posicionada en esquina
- ✅ Thumbnail generation automático con Sharp (800x800px JPEG)
- ✅ Upload de thumbnail personalizado a Inkbunny (fixes broken preview)
- ✅ Soporte para maximizar ventana
- ⚠️ Icono de app pendiente (requiere PNG 256x256)

### v2.8.0
- ✅ Modo DRAFT en Inkbunny (visibility: 'no')
- ✅ URL de edición retornada

### v2.7.0
- ✅ Fix FormData upload con axios
- ✅ Inkbunny upload funcionando correctamente
