'use strict'

/**
 * Test manual de conexión a HuggingFace
 * Ejecutar: node companion-app/test-hf-connection.js
 */

const TOKEN = 'hf_YOUR_TOKEN_HERE' // Tu token actual

async function testHuggingFaceAPI() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TEST DE CONEXIÓN HUGGINGFACE')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Test 1: Verificar que fetch existe
  console.log('📋 Test 1: Verificando fetch()...')
  if (typeof fetch === 'undefined') {
    console.error('❌ fetch() NO está disponible en Node.js')
    console.log('💡 Solución: Usar axios')
    return
  }
  console.log('✅ fetch() está disponible\n')

  // Test 2: Request GET simple
  console.log('📋 Test 2: GET request a HuggingFace API...')
  const url = 'https://api-inference.huggingface.co/models/SmilingWolf/wd-vit-tagger-v3'
  
  try {
    console.log(`🌐 URL: ${url}`)
    console.log(`🔑 Token: ${TOKEN.slice(0, 10)}...`)
    console.log('📤 Enviando GET request...\n')
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    })
    
    console.log(`📥 Respuesta: HTTP ${res.status} ${res.statusText}`)
    
    if (res.ok) {
      console.log('✅ Conexión EXITOSA\n')
      const data = await res.json()
      console.log('📦 Datos recibidos:')
      console.log(JSON.stringify(data, null, 2).slice(0, 500))
    } else {
      console.error(`❌ Respuesta no OK: ${res.status}`)
      const text = await res.text()
      console.error('💬 Body:', text.slice(0, 200))
    }
  } catch (err) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('❌ ERROR DE CONEXIÓN CON FETCH')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(`🔍 Tipo: ${err.name}`)
    console.error(`💬 Mensaje: ${err.message}`)
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    // Diagnóstico
    console.log('🔍 DIAGNÓSTICO:')
    if (err.message.includes('fetch failed')) {
      console.log('⚠️  Problema: Node.js fetch() no puede conectar')
      console.log('💡 Solución: Probar con axios (siguiente test)')
    }
    if (err.message.includes('ENOTFOUND')) {
      console.log('⚠️  Problema: DNS no resuelve el dominio')
      console.log('💡 Solución: Verificar DNS o usar 8.8.8.8')
    }
    if (err.message.includes('ETIMEDOUT')) {
      console.log('⚠️  Problema: Timeout de conexión')
      console.log('💡 Solución: Verificar firewall/proxy')
    }
    if (err.message.includes('certificate')) {
      console.log('⚠️  Problema: Certificado SSL inválido')
      console.log('💡 Solución: Usar axios con mejor manejo SSL')
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🏁 TEST CON FETCH FINALIZADO')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n')

  // Test 3: Mismo test pero con axios
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 Test 3: GET request con AXIOS...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  try {
    const axios = require('axios')
    console.log('✅ axios cargado correctamente')
    console.log('📤 Enviando GET request con axios...\n')
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      },
      timeout: 10000
    })
    
    console.log(`📥 Respuesta: HTTP ${response.status} ${response.statusText}`)
    console.log('✅ CONEXIÓN EXITOSA CON AXIOS!\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 SOLUCIÓN: Usar axios en vez de fetch()')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
  } catch (err) {
    console.error('❌ ERROR TAMBIÉN CON AXIOS')
    console.error(`💬 ${err.message}`)
    
    if (err.code) {
      console.error(`🔍 Code: ${err.code}`)
      
      if (err.code === 'ECONNREFUSED') {
        console.error('🚫 Conexión rechazada - Firewall bloqueando')
      } else if (err.code === 'ENOTFOUND') {
        console.error('🌐 DNS no puede resolver - Problema de red')
      } else if (err.code === 'ETIMEDOUT') {
        console.error('⏱️  Timeout - Red muy lenta o proxy')
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🏁 TODOS LOS TESTS FINALIZADOS')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

testHuggingFaceAPI()
