import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import StudioPage from './pages/StudioPage.jsx'
import RequestsPage from './pages/RequestsPage.jsx'
import PublicationsPage from './pages/PublicationsPage.jsx'
import PublishPage from './pages/PublishPage.jsx'
import PortfolioPage from './pages/PortfolioPage.jsx'
import GuidePage from './pages/GuidePage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import ConnectionsPage from './pages/ConnectionsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ArchivedPage from './pages/ArchivedPage.jsx'
import ClientsPage from './pages/ClientsPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import MediaPage from './pages/MediaPage.jsx'
import IntegrationsPage from './pages/IntegrationsPage.jsx'
import StatsPage from './pages/StatsPage.jsx'
import DebugPanel from './components/DebugPanel.jsx'
import DeadlineNotifier from './components/DeadlineNotifier.jsx'
import { applyConfig } from './store/appConfig.js'
import { usePageBackground } from './hooks/usePageBackground.js'
import { handleOAuthRedirect } from './utils/gmail.js'
import { AuthProvider, useAuth } from './lib/AuthContext.jsx'
import { isSupabaseReady } from './lib/supabase.js'
import './styles/global.css'

const ROUTE_TO_PAGE = {
  '/publications': 'publications',
  '/': 'studio',
  '/studio': 'studio',
  '/requests': 'requests',
  '/archived': 'archived',
  '/portfolio': 'portfolio',
  '/guide': 'guide',
  '/settings': 'settings',
  '/connections': 'connections',
  '/clients': 'clients',
  '/calendar': 'calendar',
  '/media': 'media',
  '/integrations': 'integrations',
  '/stats': 'stats',
}

const PAGE_TO_ROUTE = {
  studio: '/studio',
  requests: '/requests',
  archived: '/archived',
  portfolio: '/portfolio',
  guide: '/guide',
  settings: '/settings',
  connections: '/connections',
  clients: '/clients',
  calendar: '/calendar',
  media: '/media',
  integrations: '/integrations',
  stats: '/stats',
  publications: '/publications',
}

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading, isLoggedIn } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const activePage = ROUTE_TO_PAGE[location.pathname] ?? 'studio'

  useEffect(() => { applyConfig() }, [])

  useEffect(() => {
    if (!window.location.search.includes('code=')) return
    if (!sessionStorage.getItem('gmail_oauth_return')) return
    handleOAuthRedirect().then(result => {
      if (result.ok) navigate('/connections')
    }).catch(() => {})
  }, [])

  usePageBackground(activePage)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div className="mini-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    )
  }

  if (isSupabaseReady() && !isLoggedIn) {
    return <LoginPage />
  }

  function handleNavigate(pageId) {
    const route = PAGE_TO_ROUTE[pageId] ?? '/studio'
    navigate(route)
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={activePage}
        onNavigate={handleNavigate}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      <main className="app-main">
        <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">☰</button>
        <Routes>
          <Route path="/"            element={<Navigate to="/studio" replace />} />
          <Route path="/studio"      element={<StudioPage />} />
          <Route path="/requests"    element={<RequestsPage />} />
          <Route path="/archived"    element={<ArchivedPage />} />
          <Route path="/portfolio"   element={<PortfolioPage />} />
          <Route path="/guide"       element={<GuidePage />} />
          <Route path="/settings"    element={<SettingsPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/clients"     element={<ClientsPage />} />
          <Route path="/calendar"    element={<CalendarPage />} />
          <Route path="/media"        element={<MediaPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/stats"        element={<StatsPage />} />
          <Route path="/publications" element={<PublicationsPage />} />
          <Route path="/publish/:taskId" element={<PublishPage />} />
          <Route path="*"            element={<Navigate to="/studio" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppShell />
        <DebugPanel />
        <DeadlineNotifier />
      </HashRouter>
    </AuthProvider>
  )
}
