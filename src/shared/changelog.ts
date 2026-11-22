/**
 * What changed in each release, newest first. The first entry is shown once in the "What's new"
 * pop-up; the info button in the top bar shows them all, with what is coming next.
 */
export interface ChangeItem {
  /** A lucide icon name the renderer knows (see features/whats-new). */
  icon: string
  title: string
  body: string
}

export interface Release {
  version: string
  date: string
  headline: string
  summary: string
  items: ChangeItem[]
}

export const CHANGELOG: Release[] = [
  {
    version: '0.2.0',
    date: '2026-11-22',
    headline: 'Spaces with friends',
    summary:
      'Make a space for your class or study group, invite friends by name or @username, and share notes, files and flashcards.',
    items: [
      {
        icon: 'users',
        title: 'Spaces',
        body: 'Small communities with a name, icon and banner. Private or public, with viewers, editors and admins.',
      },
      {
        icon: 'key-round',
        title: 'Join codes and invites',
        body: 'Type an 8-character code to join, or accept an invite in your inbox. Owners approve or decline requests.',
      },
      {
        icon: 'mail',
        title: 'Sign in with an email code',
        body: 'No password: Atlas emails you a code. Set it up during onboarding or in Settings.',
      },
      {
        icon: 'upload',
        title: 'Upload and write right there',
        body: 'Drop a file from your computer or write a note in the share window, then edit it any time.',
      },
      {
        icon: 'thumbs-up',
        title: 'Helpful or not',
        body: 'Thumbs up or down on anything shared, and sort by most helpful.',
      },
      {
        icon: 'sparkles',
        title: 'Ask the assistant',
        body: 'The assistant can find things in your spaces and, with your OK, share a note or file for you.',
      },
      {
        icon: 'download',
        title: 'Updates inside Atlas',
        body: 'A bar appears when a new version is out. Atlas copies all your data first, then installs it.',
      },
    ],
  },
]

/** Planned, not built yet. Shown under "Coming soon". */
export const COMING_SOON: ChangeItem[] = [
  {
    icon: 'graduation-cap',
    title: 'Exam crash course',
    body: 'A short, focused plan for the last weeks before an exam, built from your own resources.',
  },
  {
    icon: 'book-open',
    title: 'Ask the study design',
    body: 'Questions answered straight from the study design you imported, with the dot point quoted.',
  },
  {
    icon: 'calendar-days',
    title: 'School portal sync',
    body: 'Bring in timetable, due work and results from your school’s portal.',
  },
]
