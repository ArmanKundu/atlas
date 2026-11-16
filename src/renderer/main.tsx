import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/jetbrains-mono'
import './styles/index.css'
import { App } from './shell/App'

// In development the UI can also run in a plain browser tab; give it a stand-in bridge there.
if (import.meta.env.DEV && (window as Partial<Window>).atlas === undefined) {
  const { createDevBridge } = await import('./lib/dev-bridge')
  window.atlas = createDevBridge()
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
