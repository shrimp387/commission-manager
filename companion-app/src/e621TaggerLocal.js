import fetch from 'node-fetch';
import FormData from 'form-data';

const TAGGER_LOCAL_URL = 'http://localhost:5000';

/**
 * Verifica si el servidor e621-tagger local está corriendo
 * @returns {Promise<boolean>} True si el servidor responde
 */
export async function checkE621TaggerStatus() {
  try {
    const response = await fetch(TAGGER_LOCAL_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (error) {
    console.log('[e621TaggerLocal] ⚠️ Servidor no disponible:', error.message);
    return false;
  }
}

/**
 * Genera tags usando el tagger local desde un buffer de imagen
 * @param {Buffer} imageBuffer - Buffer de la imagen
 * @param {string} filename - Nombre del archivo (opcional, default: 'image.png')
 * @returns {Promise<string[]>} Array de tags normalizados
 */
export async function generateTagsE621Local(imageBuffer, filename = 'image.png') {
  console.log('[e621TaggerLocal] 🏷️ Generando tags con tagger local...');
  console.log('[e621TaggerLocal] 📊 Tamaño de imagen:', (imageBuffer.length / 1024).toFixed(2), 'KB');
  
  const formData = new FormData();
  formData.append('image', imageBuffer, {
    filename: filename,
    contentType: 'image/png'
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 segundos

    const response = await fetch(`${TAGGER_LOCAL_URL}/upload`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // El modelo retorna tags separados por comas
    const tags = data.prediction
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    console.log('[e621TaggerLocal] ✅ Tags generados:', tags.length);
    console.log('[e621TaggerLocal] 🏷️ Primeros 10 tags:', tags.slice(0, 10).join(', '));
    
    return tags;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[e621TaggerLocal] ⏱️ Timeout después de 30 segundos');
      throw new Error('Timeout al generar tags con tagger local (30s)');
    }
    console.error('[e621TaggerLocal] ❌ Error:', error.message);
    throw new Error(`Error al generar tags con tagger local: ${error.message}`);
  }
}

/**
 * Descarga imagen desde URL y genera tags en un solo paso
 * @param {string} imageUrl - URL de la imagen
 * @returns {Promise<string[]>} Array de tags normalizados
 */
export async function generateTagsE621LocalFromUrl(imageUrl) {
  console.log('[e621TaggerLocal] 📥 Descargando imagen:', imageUrl);
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const imageResponse = await fetch(imageUrl, { 
      signal: controller.signal 
    });
    
    clearTimeout(timeout);

    if (!imageResponse.ok) {
      throw new Error(`Error al descargar imagen: HTTP ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.buffer();
    console.log('[e621TaggerLocal] ✅ Imagen descargada:', (imageBuffer.length / 1024).toFixed(2), 'KB');
    
    // Generar tags
    return await generateTagsE621Local(imageBuffer);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Timeout al descargar imagen (30s)');
    }
    throw error;
  }
}

/**
 * Obtiene información del servidor e621-tagger local
 * @returns {Promise<Object>} Información del servidor
 */
export async function getE621TaggerInfo() {
  try {
    const isOnline = await checkE621TaggerStatus();
    return {
      online: isOnline,
      url: TAGGER_LOCAL_URL,
      model: 'e621-tagger (poofy38/e621-tagger-01)',
      description: 'Modelo local especializado en furry art'
    };
  } catch (error) {
    return {
      online: false,
      url: TAGGER_LOCAL_URL,
      error: error.message
    };
  }
}
