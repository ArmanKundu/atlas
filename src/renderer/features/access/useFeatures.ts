import { resolveFeatures, type FeatureMap } from '@shared/features'
import { useSharedStatus } from '@/features/shared/useSharedStatus'

const SIGNED_OUT = resolveFeatures({
  signedIn: false,
  approved: false,
  isAdmin: false,
  overrides: {},
})

/**
 * What this person may use, as the Atlas admin set it. Checked again every few minutes, so a
 * change by the admin reaches an app that is already open.
 */
export function useFeatures(): FeatureMap & { loading: boolean } {
  const status = useSharedStatus()
  const features = (status.data?.features as FeatureMap | undefined) ?? SIGNED_OUT
  return { ...SIGNED_OUT, ...features, loading: !status.data && !status.error }
}
