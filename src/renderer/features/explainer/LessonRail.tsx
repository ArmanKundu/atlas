import katex from 'katex'
import { Loader2 } from 'lucide-react'
import type { Lesson } from '@shared/lesson'
import { cn } from '@/lib/cn'

const tex = (source: string): string => {
  try {
    return katex.renderToString(source, { throwOnError: false, displayMode: false })
  } catch {
    return source
  }
}

const heading = 'mb-2 text-2xs font-medium tracking-wide text-ink-3 uppercase'

/**
 * Beside the player: the chapters of a walkthrough (jump to any part), the key results so far,
 * and the transcript, which follows the narration.
 */
export function LessonRail({
  lesson,
  scene,
  streaming,
  onJump,
  footer,
}: {
  lesson: Lesson | null
  scene: number
  streaming: boolean
  /** Jump to a scene; left out while the lesson is still being written. */
  onJump?: (scene: number) => void
  footer?: React.ReactNode
}) {
  const scenes = lesson?.scenes ?? []
  const chapters = scenes.flatMap((s, i) => (s.chapter ? [{ name: s.chapter, at: i }] : []))
  const current = chapters.reduce((c, ch, i) => (ch.at <= scene ? i : c), -1)
  const keys = scenes.flatMap((s, i) => (s.key && i <= scene ? [{ tex: s.key, at: i }] : []))

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 xl:w-[340px]">
      {chapters.length > 1 ? (
        <section>
          <h2 className={heading}>Chapters</h2>
          <ol className="flex flex-col gap-1.5">
            {chapters.map((ch, i) => (
              <li key={ch.at}>
                <button
                  type="button"
                  disabled={!onJump}
                  onClick={() => onJump?.(ch.at)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    i === current
                      ? 'bg-surface shadow-pop ring-2 ring-ink'
                      : 'text-ink-2 ring-1 ring-line enabled:hover:bg-hover',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full text-2xs font-semibold tabular-nums',
                      i === current ? 'bg-accent text-accent-fg' : 'bg-sunken text-ink-3',
                    )}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{ch.name}</span>
                    {scenes[ch.at]?.title ? (
                      <span className="block truncate text-2xs text-ink-3">
                        {scenes[ch.at]?.title}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {keys.length ? (
        <section>
          <h2 className={heading}>Key results</h2>
          <ul className="flex flex-col gap-1.5 rounded-xl bg-surface p-3 shadow-pop ring-1 ring-line">
            {keys.map((k) => (
              <li
                key={k.at}
                className="overflow-x-auto px-1 py-0.5 text-ink"
                dangerouslySetInnerHTML={{ __html: tex(k.tex) }}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className={heading}>Transcript</h2>
        <ol className="flex flex-col gap-1">
          {scenes.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!onJump}
                onClick={() => onJump?.(i)}
                className={cn(
                  'w-full rounded-lg px-3 py-2 text-left leading-5 transition-colors',
                  i === scene
                    ? 'bg-surface text-ink shadow-pop ring-1 ring-line'
                    : 'text-ink-2 enabled:hover:bg-hover',
                )}
              >
                {s.say}
              </button>
            </li>
          ))}
          {streaming ? (
            <li className="flex items-center gap-2 px-3 py-2 text-ink-3">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Writing more…
            </li>
          ) : null}
        </ol>
      </section>
      {footer}
    </aside>
  )
}
