'use strict'

/**
 * Test forzando IPv4 y usando IP directa si DNS falla
 */

const axios = require('axios')
const dns = require('dns')

const TOKEN = 'hf_YOUR_TOKEN_HERE'

// Configurar para usar solo IPv4
dns.setDefaultResultOrder('ipv4first')

async function testIPv4Force() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TEST FORZANDO IPv4')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Crear instancia de axios con configuración IPv4
  const axiosIPv4 = axios.create({
    family: 4, // Forzar IPv4
    timeout: 30000
  })

  console.log('🔧 Configuración: Solo IPv4')
  console.log('📡 DNS order: ipv4first\n')

  // Test 1: Intentar con dominio
  console.log('📋 Test 1: Conexión con dominio (IPv4)...')
  const url = 'https://api-inference.huggingface.co/models/SmilingWolf/wd-vit-tagger-v3'
  
  try {
    console.log(`🌐 URL: ${url}`)
    console.log('📤 Enviando request...\n')
    
    const response = await axiosIPv4.get(url, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    })
    
    console.log(`📥 Respuesta: HTTP ${response.status}`)
    console.log('✅ CONEXIÓN EXITOSA CON IPv4!\n')
    
  } catch (err) {
    console.error(`❌ Falló con dominio: ${err.message}`)
    if (err.code) {
      console.error(`🔍 Code: ${err.code}\n`)
    }
    
    // Si falla DNS, intentar resolver externamente
    console.log('📋 Test 2: Resolviendo con servicio externo...')
    
    try {
      // Usar servicio DNS over HTTPS de Cloudflare
      const dnsRes = await axios.get('https://cloudflare-dns.com/dns-query', {
        params: {
          name: 'api-inference.huggingface.co',
          type: 'A'
        },
        headers: {
          'Accept': 'application/dns-json'
        },
        timeout: 10000
      })
      
      if (dnsRes.data && dnsRes.data.Answer && dnsRes.data.Answer.length > 0) {
        const ip = dnsRes.data.Answer[0].data
        console.log(`✅ IP resuelta via DNS-over-HTTPS: ${ip}\n`)
        
        // Intentar con IP directa
        console.log('📋 Test 3: Conexión con IP directa...')
        const urlWithIP = `https://${ip}/models/SmilingWolf/wd-vit-tagger-v3`
        console.log(`🌐 URL: ${urlWithIP}`)
        
        try {
          const response2 = await axiosIPv4.get(urlWithIP, {
            headers: {
              'Authorization': `Bearer ${TOKEN}`,
              'Host': 'api-inference.huggingface.co' // SNI para HTTPS
            }
          })
          
          console.log(`📥 Respuesta: HTTP ${response2.status}`)
          console.log('✅ CONEXIÓN EXITOSA CON IP!\n')
          
          // Probar generación de tags con IP
          await testTagGenerationWithIP(ip)
          
        } catch (err2) {
          console.error(`❌ Falló con IP: ${err2.message}`)
          if (err2.code) {
            console.error(`🔍 Code: ${err2.code}`)
          }
        }
      }
      
    } catch (dnsErr) {
      console.error(`❌ No se pudo resolver con DNS-over-HTTPS: ${dnsErr.message}`)
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🏁 TEST FINALIZADO')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

async function testTagGenerationWithIP(ip) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 Test 4: Generación completa de tags con IP...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const axiosIPv4 = axios.create({
    family: 4,
    timeout: 60000
  })

  try {
    // Descargar imagen de prueba
    console.log('📥 Descargando imagen...')
    const testImageUrl = 'https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/beignets-task-guide.png'
    
    const imgRes = await axiosIPv4.get(testImageUrl, {
      responseType: 'arraybuffer'
    })
    
    const buffer = Buffer.from(imgRes.data)
    console.log(`✅ Imagen descargada: ${(buffer.length / 1024).toFixed(2)} KB\n`)
    
    // Generar tags usando IP
    console.log('📤 Generando tags...')
    const hfUrl = `https://${ip}/models/SmilingWolf/wd-vit-tagger-v3`
    
    const hfRes = await axiosIPv4.post(hfUrl, buffer, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Host': 'api-inference.huggingface.co'
      }
    })
    
    if (hfRes.status === 503) {
      const body = hfRes.data
      console.log(`⚠️  Modelo en cold start, esperando ${body.estimated_time || 20}s...`)
      await new Promise(r => setTimeout(r, (body.estimated_time || 20) * 1000))
      
      const hfRes2 = await axiosIPv4.post(hfUrl, buffer, {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/octet-stream',
          'Host': 'api-inference.huggingface.co'
        }
      })
      
      const predictions = hfRes2.data
      console.log('\n━━━━ RESULTADOS ━━━━')
      console.log(`✅ Tags generados: ${predictions.length}`)
      console.log('🏷️  Top 10:')
      predictions.slice(0, 10).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.label} (${(p.score * 100).toFixed(1)}%)`)
      })
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🎉 GENERACIÓN DE TAGS FUNCIONANDO!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      
    } else {
      const predictions = hfRes.data
      console.log('\n━━━━ RESULTADOS ━━━━')
      console.log(`✅ Tags generados: ${predictions.length}`)
      console.log('🏷️  Top 10:')
      predictions.slice(0, 10).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.label} (${(p.score * 100).toFixed(1)}%)`)
      })
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🎉 GENERACIÓN DE TAGS FUNCIONANDO!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    }
    
  } catch (err) {
    console.error('❌ ERROR en generación de tags')
    console.error(`💬 ${err.message}`)
    if (err.code) {
      console.error(`🔍 Code: ${err.code}`)
    }
    if (err.response) {
      console.error(`📊 HTTP Status: ${err.response.status}`)
    }
  }
}

testIPv4Force()
