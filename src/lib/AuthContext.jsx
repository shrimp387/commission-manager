/**
 * AuthContext — provides current user and session to the whole app.
 * Wraps Supabase auth. Falls back gracefully when offline.
 */
import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase, isSupabaseReady } from './supabase.js'
import { onAuthStateChange } from './auth.js'
import { setCurrentUserId, getAllTasks } from './db.js'
import { initTaskFields } from '../store/taskStore.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseReady()) {
      // No Supabase — run as single local user
      setLoading(false)
      return
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setCurrentUserId(session.user.id)
        // Seed taskStore cache from Supabase on login
        getAllTasks().then(tasks => {
          Object.entries(tasks).forEach(([id, fields]) => {
            initTaskFields(id, fields)
          })
        })
      }
      setLoading(false)
    })

    // Listen for auth changes
    const unsub = onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setCurrentUserId(session.user.id)
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
    isAdmin: true, // TODO: role-based auth in phase 2
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
