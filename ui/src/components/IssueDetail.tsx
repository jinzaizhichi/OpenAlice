import type { ReactNode } from 'react'
import { ArrowLeft, ListChecks } from 'lucide-react'

import type { HeadlessTaskRecord, HeadlessTaskStatus } from '../api/headless'
import type { IssueDetailIssue } from '../api/issues'
import { useIssueDetail } from '../hooks/useIssueDetail'
import { formatRelativeTime } from '../lib/intl'
import { useWorkspace } from '../tabs/store'
import { CadencePill, PriorityIndicator, STATUS_META } from './IssuesBoard'
import { MarkdownContent } from './MarkdownContent'

// Run-status pill tints — mirrors AutomationRunsSection's STATUS_STYLE so the
// Activity feed reads the same as the headless-runs panel.
const RUN_STATUS_STYLE: Record<HeadlessTaskStatus, string> = {
  running: 'bg-blue-500/15 text-blue-400',
  done: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  interrupted: 'bg-amber-500/15 text-amber-400',
}

function fmtDuration(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

// ==================== Properties rail ====================

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <div className="min-w-0 text-right text-[13px] text-text">{children}</div>
    </div>
  )
}

function PropertiesRail({ issue }: { issue: IssueDetailIssue }) {
  const meta = STATUS_META[issue.status]
  return (
    <aside className="w-full shrink-0 space-y-1 rounded-lg border border-border bg-bg-secondary p-4 lg:w-64">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted/70">Properties</h3>
      <div className="divide-y divide-border/60">
        <PropRow label="Status">
          <span className="inline-flex items-center gap-1.5">
            <meta.Icon size={14} className={`shrink-0 ${meta.className}`} />
            {meta.label}
          </span>
        </PropRow>
        <PropRow label="Priority">
          <span className="inline-flex items-center gap-1.5 capitalize">
            <PriorityIndicator priority={issue.priority} />
            {issue.priority}
          </span>
        </PropRow>
        <PropRow label="Assignee">{issue.assignee}</PropRow>
        <PropRow label="Cadence">
          {issue.when ? <CadencePill when={issue.when} /> : <span className="text-muted">—</span>}
        </PropRow>
        <PropRow label="Agent">
          {issue.agent ? (
            <span className="font-mono text-[12px]">{issue.agent}</span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </PropRow>
        {issue.when && (
          <>
            <PropRow label="Last fired">
              {issue.lastFiredAtMs ? (
                formatRelativeTime(issue.lastFiredAtMs)
              ) : (
                <span className="text-muted">never</span>
              )}
            </PropRow>
            <PropRow label="Next due">
              {issue.nextDueAtMs ? (
                formatRelativeTime(issue.nextDueAtMs)
              ) : (
                <span className="text-muted">—</span>
              )}
            </PropRow>
          </>
        )}
      </div>
    </aside>
  )
}

// ==================== Activity feed (headless runs) ====================

function RunRow({ run }: { run: HeadlessTaskRecord }) {
  return (
    <li className="rounded-lg border border-border bg-bg-secondary px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${RUN_STATUS_STYLE[run.status]}`}
        >
          {run.status}
        </span>
        <span className="text-xs text-muted">{run.agent}</span>
        <span className="ml-auto text-xs text-muted" title={new Date(run.startedAt).toLocaleString()}>
          {formatRelativeTime(run.startedAt)}
        </span>
        <span className="text-xs text-muted/70">· {fmtDuration(run.durationMs)}</span>
      </div>
      {run.prompt && (
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-text/80" title={run.prompt}>
          {run.prompt}
        </p>
      )}
      {run.error && <p className="mt-1 text-[12px] text-red-400">{run.error}</p>}
    </li>
  )
}

function ActivityFeed({ runs }: { runs: HeadlessTaskRecord[] }) {
  return (
    <section className="mt-8">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/70">Activity</h3>
      {runs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted">
          No headless runs for this issue yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => (
            <RunRow key={run.taskId} run={run} />
          ))}
        </ul>
      )}
    </section>
  )
}

// ==================== Detail view ====================

/**
 * Read-only Linear-style issue detail. Main column = title + rendered markdown
 * body + Activity feed (the issue's headless runs). Right rail = Properties
 * (status / priority / assignee / cadence / agent + firing markers). No edit
 * controls — Phase 2a is read-only; editing / comments / CLI are Phase 2b.
 */
export function IssueDetail({ wsId, id }: { wsId: string; id: string }) {
  const { data, error, loading } = useIssueDetail(wsId, id)
  const openOrFocus = useWorkspace((s) => s.openOrFocus)

  const backToBoard = (
    <button
      type="button"
      onClick={() => openOrFocus({ kind: 'issue', params: {} })}
      className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-text"
    >
      <ArrowLeft size={13} /> Issues
    </button>
  )

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-5 md:px-6">
        {backToBoard}
        {loading ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (
          <div className="rounded-lg border border-border bg-bg-secondary px-6 py-12 text-center">
            <ListChecks size={24} className="mx-auto text-muted/50" />
            <p className="mt-3 text-sm text-red-400">Failed to load issue: {error}</p>
            <p className="mt-1 font-mono text-xs text-muted/70">
              {wsId.slice(0, 8)} / {id}
            </p>
          </div>
        )}
      </div>
    )
  }

  const { issue, runs } = data

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 md:px-6">
      {backToBoard}
      <div className="flex flex-col gap-6 lg:flex-row">
        <main className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted/70">{id}</span>
            {issue.when && <CadencePill when={issue.when} />}
          </div>
          <h1 className="text-xl font-semibold text-text">{issue.title}</h1>
          <div className="mt-4 border-t border-border/60 pt-4">
            {issue.body.trim() ? (
              <MarkdownContent text={issue.body} />
            ) : (
              <p className="text-sm text-muted">No description.</p>
            )}
          </div>
          <ActivityFeed runs={runs} />
        </main>
        <PropertiesRail issue={issue} />
      </div>
    </div>
  )
}
