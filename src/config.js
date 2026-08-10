// Configuración de Taskade
export const TASKADE_CONFIG = {
  API_KEY: import.meta.env.VITE_TASKADE_API_KEY,
  BASE_URL: import.meta.env.VITE_TASKADE_BASE_URL || '/proxy',
  WORKSPACE_ID: import.meta.env.VITE_TASKADE_WORKSPACE_ID,
  PROJECT_ID: import.meta.env.VITE_TASKADE_PROJECT_ID,
  PROJECT_NAME: 'Estudio de Comisiones',
}

// IDs de campos personalizados del proyecto
export const FIELD_IDS = {
  PRIORITY: '@Pr1or',
  CLIENT: '@Cl1en',
  STAGE: '@St4ge',
  PROGRESS: '@Pr0gr',
  DEADLINE: '@D3adl',
  NEXT_STEP: '@N3xt',
}

// IDs de secciones (tasks raíz)
export const SECTION_IDS = {
  BACKLOG: '6d74847d-beda-45fb-ac99-63c52212dfec',
  NEW: '02ee79a6-abd7-436f-938b-4386c520e203',
  IN_PROGRESS: 'd02c3d13-e87b-4b43-83b6-7407e689a32e',
  IN_REVIEW: 'b5f9edcb-6fd0-4f89-a15d-9eb710ae37a0',
}

// Opciones de campos
export const PRIORITY_OPTIONS = {
  urgent: { id: 'urgent', name: 'Urgente', color: '#EF4444' },
  waiting: { id: 'waiting', name: 'En espera', color: '#F59E0B' },
  ok: { id: 'ok', name: 'Todo en orden', color: '#22C55E' },
}

export const STAGE_OPTIONS = {
  new: { id: 'new', name: 'Nueva', color: '#60A5FA' },
  sketch: { id: 'sketch', name: 'Sketch/Boceto', color: '#94A3B8' },
  lineart: { id: 'lineart', name: 'Lineart/Línea', color: '#CBD5E1' },
  base: { id: 'base', name: 'Color base', color: '#14B8A6' },
  shade: { id: 'shade', name: 'Sombreado y detalles', color: '#F97316' },
  review: { id: 'review', name: 'En revisión', color: '#FACC15' },
  delivered: { id: 'delivered', name: 'Entregado', color: '#22C55E' },
}
