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
import { Exam } from '@/routes/Exam'
import { Explain } from '@/routes/Explain'
import { Recorder } from '@/features/explainer/Recorder'
import { ExamBuilder } from '@/routes/ExamBuilder'
import { PaperWorkspace } from '@/routes/PaperWorkspace'
import { Planner } from '@/routes/Planner'
import { Questions } from '@/routes/Questions'
import { PrintExam } from '@/routes/PrintExam'
import { Settings } from '@/routes/Settings'
import { Sit } from '@/routes/Sit'
import { SubjectRoute } from '@/routes/Subject'
import { TimerRoute } from '@/routes/Timer'
import { Today } from '@/routes/Today'
import { Shared } from '@/routes/Shared'
import { AssistantRoute, FlashcardsRoute, LibraryRoute, NotesRoute, NotFound } from '@/routes/Tools'
import { Viewer } from '@/routes/Viewer'
import { AppShell } from './AppShell'

// Hash routing: the packaged app is served from atlas://app/index.html, with no server to
// rewrite deep links.
const router = createHashRouter([
  // Print layouts render without the app frame; the main process turns them into PDFs.
  { path: '/print/exam/:examId', element: <PrintExam /> },
  // Sitting an exam takes the whole window: no sidebar, nothing to wander off to.
  { path: '/sit/:paperId', element: <Sit /> },
  // A paper takes the whole window too: three panes need the width.
  { path: '/paper/:paperId', element: <PaperWorkspace /> },
  // A hidden window draws a lesson frame by frame to make its video.
  { path: '/record/:lessonId', element: <Recorder /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Today />, handle: { crumb: 'Today' } },
      { path: 'subjects/:subjectId', element: <SubjectRoute />, handle: { crumb: 'Subject' } },
      { path: 'assistant', element: <AssistantRoute />, handle: { crumb: 'Assistant' } },
      { path: 'explain', element: <Explain />, handle: { crumb: 'Explainer' } },
      { path: 'library', element: <LibraryRoute />, handle: { crumb: 'Library' } },
      { path: 'shared', element: <Shared />, handle: { crumb: 'Shared library' } },
      { path: 'viewer/:sourceId', element: <Viewer />, handle: { crumb: 'Library' } },
      { path: 'notes', element: <NotesRoute />, handle: { crumb: 'Notes' } },
      { path: 'exam', element: <Exam />, handle: { crumb: 'Exam' } },
      { path: 'questions', element: <Questions />, handle: { crumb: 'Questions' } },
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
