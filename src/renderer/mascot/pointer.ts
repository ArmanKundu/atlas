/**
 * One shared pointer listener for every mascot on screen. Updates are batched to animation
 * frames, and the listener is removed when nobody is subscribed.
 */
type PointerListener = (pointer: { x: number; y: number }) => void

const listeners = new Set<PointerListener>()
let latest = { x: 0, y: 0 }
let frame = 0

function flush(): void {
  frame = 0
  for (const listener of listeners) listener(latest)
}

function onPointerMove(event: PointerEvent): void {
  latest = { x: event.clientX, y: event.clientY }
  if (frame === 0) frame = requestAnimationFrame(flush)
}

export function subscribePointer(listener: PointerListener): () => void {
  if (listeners.size === 0) {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('pointermove', onPointerMove)
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
    }
  }
}
