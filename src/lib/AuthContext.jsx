/**
 * AuthContext — provides current user and session to the whole app.
 * Wraps Supabase auth. Falls back gracefully when offline.
 */
import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase, isSupabaseReady } from './supabase.js'
import { onAuthStateChange } from './auth.js'
import { setCurrentUserId, getAllTasks, getProfile, getPortfolio, getGuide, getKanbanConfig } from './db.js'
import { initTaskFields, seedTaskFields, clearTaskStoreCache } from '../store/taskStore.js'
import { reloadConfigFromStorage } from '../store/appConfig.js'

const AuthContext = createContext(null)

// Keys that must be cleared when switching users
const USER_SCOPED_LS_KEYS = [
  'app_config',
  'task_fields',
  'local_tasks',
  'commission_requests',
  'portfolio_items',
  'studio_guide',
  'kanban_custom_sections',
  'kanban_order',
  'kanban_colors',
  'kanban_labels',
  'page_backgrounds',
  'stickers',
  'archived_commissions',
]

function clearUserScopedStorage() {
  USER_SCOPED_LS_KEYS.forEach(key => localStorage.removeItem(key))
}

async function seedLocalStoreFromSupabase(userId) {
  // If a different user was previously logged in, wipe their local data first
  const prevUserId = localStorage.getItem('_current_user_id')
  if (prevUserId && prevUserId !== userId) {
    // Save previous user's local_tasks under their own key before wiping
    const prevTasks = localStorage.getItem('local_tasks')
    if (prevTasks) localStorage.setItem(`local_tasks_${prevUserId}`, prevTasks)
    const prevFields = localStorage.getItem('task_fields')
    if (prevFields) localStorage.setItem(`task_fields_${prevUserId}`, prevFields)
    clearUserScopedStorage()
    clearTaskStoreCache()
  }
  localStorage.setItem('_current_user_id', userId)
  setCurrentUserId(userId)

  // Restore this user's local_tasks from their user-scoped backup (if exists)
  const userLocalTasks = localStorage.getItem(`local_tasks_${userId}`)
  if (userLocalTasks && !localStorage.getItem('local_tasks')) {
    localStorage.setItem('local_tasks', userLocalTasks)
  }

  // Restore this user's task_fields from their user-scoped backup (if exists)
  const userTaskFields = localStorage.getItem(`task_fields_${userId}`)
  if (userTaskFields && !localStorage.getItem('task_fields')) {
    localStorage.setItem('task_fields', userTaskFields)
  }

  // Reload the in-memory task store cache from localStorage first (fast, local data)
  // This ensures attachments and other large fields that may not fit in Supabase are restored
  try {
    const lsFields = JSON.parse(localStorage.getItem('task_fields') || '{}')
    Object.entries(lsFields).forEach(([id, fields]) => {
      seedTaskFields(id, fields)
    })
  } catch (e) { console.warn('[auth] localStorage task restore failed', e) }

  // Then load tasks into in-memory store from Supabase (merges, Supabase wins for non-attachment fields)
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

  // Reload the in-memory appConfig singleton from the freshly-seeded localStorage
  reloadConfigFromStorage()
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
        // User signed out — save their data under user-scoped keys before clearing
        const uid = localStorage.getItem('_current_user_id')
        if (uid) {
          const tasks = localStorage.getItem('local_tasks')
          if (tasks) localStorage.setItem(`local_tasks_${uid}`, tasks)
          const fields = localStorage.getItem('task_fields')
          if (fields) localStorage.setItem(`task_fields_${uid}`, fields)
        }
        clearUserScopedStorage()
        clearTaskStoreCache()
        localStorage.removeItem('_current_user_id')
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
