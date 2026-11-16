import { Page, PageHeader } from '@/design/Page'
import { EmptyState } from '@/design/States'
import { ChatView } from '@/features/chat/ChatView'
import { FlashcardsView } from '@/features/flashcards/FlashcardsView'
import { LibraryView } from '@/features/library/LibraryView'
import { NotesView } from '@/features/notes/NotesView'

export function AssistantRoute() {
  return <ChatView />
}

export function LibraryRoute() {
  return (
    <Page>
      <PageHeader
        title="Library"
        description="Every resource you have imported, across all subjects. Open one to read and search it."
      />
      <LibraryView />
    </Page>
  )
}

export function NotesRoute() {
  return <NotesView />
}

export function FlashcardsRoute() {
  return (
    <Page>
      <PageHeader title="Flashcards" description="Spaced repetition across all your subjects." />
      <FlashcardsView />
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
