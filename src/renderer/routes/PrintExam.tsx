import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Markdown } from '@/design/Markdown'
import { db, useLive } from '@/lib/api'

/**
 * Print layout for an exam, opened in a hidden window by the main process and saved as a PDF.
 * It sets the document title to `atlas-print-ready` once fonts and maths have been laid out.
 */
export function PrintExam() {
  const { examId = '' } = useParams()
  const [params] = useSearchParams()
  const solutions = params.get('variant') === 'solutions'
  const exam = useLive([], () => db.get('exams', examId), [examId])

  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.body.style.overflow = 'visible'
    document.body.style.background = '#fff'
  }, [])

  useEffect(() => {
    if (exam.loading) return
    void document.fonts.ready.then(() =>
      requestAnimationFrame(() => (document.title = 'atlas-print-ready')),
    )
  }, [exam.loading])

  if (!exam.data) return null
  return (
    <main className="mx-auto max-w-[760px] bg-white p-2 text-black">
      <p className="mb-4 border-b border-black/20 pb-2 font-mono text-[0.7rem] tracking-wider text-black/60 uppercase">
        {solutions ? 'Solutions booklet' : 'Question booklet'} · Practice paper
      </p>
      <Markdown>{(solutions ? exam.data.solutionsMd : exam.data.bodyMd) ?? ''}</Markdown>
    </main>
  )
}
