import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import StudioPage from './pages/StudioPage.jsx'
import RequestsPage from './pages/RequestsPage.jsx'
import PortfolioPage from './pages/PortfolioPage.jsx'
import GuidePage from './pages/GuidePage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import ConnectionsPage from './pages/ConnectionsPage.jsx'
import { applyConfig, getConfig } from './store/appConfig.js'
import { usePageBackground } from './hooks/usePageBackground.js'
import { handleOAuthRedirect } from './utils/gmail.js'
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

export default function App() {
  const [activePage, setActivePage] = useState('studio')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Apply saved config on mount
  useEffect(() => { applyConfig() }, [])

  // Handle Google OAuth redirect on mount
  useEffect(() => {
    // Only run if there's actually an OAuth code in the URL
    if (!window.location.search.includes('code=')) return
    handleOAuthRedirect().then(result => {
      if (result.ok) {
        setActivePage('connections')
      }
    }).catch(() => {
      // OAuth failed silently, stay on current page
    })
  }, [])

  // Reactively apply the correct background to .app-main on page/config change
  usePageBackground(activePage)

  const Page = PAGES[activePage] ?? StudioPage

  return (
    <div className="app-shell">
      <Sidebar
        active={activePage}
        onNavigate={(page) => { setActivePage(page); setSidebarOpen(false) }}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="app-main">
        {/* Mobile hamburger */}
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
