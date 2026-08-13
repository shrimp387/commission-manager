/**
 * preload.js — Secure bridge between Electron main process and settings UI
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('companion', {
  // Config
  getConfig:    ()              => ipcRenderer.invoke('get-config'),
  saveConfig:   (config)        => ipcRenderer.invoke('save-config', config),

  // Platform testing
  testPlatform: (platform, credentials) =>
    ipcRenderer.invoke('test-platform', { platform, credentials }),

  // Status
  getStatus:    ()              => ipcRenderer.invoke('get-status'),

  // Auth
  googleLogin:  ()              => ipcRenderer.invoke('google-login'),
  saveSession:  (session)       => ipcRenderer.invoke('save-session', session),
  logout:       ()              => ipcRenderer.invoke('logout'),

  // Logs
  getLogs:      ()              => ipcRenderer.invoke('get-logs'),
})
