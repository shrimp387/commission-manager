/**
 * Auth layer — wraps Supabase auth with Google OAuth.
 * Falls back gracefully when Supabase is not configured.
 */
import { supabase } from './supabase.js'

// ── Sign in with Google ────────────────────────────────────────────────────
export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      scopes: 'email profile',
    },
  })
  if (error) throw error
  return data
}

// ── Sign out ───────────────────────────────────────────────────────────────
export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// ── Get current session ────────────────────────────────────────────────────
export async function getSession() {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// ── Get current user ───────────────────────────────────────────────────────
export async function getCurrentUser() {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ── Subscribe to auth state changes ───────────────────────────────────────
export function onAuthStateChange(callback) {
  if (!supabase) return () => {}
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  return () => subscription.unsubscribe()
}
