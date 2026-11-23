import { describe, expect, it } from 'vitest'
import { resolveFeatures } from '@shared/features'

describe('resolveFeatures', () => {
  it('gives the admin everything', () => {
    const f = resolveFeatures({
      signedIn: true,
      approved: true,
      isAdmin: true,
      overrides: { explainer: false },
    })
    expect(Object.values(f).every(Boolean)).toBe(true)
  })
  it('uses defaults unless the admin changed them', () => {
    const f = resolveFeatures({
      signedIn: true,
      approved: true,
      isAdmin: false,
      overrides: { models3d: true, tutor: false, junk: 'x' },
    })
    expect(f).toEqual({ explainer: true, tutor: false, models3d: true, assistant: true })
  })
  it('limits people who are not let in to the open features', () => {
    const f = resolveFeatures({
      signedIn: true,
      approved: false,
      isAdmin: false,
      overrides: { models3d: true },
    })
    expect(f).toEqual({ explainer: true, tutor: false, models3d: false, assistant: true })
  })
})
