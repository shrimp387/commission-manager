'use strict'

const logsEl = document.getElementById('logs')
const lastUpdateEl = document.getElementById('last-update')
const refreshBtn = document.getElementById('refresh-btn')

async function refreshLogs() {
  refreshBtn.disabled = true
  try {
    const logs = await window.companion.getLogs()
    logsEl.innerHTML = ''
    
    if (!logs || logs.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'empty-state'
      empty.textContent = 'No hay logs todavía...'
      logsEl.appendChild(empty)
      lastUpdateEl.textContent = new Date().toLocaleTimeString()
      return
    }
    
    logs.forEach(line => {
      const div = document.createElement('div')
      div.className = 'log-line'
      
      // Detect log level from the line content
      if (line.includes('ERR:') || line.includes('error') || line.includes('Error')) {
        div.classList.add('err')
      } else if (line.includes('WARN:') || line.includes('warn')) {
        div.classList.add('warn')
      } else {
        div.classList.add('log')
      }
      
      div.textContent = line
      logsEl.appendChild(div)
    })
    
    // Auto-scroll to bottom
    logsEl.scrollTop = logsEl.scrollHeight
    lastUpdateEl.textContent = new Date().toLocaleTimeString()
  } catch (err) {
    logsEl.innerHTML = ''
    const errorDiv = document.createElement('div')
    errorDiv.className = 'log-line err'
    errorDiv.textContent = `Error cargando logs: ${err.message}`
    logsEl.appendChild(errorDiv)
  } finally {
    refreshBtn.disabled = false
  }
}

// Manual refresh
refreshBtn.addEventListener('click', refreshLogs)

// Initial load
refreshLogs()

// Auto-refresh every 3 seconds
setInterval(refreshLogs, 3000)
