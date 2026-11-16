import { useEffect, useId, useRef } from 'react'
import {
  animate as animateValue,
  motion,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type TargetAndTransition,
} from 'framer-motion'
import { cn } from '@/lib/cn'
import { MASCOT_COLOURS, type MascotAccessory, type MascotColour, type MascotMood } from './options'
import { subscribePointer } from './pointer'
import { BODY_PATH, EYES, REST_GAZE, VIEW_BOX, gazeToward, pupilOffset, type Eye } from './shape'

interface MoodSpec {
  /** Where the eyes look: follow the pointer, or a fixed direction. */
  gaze: 'pointer' | { x: number; y: number }
  /** How far each lid covers the eye, 0 to 1. */
  upperLid: number
  lowerLid: number
  pupilScale: number
  /** Looping body animation. Every mood sets the same properties so none is left behind. */
  body: TargetAndTransition
}

const LOOP = { repeat: Infinity, ease: 'easeInOut' } as const

const MOODS: Record<MascotMood, MoodSpec> = {
  idle: {
    gaze: 'pointer',
    upperLid: 0,
    lowerLid: 0,
    pupilScale: 1,
    body: { y: 0, rotate: 0, scale: [1, 1.015, 1], transition: { ...LOOP, duration: 4.2 } },
  },
  thinking: {
    gaze: { x: -0.4, y: -0.85 },
    upperLid: 0.1,
    lowerLid: 0,
    pupilScale: 1,
    body: { y: 0, rotate: [-2.5, 2.5, -2.5], scale: 1, transition: { ...LOOP, duration: 2.6 } },
  },
  happy: {
    gaze: 'pointer',
    upperLid: 0,
    lowerLid: 0.42,
    pupilScale: 1,
    body: { y: [0, -3, 0], rotate: 0, scale: 1, transition: { ...LOOP, duration: 1.4 } },
  },
  celebrating: {
    gaze: { x: 0, y: -0.7 },
    upperLid: 0,
    lowerLid: 0.46,
    pupilScale: 1,
    body: {
      y: [0, -11, 0, -6, 0],
      rotate: [-6, 6, -4, 4, -6],
      scale: [1, 1.04, 1, 1.02, 1],
      transition: { ...LOOP, duration: 0.95 },
    },
  },
  sleepy: {
    gaze: { x: 0.1, y: 0.7 },
    upperLid: 0.6,
    lowerLid: 0,
    pupilScale: 1,
    body: { y: 0, rotate: 3, scale: [1, 1.03, 1], transition: { ...LOOP, duration: 5.4 } },
  },
  concerned: {
    gaze: { x: -0.15, y: 0.5 },
    upperLid: 0.22,
    lowerLid: 0,
    pupilScale: 0.8,
    body: { y: 0, rotate: -2, scale: 0.985, transition: { duration: 0.2, ease: 'easeOut' } },
  },
}

const GAZE_SPRING = { stiffness: 260, damping: 26, mass: 0.6 } as const
const LID_TRANSITION = { duration: 0.2, ease: 'easeOut' } as const

export interface MascotProps {
  /** Rendered width and height in pixels. */
  size?: number
  mood?: MascotMood
  colour?: MascotColour
  accessory?: MascotAccessory
  /** Follow the pointer and bounce when tapped. Off for small avatars. */
  interactive?: boolean
  /** Accessible name. Leave out when the mascot is decorative. */
  label?: string
  className?: string
}

/**
 * The Atlas mascot: the app icon's spiky blob as a live SVG. It blinks and glances, looks toward
 * the pointer, shows moods, and gives a tiny bounce when tapped. With "reduce motion" on it holds
 * still and only its expression changes.
 */
export function Mascot({
  size = 96,
  mood = 'idle',
  colour = 'ink',
  accessory = 'none',
  interactive = true,
  label,
  className,
}: MascotProps) {
  const reducedMotion = useReducedMotion() ?? false
  const clipBase = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const pointerIdle = useRef(true)
  const [tapScope, animateTap] = useAnimate<HTMLDivElement>()

  const spec = MOODS[mood]
  const palette = MASCOT_COLOURS[colour]
  const followsPointer = interactive && !reducedMotion && spec.gaze === 'pointer'

  const gazeX = useMotionValue<number>(REST_GAZE.x)
  const gazeY = useMotionValue<number>(REST_GAZE.y)
  const springX = useSpring(gazeX, GAZE_SPRING)
  const springY = useSpring(gazeY, GAZE_SPRING)
  const blink = useMotionValue(1)

  // Gaze: a fixed direction for some moods, otherwise toward the pointer.
  useEffect(() => {
    const fixed = spec.gaze === 'pointer' ? REST_GAZE : spec.gaze
    gazeX.set(fixed.x)
    gazeY.set(fixed.y)
    if (!followsPointer) return

    let settle: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribePointer((pointer) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.55 }
      const gaze = gazeToward(pointer, centre, Math.max(rect.width * 1.6, 140))
      gazeX.set(gaze.x)
      gazeY.set(gaze.y)
      pointerIdle.current = false
      clearTimeout(settle)
      settle = setTimeout(() => {
        pointerIdle.current = true
        gazeX.set(REST_GAZE.x)
        gazeY.set(REST_GAZE.y)
      }, 2800)
    })
    return () => {
      unsubscribe()
      clearTimeout(settle)
      pointerIdle.current = true
    }
  }, [followsPointer, spec, gazeX, gazeY])

  // Blink every few seconds; now and then glance somewhere while the pointer is still.
  useEffect(() => {
    if (reducedMotion) return
    let timer: ReturnType<typeof setTimeout>
    let glanceBack: ReturnType<typeof setTimeout> | undefined

    const tick = (): void => {
      timer = setTimeout(
        () => {
          void animateValue(blink, [1, 0.08, 1], { duration: 0.17, times: [0, 0.45, 1] })
          if (followsPointer && pointerIdle.current && Math.random() < 0.35) {
            const angle = Math.random() * Math.PI * 2
            gazeX.set(Math.cos(angle) * 0.7)
            gazeY.set(Math.sin(angle) * 0.5)
            glanceBack = setTimeout(() => {
              if (!pointerIdle.current) return
              gazeX.set(REST_GAZE.x)
              gazeY.set(REST_GAZE.y)
            }, 900)
          }
          tick()
        },
        2600 + Math.random() * 3600,
      )
    }
    tick()
    return () => {
      clearTimeout(timer)
      clearTimeout(glanceBack)
    }
  }, [reducedMotion, followsPointer, blink, gazeX, gazeY])

  const bounce = (): void => {
    if (!interactive || reducedMotion || !tapScope.current) return
    void animateTap(
      tapScope.current,
      { y: [0, -9, 0], scaleX: [1, 0.96, 1.04, 1], scaleY: [1, 1.05, 0.95, 1] },
      { duration: 0.38, ease: 'easeOut' },
    )
  }

  return (
    <div
      ref={tapScope}
      onPointerDown={bounce}
      className={cn('inline-block shrink-0 select-none', className)}
      style={{ width: size, height: size }}
    >
      {/* The wrapper div carries the body motion; the SVG inside stays static apart from eyes. */}
      <motion.div
        className="size-full origin-[50%_70%]"
        animate={reducedMotion ? undefined : spec.body}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
          className="block size-full overflow-visible"
          role={label ? 'img' : undefined}
          aria-label={label}
          aria-hidden={label ? undefined : true}
        >
          <path d={BODY_PATH} fill={palette.body} />
          {EYES.map((eye, index) => (
            <EyeView
              key={index}
              eye={eye}
              clipId={`${clipBase}-eye-${index}`}
              gazeX={springX}
              gazeY={springY}
              blink={blink}
              upperLid={spec.upperLid}
              lowerLid={spec.lowerLid}
              pupilScale={spec.pupilScale}
              palette={palette}
              still={reducedMotion}
            />
          ))}
          {accessory === 'none' ? null : <Accessory kind={accessory} palette={palette} />}
        </svg>
      </motion.div>
    </div>
  )
}

function EyeView({
  eye,
  clipId,
  gazeX,
  gazeY,
  blink,
  upperLid,
  lowerLid,
  pupilScale,
  palette,
  still,
}: {
  eye: Eye
  clipId: string
  gazeX: MotionValue<number>
  gazeY: MotionValue<number>
  blink: MotionValue<number>
  upperLid: number
  lowerLid: number
  pupilScale: number
  palette: { body: string; eye: string; pupil: string }
  still: boolean
}) {
  const pupilX = useTransform(() => pupilOffset(eye, { x: gazeX.get(), y: gazeY.get() }).x)
  const pupilY = useTransform(() => pupilOffset(eye, { x: gazeX.get(), y: gazeY.get() }).y)
  const diameter = eye.r * 2
  const lidTransition = still ? { duration: 0 } : LID_TRANSITION

  return (
    <motion.g style={{ scaleY: blink }}>
      <clipPath id={clipId}>
        <circle cx={eye.cx} cy={eye.cy} r={eye.r} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <circle cx={eye.cx} cy={eye.cy} r={eye.r} fill={palette.eye} />
        <motion.g style={{ x: pupilX, y: pupilY }}>
          <motion.circle
            cx={eye.cx}
            cy={eye.cy}
            r={eye.pupil}
            fill={palette.pupil}
            initial={false}
            animate={{ scale: pupilScale }}
            transition={lidTransition}
          />
        </motion.g>
        {/* Lids are body-coloured blocks that slide over the eye from above and below. */}
        <motion.rect
          x={eye.cx - eye.r - 1}
          y={eye.cy - eye.r - diameter}
          width={diameter + 2}
          height={diameter}
          fill={palette.body}
          initial={false}
          animate={{ y: diameter * upperLid }}
          transition={lidTransition}
        />
        <motion.rect
          x={eye.cx - eye.r - 1}
          y={eye.cy + eye.r}
          width={diameter + 2}
          height={diameter}
          fill={palette.body}
          initial={false}
          animate={{ y: -diameter * lowerLid }}
          transition={lidTransition}
        />
      </g>
    </motion.g>
  )
}

function Accessory({
  kind,
  palette,
}: {
  kind: Exclude<MascotAccessory, 'none'>
  palette: { body: string; eye: string }
}) {
  const [left, right] = EYES

  if (kind === 'glasses') {
    return (
      <g fill="none" stroke={palette.eye} strokeWidth={3.5} strokeLinecap="round">
        <circle cx={left.cx} cy={left.cy} r={left.r + 5} />
        <circle cx={right.cx} cy={right.cy} r={right.r + 5} />
        <path
          d={`M${left.cx + left.r + 5} ${left.cy - 3} Q${(left.cx + right.cx) / 2} ${left.cy - 12} ${right.cx - right.r - 5} ${right.cy - 1}`}
        />
      </g>
    )
  }

  if (kind === 'cap') {
    return (
      <g stroke={palette.body} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round">
        <path d="M78 42 L78 54 Q100 64 122 54 L122 42 Z" fill={palette.eye} />
        <path d="M100 22 L140 37 L100 52 L60 37 Z" fill={palette.eye} />
        <path d="M140 37 L140 56" fill="none" />
        <circle cx={140} cy={59} r={3.5} fill={palette.eye} />
      </g>
    )
  }

  return (
    <g
      transform="rotate(18 136 52)"
      fill="var(--atlas-subject-pink)"
      stroke={palette.body}
      strokeWidth={3}
      strokeLinejoin="round"
    >
      <path d="M136 52 L114 40 L114 64 Z" />
      <path d="M136 52 L158 40 L158 64 Z" />
      <circle cx={136} cy={52} r={6} />
    </g>
  )
}

/**
 * The mascot on its light grey tile, like the app icon. Used for avatars and the About screen.
 */
export function MascotTile({
  size = 32,
  colour = 'ink',
  accessory = 'none',
  className,
}: {
  size?: number
  colour?: MascotColour
  accessory?: MascotAccessory
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-end justify-center overflow-hidden', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: 'var(--atlas-mascot-tile)',
      }}
    >
      <span style={{ transform: `translateY(${size * 0.12}px)` }} className="inline-flex">
        <Mascot size={size * 0.92} colour={colour} accessory={accessory} interactive={false} />
      </span>
    </span>
  )
}
