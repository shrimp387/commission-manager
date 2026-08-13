import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { getCurrentUserId } from '../lib/db.js'
import './ConnectionTestPage.css'

export default function ConnectionTestPage() {
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState({})

  function updateResult(testId, message, type = 'info') {
    setResults(prev => ({ ...prev, [testId]: { message, type } }))
  }

  function setLoadingState(testId, isLoading) {
    setLoading(prev => ({ ...prev, [testId]: isLoading }))
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 1: Companion Health
  // ═══════════════════════════════════════════════════════════════
  
  async function testCompanionHealth() {
    setLoadingState('companion', true)
    updateResult('companion', '⏳ Conectando a http://localhost:54322/health...', 'info')
    
    try {
      const res = await fetch('http://localhost:54322/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      
      const data = await res.json()
      updateResult('companion', 
        `✅ COMPANION APP ESTÁ CORRIENDO\n\n${JSON.stringify(data, null, 2)}`,
        'success'
      )
    } catch (err) {
      updateResult('companion',
        `❌ COMPANION APP NO RESPONDE\n\nError: ${err.message}\n\n` +
        `Solución:\n` +
        `1. Abre la companion app\n` +
        `2. Verifica que esté corriendo (icono en la bandeja del sistema)\n` +
        `3. Vuelve a intentar este test`,
        'error'
      )
    } finally {
      setLoadingState('companion', false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: Supabase Auth
  // ═══════════════════════════════════════════════════════════════
  
  async function testSupabaseAuth() {
    setLoadingState('auth', true)
    updateResult('auth', '⏳ Verificando autenticación...', 'info')
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error) throw error
      
      if (!user) {
        updateResult('auth',
          `⚠️ NO HAY USUARIO AUTENTICADO\n\n` +
          `Solución: Haz login en la app`,
          'error'
        )
        return
      }
      
      updateResult('auth',
        `✅ USUARIO AUTENTICADO\n\n` +
        `ID: ${user.id}\n` +
        `Email: ${user.email}`,
        'success'
      )
    } catch (err) {
      updateResult('auth',
        `❌ ERROR DE AUTENTICACIÓN\n\nError: ${err.message}`,
        'error'
      )
    } finally {
      setLoadingState('auth', false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: publish_jobs table
  // ═══════════════════════════════════════════════════════════════
  
  async function testPublishJobsTable() {
    setLoadingState('table', true)
    updateResult('table', '⏳ Verificando tabla publish_jobs...', 'info')
    
    try {
      const { data, error, count } = await supabase
        .from('publish_jobs')
        .select('*', { count: 'exact', head: false })
        .limit(1)
      
      if (error) {
        if (error.message.includes('does not exist')) {
          updateResult('table',
            `❌ TABLA publish_jobs NO EXISTE\n\n` +
            `Error: ${error.message}\n\n` +
            `Solución:\n` +
            `1. Abre Supabase Dashboard\n` +
            `2. Ve a SQL Editor\n` +
            `3. Ejecuta: companion-app/sql/publish_jobs.sql`,
            'error'
          )
          return
        }
        throw error
      }
      
      updateResult('table',
        `✅ TABLA publish_jobs EXISTE\n\n` +
        `Total de registros: ${count ?? 0}`,
        'success'
      )
    } catch (err) {
      updateResult('table',
        `❌ ERROR AL VERIFICAR TABLA\n\nError: ${err.message}`,
        'error'
      )
    } finally {
      setLoadingState('table', false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Insert Job
  // ═══════════════════════════════════════════════════════════════
  
  async function testInsertJob() {
    setLoadingState('insert', true)
    updateResult('insert', '⏳ Insertando job de prueba...', 'info')
    
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('No hay usuario autenticado')
      
      const testJob = {
        user_id: userId,
        task_id: null,
        task_name: 'Test Job',
        image_url: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131',
        platforms: ['telegram', 'discord'],
        title: 'Test Artwork',
        description: 'Job de prueba',
        tags: ['test', 'debug'],
        rating: 'safe',
        status: 'pending',
      }
      
      console.log('[TestPage] Insertando job:', testJob)
      
      const { data, error } = await supabase
        .from('publish_jobs')
        .insert(testJob)
        .select()
        .single()
      
      if (error) {
        console.error('[TestPage] Error de Supabase:', error)
        throw error
      }
      
      console.log('[TestPage] Job insertado:', data)
      
      updateResult('insert',
        `✅ JOB INSERTADO CORRECTAMENTE\n\n` +
        `Job ID: ${data.id}\n` +
        `Status: ${data.status}\n` +
        `User ID: ${data.user_id}\n` +
        `Created: ${data.created_at}\n\n` +
        `✨ AHORA:\n` +
        `1. Abre los logs de la companion app\n` +
        `2. Espera 5-10 segundos (polling)\n` +
        `3. Deberías ver: "Found 1 pending jobs"\n` +
        `4. El job será procesado automáticamente`,
        'success'
      )
    } catch (err) {
      updateResult('insert',
        `❌ ERROR AL INSERTAR JOB\n\n` +
        `Error: ${err.message}\n` +
        `Code: ${err.code}\n\n` +
        `Posibles causas:\n` +
        `- RLS policy no permite insert\n` +
        `- Usuario no autenticado\n` +
        `- Tabla no existe`,
        'error'
      )
    } finally {
      setLoadingState('insert', false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 5: List Jobs
  // ═══════════════════════════════════════════════════════════════
  
  async function testListJobs() {
    setLoadingState('list', true)
    updateResult('list', '⏳ Listando jobs...', 'info')
    
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('No hay usuario autenticado')
      
      const { data, error } = await supabase
        .from('publish_jobs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (error) throw error
      
      updateResult('list',
        `✅ JOBS DEL USUARIO: ${data.length}\n\n` +
        data.map(j => 
          `ID: ${j.id}\n` +
          `Title: ${j.title}\n` +
          `Status: ${j.status}\n` +
          `Platforms: ${j.platforms?.join(', ')}\n` +
          `Created: ${new Date(j.created_at).toLocaleString()}\n` +
          `---`
        ).join('\n\n'),
        'success'
      )
    } catch (err) {
      updateResult('list',
        `❌ ERROR AL LISTAR JOBS\n\nError: ${err.message}`,
        'error'
      )
    } finally {
      setLoadingState('list', false)
    }
  }

  return (
    <div className="connection-test-page">
      <div className="test-container">
        <h1>🔧 Test de Conexiones</h1>
        
        {/* TEST 1 */}
        <div className="test-section">
          <h2>1. Companion App - Health Check</h2>
          <p className="test-desc">
            Verifica si la companion app está corriendo en <code>http://localhost:54322</code>
          </p>
          <button 
            className="test-button"
            onClick={testCompanionHealth}
            disabled={loading.companion}
          >
            {loading.companion ? '⏳ Probando...' : '🏥 Test Health Check'}
          </button>
          {results.companion && (
            <div className={`test-result ${results.companion.type}`}>
              {results.companion.message}
            </div>
          )}
        </div>

        {/* TEST 2 */}
        <div className="test-section">
          <h2>2. Supabase - Autenticación</h2>
          <p className="test-desc">
            Verifica que estés logueado correctamente
          </p>
          <button 
            className="test-button"
            onClick={testSupabaseAuth}
            disabled={loading.auth}
          >
            {loading.auth ? '⏳ Probando...' : '🔐 Test Autenticación'}
          </button>
          {results.auth && (
            <div className={`test-result ${results.auth.type}`}>
              {results.auth.message}
            </div>
          )}
        </div>

        {/* TEST 3 */}
        <div className="test-section">
          <h2>3. Supabase - Tabla publish_jobs</h2>
          <p className="test-desc">
            Verifica que la tabla existe en Supabase
          </p>
          <button 
            className="test-button"
            onClick={testPublishJobsTable}
            disabled={loading.table}
          >
            {loading.table ? '⏳ Probando...' : '📋 Test Tabla publish_jobs'}
          </button>
          {results.table && (
            <div className={`test-result ${results.table.type}`}>
              {results.table.message}
            </div>
          )}
        </div>

        {/* TEST 4 */}
        <div className="test-section">
          <h2>4. Insert Job - Test Completo</h2>
          <p className="test-desc">
            Intenta insertar un job de prueba
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="test-button"
              onClick={testInsertJob}
              disabled={loading.insert}
            >
              {loading.insert ? '⏳ Insertando...' : '➕ Insertar Job de Prueba'}
            </button>
            <button 
              className="test-button"
              onClick={testListJobs}
              disabled={loading.list}
            >
              {loading.list ? '⏳ Cargando...' : '📊 Listar Mis Jobs'}
            </button>
          </div>
          {results.insert && (
            <div className={`test-result ${results.insert.type}`}>
              {results.insert.message}
            </div>
          )}
          {results.list && (
            <div className={`test-result ${results.list.type}`}>
              {results.list.message}
            </div>
          )}
        </div>

        {/* INSTRUCTIONS */}
        <div className="test-section" style={{ background: 'rgba(124, 106, 245, 0.1)' }}>
          <h2>📋 Instrucciones</h2>
          <ol style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>Ejecuta los tests en orden</strong> (1 → 2 → 3 → 4)</li>
            <li><strong>Si alguno falla</strong>, sigue las instrucciones en rojo</li>
            <li><strong>Si el test 4 pasa</strong>, ve a los logs de la companion app</li>
            <li><strong>En 5-10 segundos</strong> deberías ver "Found 1 pending jobs"</li>
            <li><strong>Si la companion no lo recoge</strong>, los userId no coinciden</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
