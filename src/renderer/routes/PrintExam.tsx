import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { ExamPaper } from '@/features/exam/ExamPaper'
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
  const subjectId = exam.data?.subjectId ?? null
  const subject = useLive(
    [],
    () => (subjectId ? db.get('subjects', subjectId) : Promise.resolve(null)),
    [subjectId],
  )

  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.body.style.overflow = 'visible'
    document.body.style.background = '#fff'
  }, [])

  const ready = !exam.loading && !subject.loading
  useEffect(() => {
    if (!ready) return
    void document.fonts.ready.then(() =>
      requestAnimationFrame(() => (document.title = 'atlas-print-ready')),
    )
  }, [ready])

  if (!exam.data || !ready) return null
  return (
    <ExamPaper
      title={exam.data.title}
      bodyMd={(solutions ? exam.data.solutionsMd : exam.data.bodyMd) ?? ''}
      subjectName={subject.data?.name ?? ''}
      kind={subject.data?.kind ?? 'other'}
      minutes={Number((exam.data.config as { minutes?: number }).minutes ?? 60)}
      solutions={solutions}
    />
  )
}
