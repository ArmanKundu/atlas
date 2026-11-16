import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/cn'

/** Models often write \( \) and \[ \]; remark-math reads $ and $$. */
function normaliseMath(source: string): string {
  return source
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => `$$${body}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => `$${body}$`)
}

/**
 * Renders Markdown with tables and KaTeX maths. Raw HTML in the source is not rendered, so
 * model output and imported text cannot inject markup.
 */
export const Markdown = memo(function Markdown({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <div className={cn('atlas-prose', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normaliseMath(children)}
      </ReactMarkdown>
    </div>
  )
})
