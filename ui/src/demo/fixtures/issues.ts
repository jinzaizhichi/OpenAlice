import type { HeadlessTaskRecord } from '../../api/headless'
import type { IssueDetail, IssuePriority, IssueSnapshot, IssueStatus } from '../../api/issues'

// GET /api/issues aggregates every workspace's declared issues by SCANNING
// each workspace's `.alice/issues/<id>.md` dir (one markdown file per issue) —
// it is not a central store. The board list omits the markdown body (Phase 2
// detail view loads it). Scheduled issues (those carrying `when`) also surface
// on /api/schedule; the two demo fixtures intentionally share ids
// (morning-scan / thesis-watch / weekly-digest) so the surfaces stay coherent.
//
// Coverage exercised by these fixtures: 2 workspaces; all five `status` values
// (backlog/todo/in_progress/done/canceled); all five `priority` values
// (urgent/high/medium/low/none); all three assignee shapes (human / ws:<tag> /
// unassigned); all three `when` kinds (cron/every/at) plus unscheduled work
// items (no `when`, no lastFired/nextDue).

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const now = Date.now()

export const demoIssuesSnapshot: IssueSnapshot = {
  workspaces: [
    {
      wsId: 'demo-ws-auto-quant',
      tag: 'auto-quant',
      status: 'ok',
      issues: [
        // Scheduled (cron) + actively running.
        {
          id: 'morning-scan',
          title: 'Morning movers scan',
          status: 'in_progress',
          priority: 'high',
          assignee: 'ws:auto-quant',
          when: { kind: 'cron', cron: '30 8 * * 1-5' },
          lastFiredAtMs: now - HOUR,
          nextDueAtMs: now + 16 * HOUR,
        },
        // Scheduled (every) + urgent.
        {
          id: 'thesis-watch',
          title: 'Thesis invalidation watch',
          status: 'todo',
          priority: 'urgent',
          assignee: 'ws:auto-quant',
          when: { kind: 'every', every: '1h' },
          lastFiredAtMs: now - HOUR / 2,
          nextDueAtMs: now + HOUR / 2,
        },
        // Pure work item — no `when`, scanner ignores it, board still shows it.
        {
          id: 'rebalance-sizing-review',
          title: 'Rebalance sizing logic needs a human review',
          status: 'todo',
          priority: 'medium',
          assignee: 'human',
        },
        // Backlog, unassigned, unscheduled.
        {
          id: 'prune-stale-signals',
          title: 'Prune stale signal cache entries',
          status: 'backlog',
          priority: 'low',
          assignee: 'unassigned',
        },
      ],
    },
    {
      wsId: 'demo-ws-macro',
      tag: 'macro-research',
      status: 'ok',
      issues: [
        // Scheduled (cron) weekly digest.
        {
          id: 'weekly-digest',
          title: 'Weekly macro digest',
          status: 'in_progress',
          priority: 'medium',
          assignee: 'ws:macro-research',
          when: { kind: 'cron', cron: '0 16 * * 5' },
          lastFiredAtMs: now - 2 * DAY,
          nextDueAtMs: now + 5 * DAY,
        },
        // Scheduled (at) one-shot — never fired yet.
        {
          id: 'cpi-release-note',
          title: 'Write the CPI release reaction note',
          status: 'todo',
          priority: 'high',
          assignee: 'human',
          when: { kind: 'at', at: new Date(now + 3 * DAY).toISOString() },
          lastFiredAtMs: null,
          nextDueAtMs: now + 3 * DAY,
        },
        // Completed work item.
        {
          id: 'fed-speaker-calendar',
          title: 'Summarize the upcoming Fed speaker calendar',
          status: 'done',
          priority: 'none',
          assignee: 'human',
        },
        // Canceled work item.
        {
          id: 'cross-asset-correlation',
          title: 'Cross-asset correlation study',
          status: 'canceled',
          priority: 'low',
          assignee: 'unassigned',
        },
      ],
    },
  ],
}

// ==================== Detail (Phase 2a) ====================
// GET /api/issues/:wsId/:id returns the read-only IssueDetail: one issue's full
// fields INCLUDING the markdown body + scheduling frontmatter (what/agent), plus
// that issue's headless run history (its Activity feed). The board list omits
// both. The detail issue's display fields are derived from the board snapshot
// above (single source of truth), so the two surfaces never drift; the extras
// below supply only what the list doesn't carry.
//
// `runs` are HeadlessTaskRecord-shaped exactly as GET /api/headless returns —
// already filtered to this issue (wsId + issueId match) and newest-first, as the
// real endpoint does. Coverage: all four run statuses (done / running / failed /
// interrupted), a never-fired scheduled issue (empty feed), and unscheduled work
// items (no runs — issueId is only recorded on scheduled fires).

interface IssueDetailExtras {
  /** Markdown body the list view drops; rendered in the detail main column. */
  body: string
  /** Scheduling frontmatter `what` (fire-prompt override), if set. */
  what?: string
  /** Scheduling frontmatter `agent` (adapter id), if set. */
  agent?: string
  /** This issue's headless runs, newest-first (Activity feed). */
  runs: HeadlessTaskRecord[]
}

// Keyed by `${wsId}/${id}`. Issues absent here fall back to a generic body + no
// runs (see demoIssueDetail) so every board row opens cleanly in the demo.
const demoIssueExtras: Record<string, IssueDetailExtras> = {
  'demo-ws-auto-quant/morning-scan': {
    body: [
      'Scan the pre-market movers and surface anything the book should react to before the open.',
      '',
      '## What to look for',
      '',
      '- Gap-ups / gap-downs **> 5%** on above-average volume',
      '- Names with overnight news (earnings, guidance, M&A)',
      '- Anything touching an open position or a watchlist thesis',
      '',
      '## Output',
      '',
      'Push a short ranked list to the Inbox — ticker, gap %, the one-line why, and whether it touches the book.',
    ].join('\n'),
    what: 'Run the morning movers scan and push a ranked Inbox digest.',
    agent: 'codex',
    runs: [
      {
        taskId: 'demo-run-morning-1',
        wsId: 'demo-ws-auto-quant',
        agent: 'codex',
        prompt: 'Run the morning movers scan and push a ranked Inbox digest.',
        status: 'done',
        startedAt: now - HOUR,
        finishedAt: now - HOUR + 84_000,
        durationMs: 84_000,
        exitCode: 0,
        agentSessionId: '019eb75e-0b1b-7fa2-ba95-fd7db4463afe',
      },
      {
        taskId: 'demo-run-morning-2',
        wsId: 'demo-ws-auto-quant',
        agent: 'codex',
        prompt: 'Run the morning movers scan and push a ranked Inbox digest.',
        status: 'failed',
        startedAt: now - DAY,
        finishedAt: now - DAY + 12_000,
        durationMs: 12_000,
        exitCode: 1,
        error: 'market-data provider timed out (OpenBB upstream 504)',
      },
      {
        taskId: 'demo-run-morning-3',
        wsId: 'demo-ws-auto-quant',
        agent: 'codex',
        prompt: 'Run the morning movers scan and push a ranked Inbox digest.',
        status: 'done',
        startedAt: now - 2 * DAY,
        finishedAt: now - 2 * DAY + 79_000,
        durationMs: 79_000,
        exitCode: 0,
        agentSessionId: '019eb6aa-2c4f-7b10-9d22-aa1c0f7711be',
      },
    ],
  },
  'demo-ws-auto-quant/thesis-watch': {
    body: [
      'Watch the active theses for invalidation and ping the desk the moment one breaks.',
      '',
      'Each thesis lives in `theses/*.md` with an explicit invalidation level. This run',
      're-checks every one against the latest quote and flags breaches.',
    ].join('\n'),
    agent: 'claude',
    runs: [
      {
        taskId: 'demo-run-thesis-1',
        wsId: 'demo-ws-auto-quant',
        agent: 'claude',
        prompt: 'Re-check every active thesis against the latest quotes; flag invalidations.',
        status: 'running',
        startedAt: now - 2 * 60_000,
        agentSessionId: '414d6b8c-95b4-4e01-8ffc-4b6332da17d4',
      },
      {
        taskId: 'demo-run-thesis-2',
        wsId: 'demo-ws-auto-quant',
        agent: 'claude',
        prompt: 'Re-check every active thesis against the latest quotes; flag invalidations.',
        status: 'done',
        startedAt: now - HOUR / 2,
        finishedAt: now - HOUR / 2 + 31_000,
        durationMs: 31_000,
        exitCode: 0,
      },
      {
        taskId: 'demo-run-thesis-3',
        wsId: 'demo-ws-auto-quant',
        agent: 'claude',
        prompt: 'Re-check every active thesis against the latest quotes; flag invalidations.',
        status: 'interrupted',
        startedAt: now - 2 * HOUR,
        finishedAt: now - 2 * HOUR + 4_000,
        killed: true,
        signal: 'SIGTERM',
      },
    ],
  },
  'demo-ws-macro/weekly-digest': {
    body: [
      '# Weekly macro digest',
      '',
      'Pull the week into one readable note: rates, FX, the data that printed, and the',
      'data on deck. Friday close.',
      '',
      '1. **Rates** — UST curve moves, any repricing of the cut path',
      '2. **FX** — DXY + the majors',
      '3. **Prints** — what surprised vs consensus',
      '4. **Next week** — the calendar that matters',
    ].join('\n'),
    what: 'Write the weekly macro digest and push it to the Inbox.',
    agent: 'codex',
    runs: [
      {
        taskId: 'demo-run-digest-1',
        wsId: 'demo-ws-macro',
        agent: 'codex',
        prompt: 'Write the weekly macro digest and push it to the Inbox.',
        status: 'done',
        startedAt: now - 2 * DAY,
        finishedAt: now - 2 * DAY + 156_000,
        durationMs: 156_000,
        exitCode: 0,
        agentSessionId: '019eb5c1-7d80-7a44-8f3e-3b6e2c9d4401',
      },
      {
        taskId: 'demo-run-digest-2',
        wsId: 'demo-ws-macro',
        agent: 'codex',
        prompt: 'Write the weekly macro digest and push it to the Inbox.',
        status: 'done',
        startedAt: now - 9 * DAY,
        finishedAt: now - 9 * DAY + 141_000,
        durationMs: 141_000,
        exitCode: 0,
      },
    ],
  },
  // Scheduled one-shot that has never fired — exercises the empty Activity feed.
  'demo-ws-macro/cpi-release-note': {
    body: [
      'Draft the reaction note the moment CPI prints.',
      '',
      'Lead with the headline vs core surprise, then the rates/FX read-through in two',
      'sentences. Keep it under 150 words — this goes out fast.',
    ].join('\n'),
    what: 'Draft the CPI reaction note as soon as the print lands.',
    agent: 'claude',
    runs: [],
  },
  // Unscheduled work items — body only, no runs (issueId is recorded only on
  // scheduled fires, so these have no Activity feed).
  'demo-ws-auto-quant/rebalance-sizing-review': {
    body: [
      'The sizing logic in `rebalance.ts` rounds lot sizes in a way that drifts the',
      'target weights on small books. A human should sanity-check the rounding before',
      'we let the scheduler touch it.',
      '',
      '- [ ] Confirm the drift is real on the $25k paper book',
      '- [ ] Decide: round-to-lot vs allow fractional',
    ].join('\n'),
    runs: [],
  },
  'demo-ws-auto-quant/prune-stale-signals': {
    body: 'Old signal-cache entries are never evicted. Add a TTL sweep so the cache stops growing unbounded.',
    runs: [],
  },
  'demo-ws-macro/fed-speaker-calendar': {
    body: 'Done — the upcoming Fed speaker calendar is summarized in `notes/fed-speakers.md` with hawk/dove leanings.',
    runs: [],
  },
  'demo-ws-macro/cross-asset-correlation': {
    body: 'Canceled — superseded by the dealer-positioning work; the correlation study was duplicating that lens.',
    runs: [],
  },
}

/** Locate a board issue (+ its workspace) by id, so the detail's display fields
 *  derive from the same source as the list. Returns null if no such row exists. */
function findBoardIssue(wsId: string, id: string) {
  const ws = demoIssuesSnapshot.workspaces.find((w) => w.wsId === wsId)
  return ws?.issues.find((i) => i.id === id) ?? null
}

/** Build the IssueDetail the GET /api/issues/:wsId/:id mock returns, or null if
 *  the (wsId, id) pair doesn't exist on the board (→ 404). Display fields come
 *  from the board snapshot; body / what / agent / runs come from the extras map
 *  (with a generic-body, no-runs fallback so any row opens). */
export function demoIssueDetail(wsId: string, id: string): IssueDetail | null {
  const boardIssue = findBoardIssue(wsId, id)
  if (!boardIssue) return null
  const extras = demoIssueExtras[`${wsId}/${id}`]
  const body = extras?.body ?? `${boardIssue.title}\n\n(No description.)`
  return {
    issue: {
      ...boardIssue,
      body,
      ...(extras?.what ? { what: extras.what } : {}),
      ...(extras?.agent ? { agent: extras.agent } : {}),
    },
    runs: extras?.runs ?? [],
  }
}

// ==================== Mutations (Phase 2b demo write path) ====================
// PATCH /api/issues/:wsId/:id and POST /api/issues/:wsId/:id/comments mutate the
// in-memory fixture above IN PLACE (per-session; resets on reload), so the demo
// UI reflects edits/comments just like the real working-tree-only writes do. The
// board snapshot is the single source of truth for status/priority/assignee
// (GET list + GET detail both read it live, so one mutation updates both); the
// markdown body — which now carries the appended `## Comments` section — lives in
// the extras map, materialized on demand for rows that had no extras entry.

/** Append one comment block to a markdown body, under a stable `## Comments`
 *  heading (created if absent). Mirrors the server's appendIssueComment format:
 *  `**<author>** · <ISO timestamp>` then a blank line then the text. */
function appendCommentToBody(body: string, author: string, text: string): string {
  const block = `**${author}** · ${new Date().toISOString()}\n\n${text}`
  const trimmed = body.replace(/\s+$/, '')
  const hasSection = /(^|\n)## Comments\s*(\n|$)/.test(trimmed)
  return hasSection
    ? `${trimmed}\n\n${block}\n`
    : `${trimmed}\n\n## Comments\n\n${block}\n`
}

/** PATCH backing: mutate the board issue's status/priority/assignee in place,
 *  then return the fresh detail shape (same `{ issue, runs }` as GET). Returns
 *  null when the (wsId, id) pair doesn't exist (→ 404). */
export function demoIssueUpdate(
  wsId: string,
  id: string,
  patch: { status?: IssueStatus; priority?: IssuePriority; assignee?: string },
): IssueDetail | null {
  const boardIssue = findBoardIssue(wsId, id)
  if (!boardIssue) return null
  if (patch.status !== undefined) boardIssue.status = patch.status
  if (patch.priority !== undefined) boardIssue.priority = patch.priority
  if (patch.assignee !== undefined) boardIssue.assignee = patch.assignee
  return demoIssueDetail(wsId, id)
}

/** POST-comment backing: append a comment to the issue's markdown body (creating
 *  an extras entry for rows that only had the generic fallback body), then return
 *  the fresh detail shape. Returns null when the issue doesn't exist (→ 404). */
export function demoIssueAddComment(
  wsId: string,
  id: string,
  author: string,
  text: string,
): IssueDetail | null {
  const boardIssue = findBoardIssue(wsId, id)
  if (!boardIssue) return null
  const key = `${wsId}/${id}`
  const existing = demoIssueExtras[key]
  const currentBody = existing?.body ?? `${boardIssue.title}\n\n(No description.)`
  const nextBody = appendCommentToBody(currentBody, author, text)
  if (existing) existing.body = nextBody
  else demoIssueExtras[key] = { body: nextBody, runs: [] }
  return demoIssueDetail(wsId, id)
}
