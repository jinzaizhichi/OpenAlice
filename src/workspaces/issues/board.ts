/**
 * Issue board snapshot — the read-only shape GET /api/issues returns, built by
 * SCANNING every workspace's `.alice/issues/` directory (never a central store).
 *
 * This is the board PROJECTION of the issue data model in `./declaration.ts`,
 * sibling to the scheduling projection in `../schedule/declaration.ts`. The board
 * shows ALL issues (scheduled or not); a scheduled issue additionally carries its
 * firing markers (`lastFiredAtMs` / `nextDueAtMs`) so the row matches real firing.
 *
 * Phase 1 is read-only and the list view does NOT include the markdown body — the
 * Phase 2 detail view loads it. Keeping the body out keeps the poll payload small.
 */

import type { Schedule } from '../../core/schedule-expr.js'
import type { HeadlessTaskRecord } from '../headless-task-registry.js'
import type { IssuePriority, IssueRecord, IssueStatus } from './declaration.js'

/** One board row: the issue's display fields, plus — iff it self-schedules — its
 *  `when` and the scanner's firing markers. No markdown body (Phase 2 loads it). */
export interface IssuesSnapshotIssue {
  id: string
  title: string
  status: IssueStatus
  priority: IssuePriority
  assignee: string
  /** Present iff the issue self-schedules. */
  when?: Schedule
  /** When the scanner last fired this issue (epoch ms); only for scheduled issues. */
  lastFiredAtMs?: number | null
  /** When it is next due (epoch ms); only for scheduled issues. */
  nextDueAtMs?: number | null
}

export interface IssuesSnapshotWorkspace {
  wsId: string
  tag: string
  /** 'invalid' = the issues dir was unreadable (e.g. a retired `.alice/issue.json`).
   *  A workspace with no issues dir is 'ok' with an empty list — absence is not an
   *  error on the board (it simply contributes no rows). */
  status: 'ok' | 'invalid'
  error?: string
  issues: IssuesSnapshotIssue[]
}

export interface IssuesSnapshot {
  workspaces: IssuesSnapshotWorkspace[]
}

/** The firing markers a scheduled issue carries on the board. Computed by the
 *  caller (from the scanner's marker store + `snapshotScheduledIssue`) so the
 *  board's last/next match the schedule dashboard exactly. */
export interface IssueFiringMarkers {
  lastFiredAtMs: number | null
  nextDueAtMs: number | null
}

// ==================== Detail (Phase 2a) ====================
// The read-only shape GET /api/issues/:wsId/:id returns: one issue's full
// fields INCLUDING the markdown body and (iff scheduled) its firing markers +
// scheduling frontmatter, plus that issue's headless run history (its Activity
// feed). Unlike the board list, the detail loads the body and the runs.

/** One issue's full detail fields: the board row's fields + the markdown body +
 *  the scheduling frontmatter (`what`/`agent`). Markers are present iff scheduled. */
export interface IssueDetailIssue {
  id: string
  title: string
  /** Markdown description body (the list view omits this; the detail loads it). */
  body: string
  status: IssueStatus
  priority: IssuePriority
  assignee: string
  /** Present iff the issue self-schedules. */
  when?: Schedule
  /** Scheduled fire prompt override (frontmatter `what`), if set. */
  what?: string
  /** Adapter id for the scheduled fire (frontmatter `agent`), if set. */
  agent?: string
  /** When the scanner last fired this issue (epoch ms); only for scheduled issues. */
  lastFiredAtMs?: number | null
  /** When it is next due (epoch ms); only for scheduled issues. */
  nextDueAtMs?: number | null
}

/** GET /api/issues/:wsId/:id — one issue + its run history (Activity feed). */
export interface IssueDetail {
  issue: IssueDetailIssue
  /** This issue's headless runs (wsId + issueId match), newest first. */
  runs: HeadlessTaskRecord[]
}

/** Map a validated issue (+ its firing markers, iff scheduled) to the detail
 *  issue shape. Keeps the body and the scheduling frontmatter the board drops. */
export function detailIssue(
  issue: IssueRecord,
  markers: IssueFiringMarkers | null,
): IssueDetailIssue {
  return {
    id: issue.id,
    title: issue.title,
    body: issue.body,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    ...(issue.when ? { when: issue.when } : {}),
    ...(issue.what ? { what: issue.what } : {}),
    ...(issue.agent ? { agent: issue.agent } : {}),
    ...(markers ? { lastFiredAtMs: markers.lastFiredAtMs, nextDueAtMs: markers.nextDueAtMs } : {}),
  }
}

/** Map one validated issue (+ its firing markers, iff scheduled) to a board row.
 *  Pure: the caller resolves `markers` for scheduled issues and passes `null` for
 *  pure board work items. The markdown body is intentionally dropped. */
export function snapshotBoardIssue(
  issue: IssueRecord,
  markers: IssueFiringMarkers | null,
): IssuesSnapshotIssue {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    ...(issue.when ? { when: issue.when } : {}),
    ...(markers ? { lastFiredAtMs: markers.lastFiredAtMs, nextDueAtMs: markers.nextDueAtMs } : {}),
  }
}
