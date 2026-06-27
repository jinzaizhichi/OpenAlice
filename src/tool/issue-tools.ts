/**
 * Issue tools — the agent-facing surface over a workspace's own issue board.
 *
 * These are **workspace-scoped tool factories** (same shape as inbox_push /
 * entity_upsert): the agent sees a schema WITHOUT any `wsId`, and the workspace
 * identity is closed over by the factory from the gateway URL (`/cli/:wsId` or
 * `/mcp/:wsId`). Registering each factory once makes it reachable via BOTH the
 * `alice-workspace issue …` CLI (the primary agent surface) AND MCP (one
 * adapter) for free — the gateway builds and dispatches both through the same
 * WorkspaceToolCenter.
 *
 * Every tool resolves THIS workspace's checkout dir (`resolveWorkspace(self)`)
 * and goes through the single read-modify-write seam in
 * `../workspaces/issues/mutate.ts` (shared with the human/UI HTTP routes) or the
 * live reader in `../workspaces/issues/declaration.ts`. The issue file
 * (`.alice/issues/<id>.md`, YAML frontmatter + markdown body) is the single
 * source of truth; writes are working-tree only (no auto-commit).
 *
 * Comments and created-issue authorship are tagged `ws:<workspaceLabel>` — the
 * agent never names its own identity; the factory stamps it.
 */

import { join } from 'node:path'

import { tool } from 'ai'
import { z } from 'zod'

import type { WorkspaceToolFactory, WorkspaceToolContext } from '../core/workspace-tool-center.js'
import { readWorkspaceFile } from '../workspaces/file-service.js'
import {
  ISSUES_DIR_REL,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  issueWhenSchema,
  parseIssueContent,
  readWorkspaceIssues,
  type IssueRecord,
} from '../workspaces/issues/declaration.js'
import {
  appendIssueComment,
  createIssue,
  updateIssueFields,
} from '../workspaces/issues/mutate.js'

/** Resolve THIS workspace's absolute checkout dir, or a clean error. */
function selfDir(ctx: WorkspaceToolContext): { ok: true; dir: string } | { ok: false; error: string } {
  const resolve = ctx.resolveWorkspace
  if (!resolve) return { ok: false, error: 'workspace resolution is unavailable in this context' }
  const meta = resolve(ctx.workspaceId)
  if (!meta) return { ok: false, error: `cannot locate this workspace (${ctx.workspaceId})` }
  return { ok: true, dir: meta.dir }
}

/** The comment / create author for this workspace's writes. */
const author = (ctx: WorkspaceToolContext): string => `ws:${ctx.workspaceLabel}`

/** Project a full IssueRecord into the compact row the tools return. */
function rowOf(issue: IssueRecord) {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    scheduled: issue.when !== undefined,
  }
}

// ==================== issue_update ====================

export const issueUpdateFactory: WorkspaceToolFactory = {
  name: 'issue_update',
  build(ctx: WorkspaceToolContext) {
    return tool({
      description: [
        "Update one of THIS workspace's issues — its board fields.",
        '',
        'Patch any subset of `status`, `priority`, `assignee`; omitted fields are',
        'left untouched. Scheduling frontmatter (`when`/`what`/`agent`) and the',
        'markdown body are preserved — edit those by writing the file directly',
        '(`.alice/issues/<id>.md`).',
        '',
        'Marking an issue `done` or `canceled` is how a self-scheduled issue is',
        'turned off — there is no separate enabled flag.',
      ].join('\n'),
      inputSchema: z.object({
        id: z.string().min(1).describe('The issue id (the filename stem of `.alice/issues/<id>.md`).'),
        status: z.enum(ISSUE_STATUSES).optional().describe('New status.'),
        priority: z.enum(ISSUE_PRIORITIES).optional().describe('New priority.'),
        assignee: z
          .string()
          .min(1)
          .optional()
          .describe('New assignee, e.g. "human", "ws:<tag>", or "unassigned".'),
      }),
      execute: async ({ id, status, priority, assignee }) => {
        const dir = selfDir(ctx)
        if (!dir.ok) return { ok: false as const, error: dir.error }
        if (status === undefined && priority === undefined && assignee === undefined) {
          return { ok: false as const, error: 'no fields to update (pass at least one of status/priority/assignee)' }
        }
        const res = await updateIssueFields(dir.dir, id, { status, priority, assignee })
        if (res.ok) return { ok: true as const, issue: rowOf(res.issue) }
        if (res.reason === 'not_found') return { ok: false as const, error: `no such issue: ${id}` }
        return { ok: false as const, error: res.error }
      },
    })
  },
}

// ==================== issue_comment ====================

export const issueCommentFactory: WorkspaceToolFactory = {
  name: 'issue_comment',
  build(ctx: WorkspaceToolContext) {
    return tool({
      description: [
        "Append a comment to one of THIS workspace's issues.",
        '',
        'The comment lands under a stable `## Comments` section in the issue’s',
        'markdown body (the file is the single source of truth — no separate',
        'comment store), authored as `ws:<this workspace>`. Use it to leave a',
        'progress note, a finding, or a question for the human reading the board.',
      ].join('\n'),
      inputSchema: z.object({
        id: z.string().min(1).describe('The issue id to comment on.'),
        text: z.string().min(1).describe('The comment text (markdown).'),
      }),
      execute: async ({ id, text }) => {
        const dir = selfDir(ctx)
        if (!dir.ok) return { ok: false as const, error: dir.error }
        const res = await appendIssueComment(dir.dir, id, author(ctx), text)
        if (res.ok) return { ok: true as const, issue: rowOf(res.issue) }
        if (res.reason === 'not_found') return { ok: false as const, error: `no such issue: ${id}` }
        return { ok: false as const, error: res.error }
      },
    })
  },
}

// ==================== issue_create ====================

export const issueCreateFactory: WorkspaceToolFactory = {
  name: 'issue_create',
  build(ctx: WorkspaceToolContext) {
    return tool({
      description: [
        'Create a new issue on THIS workspace’s board.',
        '',
        '`title` is required; `id` is optional (derived as a kebab slug from the',
        'title when omitted). Creating over an existing id is refused — pick a',
        'different id or update the existing one with issue_update.',
        '',
        'Add a `when` to make the issue self-schedule (the scanner fires `what`,',
        'or the title+body if `what` is absent, on the schedule) — otherwise it’s',
        'a pure board work item. `body` is the markdown description.',
      ].join('\n'),
      inputSchema: z.object({
        title: z.string().min(1).describe('Short human title (required).'),
        id: z
          .string()
          .min(1)
          .optional()
          .describe('Explicit id (filename stem). Omit to derive a kebab slug from the title.'),
        status: z.enum(ISSUE_STATUSES).optional().describe('Initial status (default "todo").'),
        priority: z.enum(ISSUE_PRIORITIES).optional().describe('Initial priority (default "none").'),
        assignee: z.string().min(1).optional().describe('Initial assignee (default "unassigned").'),
        when: issueWhenSchema
          .optional()
          .describe('Schedule shape — { kind:"at", at } | { kind:"every", every } | { kind:"cron", cron }. Present iff the issue self-schedules.'),
        what: z.string().min(1).optional().describe('Prompt fired on schedule; falls back to title+body if absent.'),
        agent: z.string().min(1).optional().describe('Adapter id to run the scheduled fire with.'),
        body: z.string().optional().describe('Markdown description body.'),
      }),
      execute: async ({ title, id, status, priority, assignee, when, what, agent, body }) => {
        const dir = selfDir(ctx)
        if (!dir.ok) return { ok: false as const, error: dir.error }
        const res = await createIssue(dir.dir, {
          title,
          id,
          status,
          priority,
          assignee: assignee ?? author(ctx),
          when,
          what,
          agent,
          body,
        })
        if (res.ok) return { ok: true as const, issue: rowOf(res.issue) }
        if (res.reason === 'conflict') return { ok: false as const, error: `issue already exists: ${res.id}` }
        return { ok: false as const, error: res.error }
      },
    })
  },
}

// ==================== issue_list ====================

export const issueListFactory: WorkspaceToolFactory = {
  name: 'issue_list',
  build(ctx: WorkspaceToolContext) {
    return tool({
      description: [
        "List THIS workspace's issues — every `.alice/issues/<id>.md`, validated.",
        '',
        'Returns a compact row per issue (id, title, status, priority, assignee,',
        'and whether it self-schedules). Any file that fails to parse is reported',
        'in `invalid` rather than dropped silently.',
      ].join('\n'),
      inputSchema: z.object({}),
      execute: async () => {
        const dir = selfDir(ctx)
        if (!dir.ok) return { ok: false as const, error: dir.error }
        const res = await readWorkspaceIssues(dir.dir)
        if (res.ok) {
          return { ok: true as const, issues: res.issues.map(rowOf), invalid: res.invalid }
        }
        if (res.reason === 'absent') return { ok: true as const, issues: [], invalid: [] }
        return { ok: false as const, error: res.error }
      },
    })
  },
}

// ==================== issue_show ====================

export const issueShowFactory: WorkspaceToolFactory = {
  name: 'issue_show',
  build(ctx: WorkspaceToolContext) {
    return tool({
      description: [
        "Show one of THIS workspace's issues in full — frontmatter + markdown body",
        '(which includes any `## Comments` section). Use this to read the current',
        'state of an issue before updating or commenting on it.',
      ].join('\n'),
      inputSchema: z.object({
        id: z.string().min(1).describe('The issue id to show.'),
      }),
      execute: async ({ id }) => {
        const dir = selfDir(ctx)
        if (!dir.ok) return { ok: false as const, error: dir.error }
        const raw = await readWorkspaceFile(dir.dir, join(ISSUES_DIR_REL, `${id}.md`))
        if (raw === null) return { ok: false as const, error: `no such issue: ${id}` }
        const parsed = parseIssueContent(id, raw)
        if (!parsed.ok) return { ok: false as const, error: parsed.error }
        return { ok: true as const, issue: parsed.issue }
      },
    })
  },
}

/** All issue tool factories, in registration order. */
export const issueToolFactories: WorkspaceToolFactory[] = [
  issueUpdateFactory,
  issueCommentFactory,
  issueCreateFactory,
  issueListFactory,
  issueShowFactory,
]
