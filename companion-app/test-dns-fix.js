'use strict'

/**
 * Test con DNS fix - Configurar DNS de Google
 */

const dns = require('dns')
const axios = require('axios')

// Configurar DNS de Google
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1'])

const TOKEN = 'hf_YOUR_TOKEN_HERE'

async function testWithDNSFix() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TEST CON DNS FIX')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log('🔧 Configurando DNS de Google (8.8.8.8, 8.8.4.4, 1.1.1.1)...')
  console.log(`📊 DNS configurados: ${dns.getServers().join(', ')}\n`)

  // Test 1: Resolver manualmente el dominio
  console.log('📋 Test 1: Resolviendo dominio...')
  try {
    const addresses = await dns.promises.resolve4('api-inference.huggingface.co')
    console.log(`✅ Dominio resuelto: ${addresses.join(', ')}\n`)
  } catch (err) {
    console.error(`❌ No se pudo resolver: ${err.message}\n`)
    return
  }

  // Test 2: Request con axios
  console.log('📋 Test 2: GET request con axios + DNS fix...')
  const url = 'https://api-inference.huggingface.co/models/SmilingWolf/wd-vit-tagger-v3'
  
  try {
    console.log(`🌐 URL: ${url}`)
    console.log(`🔑 Token: ${TOKEN.slice(0, 10)}...`)
    console.log('📤 Enviando request...\n')
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      },
      timeout: 10000,
      family: 4 // Forzar IPv4
    })
    
    console.log(`📥 Respuesta: HTTP ${response.status}`)
    console.log('✅ CONEXIÓN EXITOSA!\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 SOLUCIÓN: Configurar DNS en Node.js')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
  } catch (err) {
    console.error('❌ ERROR')
    console.error(`💬 ${err.message}`)
    if (err.code) {
      console.error(`🔍 Code: ${err.code}`)
    }
  }

  // Test 3: Descargar imagen y generar tags
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 Test 3: Generación de tags completa...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const testImageUrl = 'https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/beignets-task-guide.png'
  
  try {
    // Descargar imagen
    console.log('📥 Descargando imagen...')
    const imgRes = await axios.get(testImageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      family: 4
    })
    
    const buffer = Buffer.from(imgRes.data)
    console.log(`✅ Imagen descargada: ${(buffer.length / 1024).toFixed(2)} KB\n`)
    
    // Llamar a HuggingFace
    const model = 'SmilingWolf/wd-vit-tagger-v3'
    const hfUrl = `https://api-inference.huggingface.co/models/${model}`
    
    console.log('📤 Generando tags con HuggingFace...')
    const hfRes = await axios.post(hfUrl, buffer, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream'
      },
      timeout: 60000,
      family: 4
    })
    
    if (hfRes.status === 503) {
      const body = hfRes.data
      console.log(`⚠️  Modelo en cold start, esperando ${body.estimated_time || 20}s...`)
      await new Promise(r => setTimeout(r, (body.estimated_time || 20) * 1000))
      
      const hfRes2 = await axios.post(hfUrl, buffer, {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/octet-stream'
        },
        timeout: 60000,
        family: 4
      })
      
      const predictions = hfRes2.data
      console.log('\n━━━━ RESULTADOS ━━━━')
      console.log(`✅ Tags generados: ${predictions.length}`)
      console.log('🏷️  Top 10:')
      predictions.slice(0, 10).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.label} (${(p.score * 100).toFixed(1)}%)`)
      })
      
    } else {
      const predictions = hfRes.data
      console.log('\n━━━━ RESULTADOS ━━━━')
      console.log(`✅ Tags generados: ${predictions.length}`)
      console.log('🏷️  Top 10:')
      predictions.slice(0, 10).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.label} (${(p.score * 100).toFixed(1)}%)`)
      })
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 TODOS LOS TESTS PASARON!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
  } catch (err) {
    console.error('❌ ERROR en generación de tags')
    console.error(`💬 ${err.message}`)
    if (err.code) {
      console.error(`🔍 Code: ${err.code}`)
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🏁 TEST FINALIZADO')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

testWithDNSFix()
