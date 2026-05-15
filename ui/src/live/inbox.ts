import { api } from '../api'
import type { InboxEntry } from '../api/inbox'
import { createLiveStore } from './createLiveStore'

/**
 * Live inbox feed. 20s polling against `/api/inbox/history`. Mirrors the
 * notifications live store — same rationale: passive feed, SSE not worth
 * the kept-open-connection cost.
 *
 * Single shared connection via LiveStore refcount; multiple subscribers
 * (sidebar list, detail page, Activity bar unread badge) share one timer.
 */

export interface InboxState {
  entries: InboxEntry[]
  /** True until the initial history fetch resolves. UI shows a skeleton. */
  loading: boolean
}

const POLL_INTERVAL_MS = 20_000

export const inboxLive = createLiveStore<InboxState>({
  name: 'inbox',
  initialState: { entries: [], loading: true },
  subscribe: ({ apply }) => {
    let disposed = false

    async function refresh() {
      try {
        const { entries } = await api.inbox.history({ limit: 100 })
        if (disposed) return
        apply((prev) => ({ ...prev, entries, loading: false }))
      } catch {
        if (disposed) return
        apply((prev) => ({ ...prev, loading: false }))
      }
    }

    void refresh()
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      disposed = true
      clearInterval(intervalId)
    }
  },
})
