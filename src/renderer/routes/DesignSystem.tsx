import { useState } from 'react'
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Code,
  Italic,
  Lightbulb,
  Link as LinkIcon,
  List,
  Maximize2,
  MessageSquarePlus,
  Minus,
  Pencil,
  Plus,
  Reply,
  Underline,
  Wand2,
  X,
} from 'lucide-react'
import { Button, IconButton } from '@/design/Button'
import { Kbd } from '@/design/Kbd'
import { Card, Page, PageHeader, Section } from '@/design/Page'
import { PillBar, PillButton, PillDivider } from '@/design/Pill'
import { Segmented } from '@/design/Segmented'
import { EmptyState, ErrorState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import { BoardCard } from '@/features/whiteboard/BoardCard'
import { SAMPLE_BOARD } from '@/features/whiteboard/sample'
import { closeBoard, useOpenBoard } from '@/features/whiteboard/store'
import { WhiteboardPanel } from '@/features/whiteboard/WhiteboardPanel'
import { Mascot } from '@/mascot/Mascot'
import {
  MASCOT_ACCESSORIES,
  MASCOT_COLOURS,
  MASCOT_COLOUR_IDS,
  MASCOT_MOODS,
  type MascotAccessory,
  type MascotColour,
  type MascotMood,
} from '@/mascot/options'

const SURFACES = ['canvas', 'surface', 'sunken', 'paper', 'accent'] as const
const INKS = ['ink', 'ink-2', 'ink-3'] as const
const SUBJECTS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-12 rounded-md ring-1 ring-line ring-inset" style={{ background: value }} />
      <span className="font-mono text-2xs text-ink-3">{name}</span>
    </div>
  )
}

/** Living reference for the design system: tokens, type, controls, states and the mascot. */
export function DesignSystem() {
  const toast = useToast()
  const [mood, setMood] = useState<MascotMood>('idle')
  const [colour, setColour] = useState<MascotColour>('ink')
  const [accessory, setAccessory] = useState<MascotAccessory>('none')

  return (
    <Page>
      <PageHeader
        title="Design system"
        description="Quiet ink on soft grey. One system, two registers: the working app in Inter, and editorial moments on warm paper."
      />

      <Section title="Colour">
        <div className="grid grid-cols-5 gap-3">
          {SURFACES.map((name) => (
            <Swatch key={name} name={name} value={`var(--atlas-${name})`} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-8 gap-3">
          {SUBJECTS.map((name) => (
            <Swatch key={name} name={name} value={`var(--atlas-subject-${name})`} />
          ))}
        </div>
        <div className="mt-4 flex gap-6">
          {INKS.map((name) => (
            <span key={name} style={{ color: `var(--atlas-${name})` }} className="font-medium">
              {name}: the quick brown fox
            </span>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <Card className="grid grid-cols-2 gap-8 p-6">
          <div>
            <p className="eyebrow mb-2 text-ink-3">Working register</p>
            <p className="text-[1.625rem] leading-8 font-semibold tracking-[-0.02em]">Page title</p>
            <p className="mt-2 text-[0.9375rem] font-semibold">Section heading</p>
            <p className="mt-1 text-ink-2">
              Body text at 13 px. Short and human, with no exclamation marks in errors.
            </p>
            <p className="mt-2 font-mono text-2xs text-ink-3">
              \int_0^1 x^2 \, dx = \tfrac{'{1}{3}'}
            </p>
          </div>
          <div className="rounded-lg bg-paper p-5 text-paper-ink">
            <p className="eyebrow mb-2 text-paper-ink-2">Editorial register</p>
            <p className="font-serif text-[1.75rem] leading-[1.15] font-medium">
              Everything you study, organised
            </p>
            <p className="mt-2 font-serif text-[1rem] leading-6 text-paper-ink-2">
              Serif headings on warm paper, mono labels, hairline rules.
            </p>
          </div>
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" trailingIcon={<Reply className="size-3.5" aria-hidden />}>
            Reply
          </Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm" icon={<Plus className="size-3.5" aria-hidden />}>
            Small
          </Button>
          <IconButton label="Add" shortcut="N">
            <Plus className="size-4" aria-hidden />
          </IconButton>
          <Kbd>⌘K</Kbd>
          <Segmented
            label="Example"
            value="week"
            onChange={() => undefined}
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </div>
      </Section>

      <Section
        title="Floating pill toolbars"
        description="For the paper viewer, annotations, the notes editor and the selection menu."
      >
        <div className="flex flex-wrap items-start gap-3 rounded-lg bg-canvas p-6">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <PillBar label="Find in document" className="pl-3">
                <span className="w-40 text-ink">toolbar</span>
                <span className="px-1 text-ink-3 tabular-nums">2/7</span>
                <PillButton label="Previous match" icon={<ChevronUp className="size-4" />} />
                <PillButton label="Next match" icon={<ChevronDown className="size-4" />} />
                <PillButton label="Close find" icon={<X className="size-4" />} />
              </PillBar>
              <Button
                variant="primary"
                className="h-10 px-4"
                trailingIcon={<Reply className="size-4" aria-hidden />}
              >
                Reply
              </Button>
            </div>
            <div className="flex gap-2">
              <PillBar label="AI actions">
                <PillButton icon={<Wand2 className="size-4" aria-hidden />}>Improve</PillButton>
                <PillButton icon={<Lightbulb className="size-4" aria-hidden />}>Explain</PillButton>
              </PillBar>
              <PillBar label="Edit or comment">
                <PillButton icon={<Pencil className="size-4" aria-hidden />}>Edit</PillButton>
                <PillDivider />
                <PillButton icon={<MessageSquarePlus className="size-4" aria-hidden />}>
                  Comment
                </PillButton>
              </PillBar>
            </div>
            <PillBar label="Formatting">
              <PillButton label="Bold" icon={<Bold className="size-4" />} />
              <PillButton label="Italic" icon={<Italic className="size-4" />} active />
              <PillButton label="Underline" icon={<Underline className="size-4" />} />
              <PillButton label="Code" icon={<Code className="size-4" />} />
              <PillDivider />
              <PillButton label="List" icon={<List className="size-4" />} />
              <PillDivider />
              <PillButton label="Link" icon={<LinkIcon className="size-4" />} />
            </PillBar>
          </div>
          <PillBar label="Zoom" orientation="vertical">
            <PillButton label="Zoom in" icon={<Plus className="size-4" />} />
            <PillDivider orientation="horizontal" />
            <PillButton label="Zoom out" icon={<Minus className="size-4" />} />
            <PillDivider orientation="horizontal" />
            <PillButton label="Fit to width" icon={<Maximize2 className="size-4" />} />
          </PillBar>
        </div>
      </Section>

      <Section title="Mascot" description="Move the pointer around it, and tap it.">
        <Card className="flex items-center gap-10 p-6">
          <div className="flex size-44 shrink-0 items-center justify-center rounded-lg bg-canvas">
            <Mascot
              size={136}
              mood={mood}
              colour={colour}
              accessory={accessory}
              label={`Mascot, ${mood}`}
            />
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-ink-3">Mood</p>
              <div className="flex flex-wrap gap-1.5">
                {MASCOT_MOODS.map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={item === mood ? 'primary' : 'secondary'}
                    onClick={() => setMood(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-ink-3">Colour</p>
              <div className="flex gap-2">
                {MASCOT_COLOUR_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={MASCOT_COLOURS[id].label}
                    aria-pressed={id === colour}
                    onClick={() => setColour(id)}
                    className="size-7 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface aria-pressed:ring-ink"
                    style={{ background: MASCOT_COLOURS[id].body }}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-ink-3">Accessory</p>
              <Segmented
                label="Accessory"
                value={accessory}
                onChange={setAccessory}
                options={MASCOT_ACCESSORIES.map(({ id, label }) => ({ value: id, label }))}
              />
            </div>
          </div>
        </Card>
      </Section>

      <Section title="States">
        <div className="grid grid-cols-2 gap-4">
          <EmptyState
            eyebrow="Empty state"
            title="No flashcards due"
            action={<Button variant="primary">Make a card</Button>}
          >
            Every list has a designed empty state with one clear action.
          </EmptyState>
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <SkeletonList rows={3} />
            </Card>
            <ErrorState title="The import stopped" onRetry={() => undefined}>
              The file could not be read. Check it opens in Preview, then retry.
            </ErrorState>
            <div>
              <Button
                onClick={() =>
                  toast({ title: 'Saved', description: 'Toasts confirm things that worked.' })
                }
              >
                Show a toast
              </Button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Whiteboard">
        <BoardSample />
      </Section>
    </Page>
  )
}

function BoardSample() {
  const open = useOpenBoard()
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-md">
        <BoardCard code={SAMPLE_BOARD} />
      </div>
      {open ? (
        <div className="flex h-[640px] justify-end overflow-hidden rounded-xl ring-1 ring-line">
          <WhiteboardPanel
            key={open.key}
            board={open.board}
            subjectId={null}
            onClose={closeBoard}
          />
        </div>
      ) : null}
    </div>
  )
}
