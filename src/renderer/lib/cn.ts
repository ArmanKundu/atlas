import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Tells the merger about Atlas's own scale names, so `text-ui` is known to be a font size (and
 * does not cancel a text colour) and `shadow-pop` a shadow.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['ui', '2xs'],
      shadow: ['pill', 'pop', 'dialog'],
    },
  },
})

/**
 * Joins class names. When two classes set the same thing, the later one wins, so a component's
 * `className` prop reliably overrides its defaults.
 */
export function cn(...values: ClassValue[]): string {
  return merge(clsx(values))
}
