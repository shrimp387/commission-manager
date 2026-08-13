import React, { useState, useEffect, useRef } from 'react'

/**
 * DebugConsole — Panel de logs en tiempo real para debugging de la web app.
 * 
 * Intercepta console.log, console.error, console.warn y los muestra en una UI.
 * Útil para diagnosticar problemas de conexión con Supabase y la companion app.
 */
export default function DebugConsole() {
  const [logs, setLogs] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const logsEndRef = useRef(null)

  useEffect(() => {
    // Interceptar console methods
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn

    function addLog(level, args) {
      const timestamp = new Date().toLocaleTimeString()
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      
      setLogs(prev => [...prev.slice(-199), { timestamp, level, message }])
    }

    console.log = (...args) => {
      originalLog(...args)
      addLog('log', args)
    }

    console.error = (...args) => {
      originalError(...args)
      addLog('error', args)
    }

    console.warn = (...args) => {
      originalWarn(...args)
      addLog('warn', args)
    }

    // Initial log
    console.log('[DebugConsole] Activado — todos los logs se mostrarán aquí')

    return () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  useEffect(() => {
    // Auto-scroll to bottom
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isOpen])

  function clearLogs() {
    setLogs([])
    console.log('[DebugConsole] Logs limpiados')
  }

  function downloadLogs() {
    const content = logs.map(l => `[${l.timestamp}] ${l.level.toUpperCase()}: ${l.message}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `debug-logs-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: '#7c6af5',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          width: '56px',
          height: '56px',
          fontSize: '1.5rem',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(124, 106, 245, 0.4)',
          zIndex: 9999,
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title="Abrir consola de debug"
      >
        🐛
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      width: '600px',
      height: '400px',
      background: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: '8px 0 0 0',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 9999,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🐛</span>
          <span style={{ color: '#c9d1d9', fontWeight: 600 }}>Debug Console</span>
          <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>({logs.length} logs)</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={clearLogs}
            style={{
              background: '#21262d',
              color: '#c9d1d9',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
            title="Limpiar logs"
          >
            🗑️ Limpiar
          </button>
          <button
            onClick={downloadLogs}
            style={{
              background: '#21262d',
              color: '#c9d1d9',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
            title="Descargar logs"
          >
            💾 Descargar
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'transparent',
              color: '#8b949e',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '0 4px',
            }}
            title="Minimizar"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Logs container */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px',
        fontFamily: "'Courier New', monospace",
        fontSize: '0.8rem',
      }}>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8b949e', padding: '40px' }}>
            No hay logs todavía...
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              style={{
                marginBottom: '4px',
                padding: '4px 8px',
                borderRadius: '4px',
                background: log.level === 'error' ? 'rgba(248, 81, 73, 0.1)' :
                           log.level === 'warn' ? 'rgba(210, 153, 34, 0.1)' :
                           'transparent',
                color: log.level === 'error' ? '#ff6b6b' :
                       log.level === 'warn' ? '#ffd43b' :
                       '#51cf66',
                wordBreak: 'break-all',
              }}
            >
              <span style={{ color: '#8b949e', marginRight: '8px' }}>[{log.timestamp}]</span>
              <span style={{ 
                color: log.level === 'error' ? '#ff6b6b' :
                       log.level === 'warn' ? '#ffd43b' :
                       '#51cf66',
                fontWeight: 600,
                marginRight: '8px',
              }}>
                {log.level.toUpperCase()}:
              </span>
              <span style={{ color: '#c9d1d9' }}>{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}
