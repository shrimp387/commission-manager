# Inkbunny - Mejoras Pendientes v2.8.0

## ✅ SOLUCIONADO - Upload FormData

**Problema**: El `sid` no se enviaba correctamente usando `fetch` nativo de Node.js
**Solución**: Cambiamos de `fetch` a `axios` que maneja FormData correctamente
**Resultado**: ¡Funciona! La imagen sube, se pone título, descripción, todo bien

---

## 📋 NUEVAS MEJORAS SOLICITADAS

### 1. Modo DRAFT (No publicar automáticamente)

**Status**: ✅ IMPLEMENTADO en v2.8.0

**Cambio realizado**:
```javascript
visibility: 'no',              // ← DRAFT MODE - not published
notify_followers: 'no',        // ← don't notify since it's a draft
```

**Resultado**: 
- La submission queda en estado DRAFT (no publicada)
- El usuario puede revisarla en Inkbunny
- Puede hacer cambios manualmente
- Puede publicarla cuando esté listo con el botón "Make Visible"

**URL**: La companion app retorna `https://inkbunny.net/submissionedit.php?submission_id=XXXXX` para que el usuario pueda ir directo a editar

---

### 2. Preview/Thumbnail Roto

**Problema**: Cuando la imagen es muy grande, el preview en Inkbunny sale roto (círculo con línea)

**Causa**: Inkbunny necesita generar el thumbnail automáticamente, y con imágenes grandes puede fallar o tardar

**Solución de PostyBirb**: Sube un thumbnail personalizado usando el campo `uploadedthumbnail[]`

**Plan de implementación**:
1. Después de descargar la imagen, generar un thumbnail (800x800px max)
2. Usar librería `sharp` (ya está en dependencies de Electron) o `canvas`
3. Agregar el thumbnail al FormData:
   ```javascript
   uploadForm.append('uploadedthumbnail[]', thumbnailBuffer, {
     filename: 'thumb_' + filename,
     contentType: 'image/jpeg'
   })
   ```

**Prioridad**: Media (la imagen sube bien, solo el preview está roto en la galería)

---

### 3. E621 Auto-Tagging AI (Alternativa a WD Tagger)

**Problema Actual**: 
- WD Tagger está entrenado con datos de anime/Danbooru
- No funciona bien para furry art que se sube a e621

**Modelos Encontrados para Furry/e621**:

#### Opción 1: **Poofy1/e621-tagger** ⭐ RECOMENDADO
- **GitHub**: https://github.com/Poofy1/e621-tagger
- **Descripción**: Web interface para generación automática de tags de e621
- **Ventajas**:
  - Específicamente entrenado con datos de e621
  - Soporta NSFW y SFW
  - No requiere GPU
  - Web interface disponible
- **Uso**: Puede ser llamado como API o integrado localmente

#### Opción 2: **Yolup1/E621-Tagger**
- **GitHub**: https://github.com/Yolup1/E621-Tagger
- **Descripción**: Red neuronal para identificar tags en posts de e621
- **Ventajas**: Específico para e621
- **Desventaja**: Más viejo, menos mantenido

#### Opción 3: **Dataset e621-2024**
- **HuggingFace**: https://huggingface.co/datasets/boxingscorpionbagel/e621-2024
- **Descripción**: Dataset completo de e621 (2024) con tags
- **Uso**: Para entrenar tu propio modelo o fine-tuning

#### Opción 4: **FluffyRock / P.A.W.F.E.C.T-Alpha**
- **HuggingFace**: https://huggingface.co/lodestones/P.A.W.F.E.C.T-Alpha
- **Descripción**: Modelo entrenado con FurAffinity (25k+ tags de vore, etc.)
- **Ventaja**: Muy específico para contenido furry nicho
- **Nota**: Se recomienda merge con FluffyRock para más control

---

## 🎯 PLAN DE IMPLEMENTACIÓN

### Fase 1: v2.8.0 - Draft Mode ✅ COMPLETADO
- [x] Cambiar `visibility: 'yes'` a `visibility: 'no'`
- [x] Cambiar `notify_followers: 'yes'` a `notify_followers: 'no'`
- [x] Retornar URL de edición en lugar de URL pública

### Fase 2: v2.9.0 - Thumbnail Generation
- [ ] Agregar dependencia `sharp` o usar `canvas` de Electron
- [ ] Función `generateThumbnail(imageBuffer)` que redimensiona a 800x800px
- [ ] Agregar thumbnail al FormData en upload
- [ ] Testear con imágenes grandes (>5MB)

### Fase 3: v3.0.0 - E621 Auto-Tagger
- [ ] Investigar API de Poofy1/e621-tagger
- [ ] Alternativa: Descargar modelo localmente (si es ligero)
- [ ] Integrar en `wdTagger.js` como opción adicional
- [ ] UI: Toggle "Use e621 tagger instead of WD14"
- [ ] Testear precisión de tags con furry art

---

## 📝 NOTAS TÉCNICAS

### ¿Por qué axios y no fetch?

**Fetch nativo de Node.js**:
- No maneja bien streams de `form-data` package
- Requiere `duplex: 'half'` pero aún así no envía campos correctamente
- El boundary del multipart/form-data no se procesa bien

**Axios**:
- Usa el paquete `form-data` nativamente
- `uploadForm.getHeaders()` funciona perfectamente
- Maneja streams y buffers correctamente
- Es lo que usa PostyBirb internamente (via `request` library)

### Inkbunny API - 3 Steps

1. **Login** (`/api_login.php`) → Obtiene `sid` (session ID)
2. **Upload** (`/api_upload.php`) → Sube archivo(s) + thumbnail opcional → Obtiene `submission_id`
3. **Edit** (`/api_editsubmission.php`) → Agrega metadata (title, desc, tags, visibility)

### Rating System en Inkbunny

```javascript
const ratingMap = {
  safe:         { tag_list_two_tagsintext: '0', tag_list_three_tagsintext: '0' },
  questionable: { tag_list_two_tagsintext: '1', tag_list_three_tagsintext: '0' },
  explicit:     { tag_list_two_tagsintext: '1', tag_list_three_tagsintext: '1' },
}
```

- `tag_list_two_tagsintext`: Mature content (1 = yes)
- `tag_list_three_tagsintext`: Adult/explicit content (1 = yes)

---

## 🔗 RECURSOS

- [Inkbunny API Docs](https://wiki.inkbunny.net/wiki/API) (oficial)
- [PostyBirb Plus - Inkbunny Service](https://github.com/mvdicarlo/postybirb-plus/blob/master/electron-app/src/server/websites/inkbunny/inkbunny.service.ts)
- [Poofy1/e621-tagger](https://github.com/Poofy1/e621-tagger)
- [e621 Tag Documentation](https://e621.net/wiki_pages/e621:tags)

---

## VERSIÓN ACTUAL

**v2.8.0** - Draft Mode implementado
- Submissions se crean en modo draft
- Usuario puede revisar antes de publicar
- URL de edición retornada para fácil acceso
