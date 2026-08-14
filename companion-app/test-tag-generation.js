'use strict'

const axios = require('axios')

const TOKEN = 'hf_YOUR_TOKEN_HERE'

async function testTagGeneration() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TEST DE GENERACIÓN DE TAGS')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Usar imagen de prueba pública
  const testImageUrl = 'https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/beignets-task-guide.png'
  
  console.log(`🖼️  Imagen de prueba: ${testImageUrl}`)
  console.log('📥 Descargando imagen con axios...\n')
  
  try {
    // Descargar imagen
    const startDownload = Date.now()
    const imgRes = await axios.get(testImageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })
    const downloadTime = Date.now() - startDownload
    
    const buffer = Buffer.from(imgRes.data)
    console.log(`✅ Imagen descargada en ${downloadTime}ms`)
    console.log(`📦 Tamaño: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(2)} KB)\n`)
    
    // Llamar a HuggingFace
    const model = 'SmilingWolf/wd-vit-tagger-v3'
    const url = `https://api-inference.huggingface.co/models/${model}`
    
    console.log(`🤖 Modelo: ${model}`)
    console.log(`📡 Endpoint: ${url}`)
    console.log('📤 Enviando POST con imagen...\n')
    
    const startHF = Date.now()
    const hfRes = await axios.post(url, buffer, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream'
      },
      timeout: 60000
    })
    const hfTime = Date.now() - startHF
    
    console.log(`📥 Respuesta: HTTP ${hfRes.status} en ${hfTime}ms`)
    
    if (hfRes.status === 503) {
      const body = hfRes.data
      console.log('⚠️  Modelo en cold start (503)')
      console.log(`⏳ Tiempo estimado: ${body.estimated_time || 20}s`)
      console.log('💤 Esperando...')
      await new Promise(r => setTimeout(r, (body.estimated_time || 20) * 1000))
      
      // Reintentar
      console.log('🔄 Reintentando...')
      const hfRes2 = await axios.post(url, buffer, {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/octet-stream'
        },
        timeout: 60000
      })
      
      console.log(`📥 Reintento: HTTP ${hfRes2.status}`)
      
      const predictions = hfRes2.data
      console.log('\n━━━━ RESULTADOS ━━━━')
      console.log(`✅ ÉXITO - Tags generados: ${predictions.length}`)
      console.log('🏷️  Top 10 tags:')
      predictions.slice(0, 10).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.label} (${(p.score * 100).toFixed(1)}%)`)
      })
      
      return predictions
    }
    
    const predictions = hfRes.data
    console.log('\n━━━━ RESULTADOS ━━━━')
    console.log(`✅ ÉXITO - Tags generados: ${predictions.length}`)
    console.log('🏷️  Top 10 tags:')
    predictions.slice(0, 10).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.label} (${(p.score * 100).toFixed(1)}%)`)
    })
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    return predictions
    
  } catch (err) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('❌ ERROR')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(`🔍 Tipo: ${err.name}`)
    console.error(`💬 Mensaje: ${err.message}`)
    if (err.code) {
      console.error(`🔍 Code: ${err.code}`)
    }
    if (err.response) {
      console.error(`📊 HTTP Status: ${err.response.status}`)
      console.error(`💬 Response: ${JSON.stringify(err.response.data).slice(0, 200)}`)
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🏁 TEST FINALIZADO')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

testTagGeneration()
