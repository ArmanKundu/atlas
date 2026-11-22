import { createElement, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog as RadixDialog } from 'radix-ui'
import { ArrowLeft, Info, X } from 'lucide-react'
import { CHANGELOG, COMING_SOON, type ChangeItem } from '@shared/changelog'
import { cn } from '@/lib/cn'
import { changeIcon } from './icons'

const SKY =
  'radial-gradient(120% 80% at 50% 0%, #ffffff 0%, transparent 60%), linear-gradient(180deg, #7fb9ee 0%, #b9dbf8 55%, #e8f3fd 100%)'

function Item({ item, soon }: { item: ChangeItem; soon?: boolean }) {
  return (
    <li className="flex gap-3 rounded-xl px-1 py-2.5">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl',
          soon ? 'bg-sunken text-ink-3' : 'bg-blue-soft text-blue',
        )}
      >
        {createElement(changeIcon(item.icon), { className: 'size-4', 'aria-hidden': true })}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-semibold text-ink">
          {item.title}
          {soon ? (
            <span className="rounded-full bg-sunken px-2 py-0.5 text-2xs font-medium text-ink-3">
              coming soon
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-ink-2">{item.body}</span>
      </span>
    </li>
  )
}

/**
 * The "What's new" card: a sky hero with the release's icon, a short summary and one button.
 * "See everything" turns it into a scrollable list of every change and what is coming.
 */
export function WhatsNew({
  open,
  onOpenChange,
  startWithList = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open straight on the full list (the info button). */
  startWithList?: boolean
}) {
  const latest = CHANGELOG[0]
  const [list, setList] = useState(startWithList)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setList(startWithList)
  }
  if (!latest) return null
  const hero = latest.items[0]

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade fixed inset-0 z-40 bg-scrim backdrop-blur-[6px]" />
        <RadixDialog.Content
          className="fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 outline-none"
          aria-describedby={undefined}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="relative overflow-hidden rounded-[22px] bg-surface shadow-dialog"
          >
            <RadixDialog.Close
              aria-label="Close"
              className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-surface/80 text-ink-2 backdrop-blur hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </RadixDialog.Close>

            <AnimatePresence mode="wait" initial={false}>
              {!list ? (
                <motion.div
                  key="card"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div
                    className="relative flex h-56 items-center justify-center overflow-hidden"
                    style={{ background: SKY }}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-3 text-center text-[4.25rem] leading-none font-bold tracking-[-0.04em] text-white/70 blur-[3px] select-none"
                    >
                      What’s new
                    </span>
                    <motion.span
                      initial={{ y: 12, scale: 0.85, rotate: -6 }}
                      animate={{ y: 0, scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.08 }}
                      className="relative flex size-20 items-center justify-center rounded-[26px] bg-surface text-ink shadow-pop"
                    >
                      {createElement(changeIcon(hero?.icon ?? 'sparkles'), {
                        className: 'size-9',
                        'aria-hidden': true,
                      })}
                    </motion.span>
                  </div>
                  <div className="px-6 pt-5 pb-6">
                    <div className="flex items-center gap-2">
                      <RadixDialog.Title className="text-[1.125rem] font-semibold tracking-[-0.01em] text-ink">
                        {latest.headline}
                      </RadixDialog.Title>
                      <span className="rounded-full bg-blue-soft px-2 py-0.5 text-2xs font-medium text-blue">
                        v{latest.version}
                      </span>
                    </div>
                    <p className="mt-2 text-ink-2">{latest.summary}</p>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-accent font-semibold text-accent-fg hover:bg-accent-hover"
                    >
                      Got it
                    </button>
                    <button
                      type="button"
                      onClick={() => setList(true)}
                      className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-ink-2 hover:bg-hover hover:text-ink"
                    >
                      <Info className="size-4" aria-hidden />
                      See everything that’s new
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  className="flex max-h-[78vh] flex-col"
                >
                  <div className="flex items-center gap-2 border-b border-line px-4 py-3 pr-14">
                    {!startWithList ? (
                      <button
                        type="button"
                        aria-label="Back"
                        onClick={() => setList(false)}
                        className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-hover"
                      >
                        <ArrowLeft className="size-4" aria-hidden />
                      </button>
                    ) : null}
                    <RadixDialog.Title className="font-semibold text-ink">
                      What’s new in Atlas
                    </RadixDialog.Title>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {CHANGELOG.map((release) => (
                      <section key={release.version} className="mb-5">
                        <p className="text-2xs font-medium tracking-wide text-ink-3 uppercase">
                          v{release.version} ·{' '}
                          {new Date(release.date).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="mt-1 font-semibold text-ink">{release.headline}</p>
                        <ul className="mt-1">
                          {release.items.map((item) => (
                            <Item key={item.title} item={item} />
                          ))}
                        </ul>
                      </section>
                    ))}
                    <section>
                      <p className="text-2xs font-medium tracking-wide text-ink-3 uppercase">
                        Coming soon
                      </p>
                      <ul className="mt-1">
                        {COMING_SOON.map((item) => (
                          <Item key={item.title} item={item} soon />
                        ))}
                      </ul>
                    </section>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
