import { Clapperboard, FileText, Layers, Link2, NotebookPen } from 'lucide-react'
import type { SharedKind } from '@shared/community'
import { cn } from '@/lib/cn'

const ICONS = {
  note: NotebookPen,
  file: FileText,
  deck: Layers,
  link: Link2,
  lesson: Clapperboard,
} as const
const TONES: Record<SharedKind, string> = {
  note: 'bg-blue-soft text-blue',
  file: 'bg-danger-soft text-danger',
  deck: 'bg-success-soft text-success',
  link: 'bg-warn-soft text-warn',
  lesson: 'bg-accent text-accent-fg',
}

export function KindIcon({ kind, className }: { kind: SharedKind; className?: string }) {
  const Icon = ICONS[kind]
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg',
        TONES[kind],
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  )
}
