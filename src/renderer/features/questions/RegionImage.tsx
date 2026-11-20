import { useEffect, useRef, useState } from 'react'
import type { Region } from '@shared/models'
import { Skeleton } from '@/design/States'
import { cn } from '@/lib/cn'
import { useSharedPdf } from './pdf-cache'

/** One box of a question, cut out of its PDF page and drawn at the given width. */
function Crop({ sourceId, region, width }: { sourceId: string; region: Region; width: number }) {
  const pdf = useSharedPdf(sourceId)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const doc = pdf.doc
    if (!doc) return
    let cancelled = false
    let task: { cancel: () => void } | undefined
    void doc.getPage(region.page).then((page) => {
      const target = canvas.current
      if (cancelled || !target) return
      const base = page.getViewport({ scale: 1 })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = (width / (base.width * region.w)) * dpr
      const viewport = page.getViewport({
        scale,
        offsetX: -region.x * base.width * scale,
        offsetY: -region.y * base.height * scale,
      })
      target.width = Math.max(1, Math.floor(base.width * region.w * scale))
      target.height = Math.max(1, Math.floor(base.height * region.h * scale))
      const render = page.render({ canvas: target, viewport })
      task = render
      render.promise.then(() => !cancelled && setDrawn(true)).catch(() => undefined)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf.doc, region, width])

  if (pdf.status === 'failed')
    return <p className="text-ink-3">The page could not be drawn. Import the file again.</p>
  return (
    <div className={cn('relative', !drawn && 'min-h-20')}>
      {drawn ? null : <Skeleton className="absolute inset-0" />}
      <canvas
        ref={canvas}
        className={cn('block h-auto w-full rounded-sm bg-white', !drawn && 'opacity-0')}
      />
    </div>
  )
}

/** Every box of a question, top to bottom, as images from the original paper. */
export function RegionImage({
  sourceId,
  regions,
  width = 640,
  className,
}: {
  sourceId: string
  regions: Region[]
  width?: number
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {regions.map((region, index) => (
        <Crop key={index} sourceId={sourceId} region={region} width={width} />
      ))}
    </div>
  )
}
