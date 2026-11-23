import { Link } from 'react-router'
import { Lock } from 'lucide-react'
import { FEATURES, type FeatureId } from '@shared/features'
import { EmptyState } from '@/design/States'
import { useSharedStatus } from '@/features/shared/useSharedStatus'

/** Shown in place of a feature the admin has not turned on for this person. */
export function Locked({ feature }: { feature: FeatureId }) {
  const status = useSharedStatus()
  const info = FEATURES.find((f) => f.id === feature)
  const signedIn = status.data?.signedIn ?? false
  return (
    <div className="mx-auto max-w-xl p-8 pt-[12vh]">
      <EmptyState
        eyebrow={info?.label}
        title={signedIn ? 'This is not turned on for you yet' : 'Sign in to use this'}
        art={<Lock className="size-8 text-ink-3" aria-hidden />}
        action={
          signedIn ? null : (
            <Link
              to="/shared"
              className="inline-flex h-9 items-center rounded-lg bg-accent px-4 font-medium text-accent-fg hover:bg-accent-hover"
            >
              Sign in
            </Link>
          )
        }
      >
        {signedIn
          ? 'Your Atlas admin chooses who gets each feature. Ask them to switch it on for your account.'
          : `${info?.detail ?? ''} It needs an Atlas account that the admin has let in.`}
      </EmptyState>
    </div>
  )
}
