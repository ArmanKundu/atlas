import { memo, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import { Link } from 'react-router'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
// Chemistry notation: \\ce{H2SO4}, reaction arrows and state symbols.
import 'katex/dist/contrib/mhchem.mjs'
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
  blocks,
}: {
  children: string
  className?: string
  /** Fenced blocks rendered as UI instead of code, by language (e.g. `atlas-share`). */
  blocks?: Record<string, (code: string) => ReactNode>
}) {
  const components: Components = {
    a: ({ href, children: label }) => {
      const shared = href?.match(/^atlas:\/\/shared\/([\w-]+)$/)
      if (shared) {
        return (
          <Link
            to={`/shared?item=${shared[1]}`}
            className="text-blue underline-offset-2 hover:underline"
          >
            {label}
          </Link>
        )
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      )
    },
    pre: ({ children: inner, node }) => {
      const code = node?.children[0]
      const lang =
        code && 'properties' in code
          ? (code.properties['className'] as string[] | undefined)
              ?.find((c) => c.startsWith('language-'))
              ?.slice(9)
          : undefined
      const render = lang ? blocks?.[lang] : undefined
      if (render && code && 'children' in code) {
        const text = code.children.map((c) => ('value' in c ? String(c.value) : '')).join('')
        return <>{render(text)}</>
      }
      return <pre>{inner}</pre>
    },
  }
  return (
    <div className={cn('atlas-prose', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
        urlTransform={(url) => (url.startsWith('atlas://shared/') ? url : defaultUrlTransform(url))}
      >
        {normaliseMath(children)}
      </ReactMarkdown>
    </div>
  )
})
