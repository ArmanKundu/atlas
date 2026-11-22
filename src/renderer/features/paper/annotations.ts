import { useCallback, useState } from 'react'
import type { Annotation, EntityInput } from '@shared/models'
import { db, useLive } from '@/lib/api'

export type Tool =
  'select' | 'highlight' | 'underline' | 'comment' | 'flag' | 'area' | 'pen' | 'marker' | 'question'

export const SWATCHES = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#f87171', '#18181b'] as const

type Op =
  | { kind: 'add'; id: string; values: EntityInput<'annotations'> }
  | { kind: 'remove'; id: string; values: EntityInput<'annotations'> }

function inputOf(a: Annotation): EntityInput<'annotations'> {
  return {
    targetType: a.targetType,
    targetId: a.targetId,
    page: a.page,
    rect: a.rect,
    kind: a.kind,
    color: a.color,
    path: a.path,
    bodyMd: a.bodyMd,
  }
}

/**
 * The student's marks on one PDF: highlights, underlines, ink, comments, flags and bookmarks,
 * stored as page fractions so they line up at any zoom. The PDF itself is never changed.
 * Undo and redo cover this session's changes.
 */
export function useAnnotations(sourceId: string | null) {
  const live = useLive(
    ['annotations'],
    async () =>
      sourceId
        ? ((await db.list('annotations', {
            where: { targetId: sourceId },
            orderBy: 'createdAt',
          })) as Annotation[])
        : [],
    [sourceId],
  )
  const [undo, setUndo] = useState<Op[]>([])
  const [redo, setRedo] = useState<Op[]>([])

  const add = useCallback(async (values: EntityInput<'annotations'>) => {
    const row = await db.create('annotations', values)
    setUndo((u) => [...u, { kind: 'add', id: row.id, values }])
    setRedo([])
    return row
  }, [])

  const remove = useCallback(async (annotation: Annotation) => {
    await db.remove('annotations', annotation.id)
    setUndo((u) => [...u, { kind: 'remove', id: annotation.id, values: inputOf(annotation) }])
    setRedo([])
  }, [])

  /** Applies the reverse of `op` and returns the op that would redo it. */
  const invert = async (op: Op): Promise<Op> => {
    if (op.kind === 'add') {
      await db.remove('annotations', op.id)
      return { kind: 'remove', id: op.id, values: op.values }
    }
    const row = await db.create('annotations', op.values)
    return { kind: 'add', id: row.id, values: op.values }
  }

  const doUndo = useCallback(async () => {
    const op = undo.at(-1)
    if (!op) return
    setUndo((u) => u.slice(0, -1))
    const back = await invert(op)
    setRedo((r) => [...r, back])
  }, [undo])

  const doRedo = useCallback(async () => {
    const op = redo.at(-1)
    if (!op) return
    setRedo((r) => r.slice(0, -1))
    const back = await invert(op)
    setUndo((u) => [...u, back])
  }, [redo])

  const clearMine = useCallback(async () => {
    for (const a of live.data ?? [])
      if (a.author === 'me' && a.kind !== 'bookmark') await db.remove('annotations', a.id)
    setUndo([])
    setRedo([])
  }, [live.data])

  return {
    list: live.data ?? [],
    add,
    remove,
    undo: doUndo,
    redo: doRedo,
    canUndo: undo.length > 0,
    canRedo: redo.length > 0,
    clearMine,
  }
}

export type AnnotationsApi = ReturnType<typeof useAnnotations>
