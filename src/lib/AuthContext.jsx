/**
 * AuthContext — provides current user and session to the whole app.
 * Wraps Supabase auth. Falls back gracefully when offline.
 */
import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase, isSupabaseReady } from './supabase.js'
import { onAuthStateChange } from './auth.js'
import { setCurrentUserId, getAllTasks, getProfile, getPortfolio, getGuide, getKanbanConfig } from './db.js'
import { initTaskFields } from '../store/taskStore.js'

const AuthContext = createContext(null)

async function seedLocalStoreFromSupabase(userId) {
  setCurrentUserId(userId)

  // Load tasks into in-memory store
  try {
    const tasks = await getAllTasks()
    Object.entries(tasks).forEach(([id, fields]) => {
      initTaskFields(id, fields)
    })
  } catch (e) { console.warn('[auth] task seed failed', e) }

  // Load profile into localStorage (app_config)
  try {
    const profile = await getProfile()
    if (profile) {
      const existing = JSON.parse(localStorage.getItem('app_config') || '{}')
      localStorage.setItem('app_config', JSON.stringify({ ...existing, ...{
        projectName: profile.project_name,
        projectSubtitle: profile.project_subtitle,
        projectIcon: profile.project_icon,
        projectBannerUrl: profile.project_banner_url,
        accentColor: profile.accent_color,
        fontFamily: profile.font_family,
        fontSize: profile.font_size,
        globalBgUrl: profile.global_bg_url,
        globalBgOpacity: profile.global_bg_opacity,
        sidebarWidth: profile.sidebar_width,
        sectionBgs: profile.section_bgs ?? {},
        sectionIcons: profile.section_icons ?? {},
        telegramStickerSets: profile.telegram_sticker_sets ?? [],
      }}))
    }
  } catch (e) { console.warn('[auth] profile seed failed', e) }

  // Load kanban config
  try {
    const kanban = await getKanbanConfig()
    if (kanban.customSections?.length) localStorage.setItem('kanban_custom_sections', JSON.stringify(kanban.customSections))
    if (Object.keys(kanban.orderOverrides || {}).length) localStorage.setItem('kanban_order', JSON.stringify(kanban.orderOverrides))
    if (Object.keys(kanban.colorOverrides || {}).length) localStorage.setItem('kanban_colors', JSON.stringify(kanban.colorOverrides))
    if (Object.keys(kanban.labelOverrides || {}).length) localStorage.setItem('kanban_labels', JSON.stringify(kanban.labelOverrides))
  } catch (e) { console.warn('[auth] kanban seed failed', e) }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseReady()) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        seedLocalStoreFromSupabase(session.user.id)
      }
      setLoading(false)
    })

    const unsub = onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        seedLocalStoreFromSupabase(session.user.id)
      } else {
        setCurrentUserId(null)
      }
    })

    return unsub
  }, [])

  const value = {
    user,
    session,
    loading,
    isLoggedIn: !!user,
    isAdmin: true,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
