import { MotionConfig } from 'framer-motion'
import { createHashRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { ToastProvider } from '@/design/Toast'
import { TooltipProvider } from '@/design/Tooltip'
import { AppStateProvider } from '@/lib/app-state'
import { DesignSystem } from '@/routes/DesignSystem'
import { ExamBuilder, LibraryRoute, NotFound, TimerRoute } from '@/routes/Placeholders'
import { Settings } from '@/routes/Settings'
import { Today } from '@/routes/Today'
import { AppShell } from './AppShell'

// Hash routing: the packaged app is served from atlas://app/index.html, with no server to
// rewrite deep links.
const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Today />, handle: { crumb: 'Today' } },
      { path: 'exam-builder', element: <ExamBuilder />, handle: { crumb: 'Exam builder' } },
      { path: 'timer', element: <TimerRoute />, handle: { crumb: 'Timer' } },
      { path: 'library', element: <LibraryRoute />, handle: { crumb: 'Library' } },
      { path: 'settings', element: <Settings />, handle: { crumb: 'Settings' } },
      { path: 'design', element: <DesignSystem />, handle: { crumb: 'Design system' } },
      { path: '*', element: <NotFound />, handle: { crumb: 'Not found' } },
    ],
  },
])

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppStateProvider>
        <TooltipProvider delayDuration={350} skipDelayDuration={200}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </TooltipProvider>
      </AppStateProvider>
    </MotionConfig>
  )
}
