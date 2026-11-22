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
    version: '0.3.0',
    date: '2026-11-23',
    headline: 'A whiteboard tutor, a built-in AI and a phone scanner',
    summary:
      'Watch explanations drawn and read aloud, use a free AI that runs on your laptop, and scan worksheets straight from your phone.',
    items: [
      {
        icon: 'presentation',
        title: 'Whiteboard explainer',
        body: 'Ask the Whiteboard helper and it draws the idea step by step with a pen while a natural voice reads it aloud. Save it as an image or video, keep it in your library or share it to a space.',
      },
      {
        icon: 'cpu',
        title: 'Atlas built-in AI',
        body: 'Download a small open model once (1 or 2.3 GB) in Settings, AI. It is free, unlimited and works offline, and can make notes, flashcards and exams from your resources.',
      },
      {
        icon: 'scan-line',
        title: 'Scan with your phone',
        body: 'In Library, press Scan with phone and point your camera at the code. Pages arrive as a PDF in the subject you chose, over your own Wi-Fi. Then press Check my work.',
      },
      {
        icon: 'sparkles',
        title: 'Auto helper',
        body: 'The Assistant now picks the right helper for each question. You can still choose one yourself from the searchable list.',
      },
      {
        icon: 'life-buoy',
        title: 'Report a bug',
        body: 'The help button in the top bar sends a bug report or idea with a screenshot or a short screen recording.',
      },
    ],
  },
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
