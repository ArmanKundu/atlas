export const APP_NAME = 'Atlas'
export const APP_TAGLINE = 'Everything you study, organised, on your laptop'

/** Custom scheme the packaged renderer is served from (see DECISIONS.md D-005). */
export const APP_SCHEME = 'atlas'
export const APP_HOST = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

export const WINDOW_DEFAULT = { width: 1280, height: 800 } as const
export const WINDOW_MIN = { width: 960, height: 600 } as const

/** Height of the top bar; also the draggable title area on macOS and Windows. */
export const TOPBAR_HEIGHT = 48

/**
 * The shared library's Supabase project. The publishable key is meant to ship inside apps:
 * row level security and the invite code decide who can read or write (supabase/library.sql).
 * Empty until the project exists; `ATLAS_LIBRARY_URL` / `ATLAS_LIBRARY_KEY` override both.
 */
export const LIBRARY_URL = ''
export const LIBRARY_KEY = ''
