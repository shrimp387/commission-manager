/**
 * taskade.js — STUB vacío.
 *
 * La app originalmente usaba Taskade como backend de tareas.
 * Ahora todas las tareas se guardan en Supabase directamente.
 * Este archivo exporta stubs que fallan silenciosamente para no romper
 * código existente que todavía importe estas funciones.
 */

const noop = async () => { throw new Error('Taskade removed — use Supabase') }

export const fetchTasks     = noop
export const fetchFields    = noop
export const fetchBlocks    = noop
export const completeTask   = noop
export const uncompleteTask = noop
export const createTask     = noop
export const updateTask     = noop
export const deleteTask     = noop
