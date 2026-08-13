import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { getCurrentUserId } from '../lib/db.js'

export default function ConnectionTestModal({ onClose }) {
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState({})

  function updateResult(testId, message, type = 'info') {
    setResults(prev => ({ ...prev, [testId]: { message, type } }))
  }

  function setLoadingState(testId, isLoading) {
    setLoading(prev => ({ ...prev, [testId]: isLoading }))
  }

  // TEST 1: Companion Health
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
        `2. Verifica que esté corriendo (icono en la bandeja)\n` +
        `3. Vuelve a intentar`,
        'error'
      )
    } finally {
      setLoadingState('companion', false)
    }
  }

  // TEST 2: Supabase Auth
  async function testSupabaseAuth() {
    setLoadingState('auth', true)
    updateResult('auth', '⏳ Verificando autenticación...', 'info')
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error) throw error
      
      if (!user) {
        updateResult('auth',
          `⚠️ NO HAY USUARIO AUTENTICADO\n\nSolución: Haz login en la app`,
          'error'
        )
        return
      }
      
      updateResult('auth',
        `✅ USUARIO AUTENTICADO\n\nID: ${user.id}\nEmail: ${user.email}`,
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

  // TEST 3: publish_jobs table
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
            `Solución:\n` +
            `1. Abre Supabase Dashboard\n` +
            `2. SQL Editor\n` +
            `3. Ejecuta: companion-app/sql/publish_jobs.sql`,
            'error'
          )
          return
        }
        throw error
      }
      
      updateResult('table',
        `✅ TABLA publish_jobs EXISTE\n\nTotal registros: ${count ?? 0}`,
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

  // TEST 4: Insert Job
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
      
      console.log('[ConnectionTest] Insertando job:', testJob)
      
      const { data, error } = await supabase
        .from('publish_jobs')
        .insert(testJob)
        .select()
        .single()
      
      if (error) {
        console.error('[ConnectionTest] Error:', error)
        throw error
      }
      
      console.log('[ConnectionTest] Job insertado:', data)
      
      updateResult('insert',
        `✅ JOB INSERTADO\n\n` +
        `ID: ${data.id}\n` +
        `Status: ${data.status}\n` +
        `User: ${data.user_id}\n` +
        `Created: ${data.created_at}\n\n` +
        `🎯 AHORA:\n` +
        `1. Abre logs de companion app\n` +
        `2. En 5-10 segundos verás: "Found 1 pending jobs"\n` +
        `3. Se procesará automáticamente`,
        'success'
      )
    } catch (err) {
      updateResult('insert',
        `❌ ERROR AL INSERTAR\n\n` +
        `Error: ${err.message}\n` +
        `Code: ${err.code}\n\n` +
        `Causas posibles:\n` +
        `- RLS policy bloqueando\n` +
        `- Usuario no autenticado\n` +
        `- Tabla no existe`,
        'error'
      )
    } finally {
      setLoadingState('insert', false)
    }
  }

  // TEST 5: List Jobs
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
        `✅ JOBS: ${data.length}\n\n` +
        data.map(j => 
          `ID: ${j.id.slice(0,8)}...\n` +
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
        `❌ ERROR\n\nError: ${err.message}`,
        'error'
      )
    } finally {
      setLoadingState('list', false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f0f1a',
          borderRadius: '12px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '30px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ color: '#7c6af5', margin: 0 }}>🔧 Test de Conexiones</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* TEST 1 */}
        <div style={{ marginBottom: '20px', background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
          <h3 style={{ color: '#fff', marginBottom: '8px' }}>1. Companion App</h3>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '12px' }}>
            Verifica si está corriendo en localhost:54322
          </p>
          <button
            onClick={testCompanionHealth}
            disabled={loading.companion}
            style={{
              background: '#7c6af5',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: loading.companion ? 'not-allowed' : 'pointer',
              opacity: loading.companion ? 0.6 : 1,
            }}
          >
            {loading.companion ? '⏳ Probando...' : '🏥 Test Health Check'}
          </button>
          {results.companion && (
            <pre style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              background: results.companion.type === 'success' ? 'rgba(81,207,102,0.1)' :
                        results.companion.type === 'error' ? 'rgba(255,107,107,0.1)' :
                        'rgba(124,106,245,0.1)',
              border: `1px solid ${results.companion.type === 'success' ? '#51cf66' :
                                  results.companion.type === 'error' ? '#ff6b6b' : '#7c6af5'}`,
              color: results.companion.type === 'success' ? '#51cf66' :
                    results.companion.type === 'error' ? '#ff6b6b' : '#c9d1d9',
            }}>
              {results.companion.message}
            </pre>
          )}
        </div>

        {/* TEST 2 */}
        <div style={{ marginBottom: '20px', background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
          <h3 style={{ color: '#fff', marginBottom: '8px' }}>2. Supabase Auth</h3>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '12px' }}>
            Verifica autenticación
          </p>
          <button
            onClick={testSupabaseAuth}
            disabled={loading.auth}
            style={{
              background: '#7c6af5',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: loading.auth ? 'not-allowed' : 'pointer',
              opacity: loading.auth ? 0.6 : 1,
            }}
          >
            {loading.auth ? '⏳ Probando...' : '🔐 Test Autenticación'}
          </button>
          {results.auth && (
            <pre style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              background: results.auth.type === 'success' ? 'rgba(81,207,102,0.1)' : 'rgba(255,107,107,0.1)',
              border: `1px solid ${results.auth.type === 'success' ? '#51cf66' : '#ff6b6b'}`,
              color: results.auth.type === 'success' ? '#51cf66' : '#ff6b6b',
            }}>
              {results.auth.message}
            </pre>
          )}
        </div>

        {/* TEST 3 */}
        <div style={{ marginBottom: '20px', background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
          <h3 style={{ color: '#fff', marginBottom: '8px' }}>3. Tabla publish_jobs</h3>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '12px' }}>
            Verifica que existe en Supabase
          </p>
          <button
            onClick={testPublishJobsTable}
            disabled={loading.table}
            style={{
              background: '#7c6af5',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: loading.table ? 'not-allowed' : 'pointer',
              opacity: loading.table ? 0.6 : 1,
            }}
          >
            {loading.table ? '⏳ Probando...' : '📋 Test Tabla'}
          </button>
          {results.table && (
            <pre style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              background: results.table.type === 'success' ? 'rgba(81,207,102,0.1)' : 'rgba(255,107,107,0.1)',
              border: `1px solid ${results.table.type === 'success' ? '#51cf66' : '#ff6b6b'}`,
              color: results.table.type === 'success' ? '#51cf66' : '#ff6b6b',
            }}>
              {results.table.message}
            </pre>
          )}
        </div>

        {/* TEST 4 */}
        <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
          <h3 style={{ color: '#fff', marginBottom: '8px' }}>4. Insert & List Jobs</h3>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '12px' }}>
            Inserta un job de prueba y lista tus jobs
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={testInsertJob}
              disabled={loading.insert}
              style={{
                background: '#7c6af5',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: loading.insert ? 'not-allowed' : 'pointer',
                opacity: loading.insert ? 0.6 : 1,
              }}
            >
              {loading.insert ? '⏳ Insertando...' : '➕ Insertar Job'}
            </button>
            <button
              onClick={testListJobs}
              disabled={loading.list}
              style={{
                background: '#38bdf8',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: loading.list ? 'not-allowed' : 'pointer',
                opacity: loading.list ? 0.6 : 1,
              }}
            >
              {loading.list ? '⏳ Cargando...' : '📊 Listar Jobs'}
            </button>
          </div>
          {results.insert && (
            <pre style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              background: results.insert.type === 'success' ? 'rgba(81,207,102,0.1)' : 'rgba(255,107,107,0.1)',
              border: `1px solid ${results.insert.type === 'success' ? '#51cf66' : '#ff6b6b'}`,
              color: results.insert.type === 'success' ? '#51cf66' : '#ff6b6b',
            }}>
              {results.insert.message}
            </pre>
          )}
          {results.list && (
            <pre style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              background: 'rgba(81,207,102,0.1)',
              border: '1px solid #51cf66',
              color: '#51cf66',
            }}>
              {results.list.message}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
