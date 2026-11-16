import { Page, PageHeader } from '@/design/Page'
import { EmptyState } from '@/design/States'

/**
 * Shell views for tools that are built in later phases. Each shows its real empty state, so the
 * navigation never leads to a blank screen.
 */
export function ExamBuilder() {
  return (
    <Page>
      <PageHeader
        title="Exam builder"
        description="Build practice papers from your own question bank, in the style of the papers you imported."
      />
      <EmptyState eyebrow="No questions yet" title="A paper needs questions to draw from">
        Import past exams for a subject first. Atlas splits them into questions you can pick by
        topic, marks and difficulty.
      </EmptyState>
    </Page>
  )
}

export function TimerRoute() {
  return (
    <Page>
      <PageHeader
        title="Timer"
        description="Focus sessions and a stopwatch, tagged by subject and topic."
      />
      <EmptyState eyebrow="No sessions yet" title="Your study time will add up here">
        Sessions are tagged with a subject, so add one first. Hours, streaks and the yearly heatmap
        build from every session you finish.
      </EmptyState>
    </Page>
  )
}

export function LibraryRoute() {
  return (
    <Page>
      <PageHeader
        title="Library"
        description="Every resource you have imported, across all subjects, plus installed packs."
      />
      <EmptyState eyebrow="Nothing imported yet" title="Your library is empty">
        Study designs, past exams, solutions, examiner reports, textbooks and class notes all live
        here once imported. Files are copied onto this laptop and never uploaded.
      </EmptyState>
    </Page>
  )
}

export function NotFound() {
  return (
    <Page>
      <EmptyState eyebrow="Not found" title="That page does not exist">
        Use the sidebar or the search to get back on track.
      </EmptyState>
    </Page>
  )
}
