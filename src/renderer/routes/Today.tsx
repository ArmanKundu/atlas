import { Page, PageHeader } from '@/design/Page'
import { EmptyState } from '@/design/States'
import { greetingFor } from '@/lib/greeting'
import { Mascot } from '@/mascot/Mascot'

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/**
 * Today: the home dashboard. Study-next, upcoming, progress and "continue" arrive with the
 * features that feed them; until there is a subject, this is the welcome state.
 */
export function Today() {
  const now = new Date()

  return (
    <Page>
      <PageHeader eyebrow={DATE_FORMAT.format(now)} title={greetingFor(now.getHours())} />
      <EmptyState
        art={<Mascot size={112} label="The Atlas mascot" />}
        eyebrow="Start here"
        title="Everything you study, organised, on your laptop"
      >
        Add a subject and import your own resources. Atlas sorts them into a searchable study
        workspace and tells you what to do next. Nothing leaves this computer.
      </EmptyState>
    </Page>
  )
}
