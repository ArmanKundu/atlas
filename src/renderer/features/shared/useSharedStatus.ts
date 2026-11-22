import { useEffect } from 'react'
import type { CommunityStatus } from '@shared/community'
import { changed, useLive, type Live } from '@/lib/api'
import { call } from '@/lib/ipc'

let timer: number | null = null
let users = 0

/**
 * The shared-library account and unread inbox count. Checks again every minute while anything
 * shows it, so invites and join requests turn up without a restart.
 */
export function useSharedStatus(): Live<CommunityStatus> {
  useEffect(() => {
    users += 1
    timer ??= window.setInterval(() => changed('shared-status'), 60_000)
    return () => {
      users -= 1
      if (users === 0 && timer !== null) {
        window.clearInterval(timer)
        timer = null
      }
    }
  }, [])
  return useLive(['shared', 'shared-status'], () => call('shared:status'))
}
