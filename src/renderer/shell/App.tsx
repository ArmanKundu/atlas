import { MotionConfig } from 'framer-motion'
import { createHashRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { ToastProvider } from '@/design/Toast'
import { TooltipProvider } from '@/design/Tooltip'
import { Onboarding } from '@/features/session/Onboarding'
import { ProfileGate } from '@/features/session/ProfileGate'
import { TimerProvider } from '@/features/timer/TimerProvider'
import { AppStateProvider, useAppState } from '@/lib/app-state'
import { DesignSystem } from '@/routes/DesignSystem'
import { ExamBuilder } from '@/routes/ExamBuilder'
import { Planner } from '@/routes/Planner'
import { PrintExam } from '@/routes/PrintExam'
import { Settings } from '@/routes/Settings'
import { SubjectRoute } from '@/routes/Subject'
import { TimerRoute } from '@/routes/Timer'
import { Today } from '@/routes/Today'
import { AssistantRoute, FlashcardsRoute, LibraryRoute, NotesRoute, NotFound } from '@/routes/Tools'
import { Viewer } from '@/routes/Viewer'
import { AppShell } from './AppShell'

// Hash routing: the packaged app is served from atlas://app/index.html, with no server to
// rewrite deep links.
const router = createHashRouter([
  // Print layouts render without the app frame; the main process turns them into PDFs.
  { path: '/print/exam/:examId', element: <PrintExam /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Today />, handle: { crumb: 'Today' } },
      { path: 'subjects/:subjectId', element: <SubjectRoute />, handle: { crumb: 'Subject' } },
      { path: 'assistant', element: <AssistantRoute />, handle: { crumb: 'Assistant' } },
      { path: 'library', element: <LibraryRoute />, handle: { crumb: 'Library' } },
      { path: 'viewer/:sourceId', element: <Viewer />, handle: { crumb: 'Library' } },
      { path: 'notes', element: <NotesRoute />, handle: { crumb: 'Notes' } },
      { path: 'flashcards', element: <FlashcardsRoute />, handle: { crumb: 'Flashcards' } },
      { path: 'planner', element: <Planner />, handle: { crumb: 'Planner' } },
      { path: 'timer', element: <TimerRoute />, handle: { crumb: 'Timer' } },
      { path: 'exam-builder', element: <ExamBuilder />, handle: { crumb: 'Exam builder' } },
      { path: 'settings', element: <Settings />, handle: { crumb: 'Settings' } },
      { path: 'design', element: <DesignSystem />, handle: { crumb: 'Design system' } },
      { path: '*', element: <NotFound />, handle: { crumb: 'Not found' } },
    ],
  },
])

/** Chooses what to show: the profile picker, first-run setup, or the app itself. */
function Session() {
  const { meta } = useAppState()
  if (!meta) return <ProfileGate />
  if (!meta.onboardingDone) return <Onboarding />
  return (
    <TimerProvider>
      <RouterProvider router={router} />
    </TimerProvider>
  )
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppStateProvider>
        <TooltipProvider delayDuration={350} skipDelayDuration={200}>
          <ToastProvider>
            <Session />
          </ToastProvider>
        </TooltipProvider>
      </AppStateProvider>
    </MotionConfig>
  )
}
