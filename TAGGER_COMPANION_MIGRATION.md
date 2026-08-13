# Migración: Taggers E621/PAWFECT via Companion App

## 🎯 Objetivo

Evitar errores de CORS y rate limiting al usar los taggers E621 y P.A.W.F.E.C.T, usando el patrón de companion app (igual que WD-Tagger).

## 📋 Cambios Realizados

### 1. Base de Datos (Supabase)

**Archivo:** `companion-app/sql/add_tagger_type.sql`

Se agregó la columna `tagger_type` a la tabla `tag_requests` para especificar qué tagger usar:
- `'wd'` → WD-Tagger (anime/general, default)
- `'e621'` → E621-Tagger (furry art, e621-trained)
- `'pawfect'` → P.A.W.F.E.C.T (furry art, FurAffinity-trained)

**⚠️ ACCIÓN REQUERIDA:** Debes ejecutar esta migración en tu panel de Supabase:

1. Ve a https://supabase.com/dashboard/project/yhlhsqhlnzgrhagoeosp/editor
2. Abre el SQL Editor
3. Copia y pega el contenido de `companion-app/sql/add_tagger_type.sql`
4. Ejecuta la query

### 2. Web App (Frontend)

#### `src/lib/tagRequestsDb.js`
- **Cambio:** `requestTagsFromCompanion()` ahora acepta parámetro `taggerType` ('wd' | 'e621' | 'pawfect')
- **Funcionalidad:** Inserta el tipo de tagger en la DB y muestra mensajes específicos según el tagger usado

#### `src/lib/e621Tagger.js`
- **Cambio:** `generateTagsE621()` y `generateTagsPAWFECT()` ahora usan `requestTagsFromCompanion()` en lugar de fetch directo
- **Beneficio:** Ya no hay problemas de CORS ni rate limiting porque la companion app descarga la imagen

#### `src/lib/tagGenerator.js`
- **Cambio:** `generateTagsWDTagger()` ahora pasa `'wd'` como tipo al llamar `requestTagsFromCompanion()`
- **Compatibilidad:** Mantiene compatibilidad con código existente

### 3. Companion App (Electron)

#### `companion-app/src/e621Tagger.js` (NUEVO)
- **Funciones:** `generateTagsE621()` y `generateTagsPAWFECT()`
- **Modelos HuggingFace:**
  - E621: `Poofy1/e621-tagger` (fallback: `SmilingWolf/wd-vit-tagger-v3`)
  - PAWFECT: `lodestones/P.A.W.F.E.C.T-Alpha` (fallback: `SmilingWolf/wd-vit-tagger-v3`)
- **Features:**
  - Descarga imagen sin restricciones de CORS
  - Llama a HuggingFace Inference API
  - Maneja model loading (503) con retry automático
  - Normaliza tags al formato e621 (espacios en lugar de underscores)

#### `companion-app/src/main.js`
- **Cambio:** `processTagRequests()` ahora lee `tagger_type` y rutea a la función correcta:
  - `'wd'` → `generateTagsWDTagger()`
  - `'e621'` → `generateTagsE621()`
  - `'pawfect'` → `generateTagsPAWFECT()`
- **Logging:** Muestra el tipo de tagger usado en los logs

## 🔄 Flujo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│  WEB APP (Vercel)                                               │
│  ↓                                                              │
│  1. Usuario hace clic en "Generar Tags" con backend E621       │
│  2. tagGenerator.generateTagsE621(imageUrl, hfToken, onStatus) │
│  3. requestTagsFromCompanion(imageUrl, 'e621', onStatus)       │
│  4. INSERT INTO tag_requests (tagger_type='e621', status='pending') │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE (Database)                                            │
│  - Tabla: tag_requests                                          │
│  - Status: pending → processing → done/error                    │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  COMPANION APP (Electron, PC del artista)                       │
│  ↓                                                              │
│  1. Polling cada 5s: SELECT * FROM tag_requests WHERE status='pending' │
│  2. Lee tagger_type='e621'                                      │
│  3. Llama generateTagsE621(imageUrl, hfToken)                   │
│     a. Descarga imagen (fetch sin CORS, Node.js)               │
│     b. POST a HuggingFace con Authorization: Bearer {hfToken}  │
│     c. Parsea predictions y normaliza tags                      │
│  4. UPDATE tag_requests SET status='done', tags=[...] WHERE id=X │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  WEB APP (Vercel)                                               │
│  ↓                                                              │
│  1. Polling cada 2s: SELECT * FROM tag_requests WHERE id=X     │
│  2. Detecta status='done'                                       │
│  3. Muestra los tags generados                                  │
│  4. DELETE FROM tag_requests WHERE id=X (limpieza)             │
└─────────────────────────────────────────────────────────────────┘
```

## ✅ Ventajas

1. **Sin CORS:** La companion app corre en Node.js (sin restricciones de browser)
2. **Sin Rate Limiting:** Con HuggingFace token configurado en companion app
3. **Mejor UX:** Mensajes específicos por tagger ("Analizando con E621-Tagger...")
4. **Fallbacks:** Si un modelo falla, intenta con otro automáticamente
5. **Unified Pattern:** Todos los taggers usan el mismo flujo (Supabase tag_requests)

## 🚀 Próximos Pasos

1. **Ejecutar migración SQL** (ver sección 1 arriba)
2. **Rebuild companion app:**
   ```bash
   cd companion-app
   npm run build
   ```
3. **Testear:**
   - Abrir companion app
   - En web app, ir a Publicar → Generar Tags
   - Probar con backend "E621" y "P.A.W.F.E.C.T"
   - Verificar en companion app logs que se llama al tagger correcto

## 📝 Notas

- **Token HuggingFace:** Opcional pero RECOMENDADO para evitar rate limits
  - Gratis: ~1,000 requests/día
  - Obtener en: https://huggingface.co/settings/tokens (tipo: Read)
  - Configurar en: Settings → 🔌 Conexiones → HuggingFace API Token

- **Modelos usados:**
  - E621-Tagger: Entrenado con datos de e621.net (furry art)
  - P.A.W.F.E.C.T: Entrenado con FurAffinity (furry art)
  - WD-Tagger: Entrenado con datos de anime (Danbooru/Gelbooru)

- **Formatos de tags:**
  - WD-Tagger: `underscores_between_words`
  - E621/PAWFECT: `spaces between words` (normalizado en companion app)

## 🐛 Troubleshooting

**"Timeout: La Companion App no respondió"**
→ Verifica que la companion app esté abierta y conectada (ícono en system tray)

**"rate limit exceeded"**
→ Configura un token de HuggingFace en Settings → Conexiones

**"Model loading" tarda mucho**
→ Normal en el primer request (HuggingFace cold start). Luego es rápido.

**Tags en formato incorrecto**
→ Verifica que estés usando la última versión de companion app (con normalización de tags)
