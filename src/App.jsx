import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import StudioPage from './pages/StudioPage.jsx'
import RequestsPage from './pages/RequestsPage.jsx'
import PortfolioPage from './pages/PortfolioPage.jsx'
import GuidePage from './pages/GuidePage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import ConnectionsPage from './pages/ConnectionsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { applyConfig, getConfig } from './store/appConfig.js'
import { usePageBackground } from './hooks/usePageBackground.js'
import { handleOAuthRedirect } from './utils/gmail.js'
import { AuthProvider, useAuth } from './lib/AuthContext.jsx'
import { isSupabaseReady } from './lib/supabase.js'
import './styles/global.css'

import ArchivedPage from './pages/ArchivedPage.jsx'

const PAGES = {
  studio: StudioPage,
  requests: RequestsPage,
  archived: ArchivedPage,
  portfolio: PortfolioPage,
  guide: GuidePage,
  settings: SettingsPage,
  connections: ConnectionsPage,
}

function AppShell() {
  const [activePage, setActivePage] = useState('studio')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, loading, isLoggedIn } = useAuth()

  // Apply saved config on mount
  useEffect(() => { applyConfig() }, [])

  // Handle Google OAuth redirect on mount (Gmail OAuth only)
  // Only intercept the code if we explicitly started a Gmail OAuth flow
  // (signaled by the 'gmail_oauth_return' key in sessionStorage).
  // Supabase login callbacks must NOT be intercepted here — Supabase handles
  // them internally via its own listener in AuthContext.
  useEffect(() => {
    if (!window.location.search.includes('code=')) return
    if (!sessionStorage.getItem('gmail_oauth_return')) return  // not a Gmail flow
    handleOAuthRedirect().then(result => {
      if (result.ok) setActivePage('connections')
    }).catch(() => {})
  }, [])

  usePageBackground(activePage)

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div className="mini-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    )
  }

  // Show login page if Supabase is ready but user is not logged in
  if (isSupabaseReady() && !isLoggedIn) {
    return <LoginPage />
  }

  const Page = PAGES[activePage] ?? StudioPage

  return (
    <div className="app-shell">
      <Sidebar
        active={activePage}
        onNavigate={(page) => { setActivePage(page); setSidebarOpen(false) }}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="app-main">
        <button
          className="hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <Page />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
