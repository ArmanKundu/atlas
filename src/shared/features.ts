/**
 * Features the Atlas admin can switch on or off for each person. The admin always has
 * everything. Signed-in people get each feature's default unless the admin changed it; people
 * who are not signed in get only the features marked `open`.
 */
export const FEATURES = [
  {
    id: 'explainer',
    label: 'Explainer',
    detail: 'Narrated video lessons for any question.',
    default: true,
    open: true,
  },
  {
    id: 'tutor',
    label: 'Live tutor',
    detail: 'The talking tutor, interruptions and quick checks in lessons.',
    default: true,
    open: false,
  },
  {
    id: 'models3d',
    label: '3D models',
    detail: 'Interactive 3D models you can turn and rearrange.',
    default: false,
    open: false,
  },
  {
    id: 'assistant',
    label: 'Assistant',
    detail: 'The chat assistant.',
    default: true,
    open: true,
  },
] as const

export type FeatureId = (typeof FEATURES)[number]['id']
export type FeatureMap = Record<FeatureId, boolean>

/** What one person can use, from the admin's switches (missing ones fall back to defaults). */
export function resolveFeatures(input: {
  signedIn: boolean
  approved: boolean
  isAdmin: boolean
  overrides: Record<string, unknown>
}): FeatureMap {
  const out = {} as FeatureMap
  for (const f of FEATURES) {
    if (input.isAdmin) out[f.id] = true
    else if (input.signedIn && input.approved) {
      const set = input.overrides[f.id]
      out[f.id] = typeof set === 'boolean' ? set : f.default
    } else out[f.id] = f.open
  }
  return out
}
