import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Tool } from 'ai'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { WorkspaceToolContext } from '../core/workspace-tool-center.js'
import { readWorkspaceIssues } from '../workspaces/issues/declaration.js'
import {
  issueCommentFactory,
  issueCreateFactory,
  issueListFactory,
  issueShowFactory,
  issueUpdateFactory,
} from './issue-tools.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'issue-tools-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Context whose `resolveWorkspace(self)` points at the temp checkout dir. */
function ctx(over: Partial<WorkspaceToolContext> = {}): WorkspaceToolContext {
  return {
    workspaceId: 'ws-self',
    workspaceLabel: 'auto-quant',
    inboxStore: {} as never,
    entityStore: {} as never,
    resolveWorkspace: (id) => (id === 'ws-self' ? { id, dir, tag: 'auto-quant' } : null),
    ...over,
  }
}

async function run(tool: Tool, args: Record<string, unknown>) {
  return (await tool.execute!(args, { toolCallId: 't', messages: [] })) as Record<string, unknown> & {
    ok: boolean
    error?: string
  }
}

/** Round-trip oracle: read one issue back through the production reader. */
async function readBack(id: string) {
  const r = await readWorkspaceIssues(dir)
  if (!r.ok) throw new Error(`readWorkspaceIssues not ok: ${JSON.stringify(r)}`)
  return r.issues.find((i) => i.id === id)
}

describe('issue_create', () => {
  it('creates an issue, stamps the workspace assignee, and is reachable via the reader', async () => {
    const res = await run(issueCreateFactory.build(ctx()), { title: 'Fix the thing' })
    expect(res.ok).toBe(true)
    expect(res.issue).toMatchObject({ id: 'fix-the-thing', title: 'Fix the thing', assignee: 'ws:auto-quant' })
    const issue = await readBack('fix-the-thing')
    expect(issue?.title).toBe('Fix the thing')
  })

  it('refuses to overwrite an existing id (conflict → clean error)', async () => {
    await run(issueCreateFactory.build(ctx()), { id: 'dup', title: 'one' })
    const res = await run(issueCreateFactory.build(ctx()), { id: 'dup', title: 'two' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/already exists/)
  })
})

describe('issue_update', () => {
  it('validates and writes patched fields, preserving body + scheduling', async () => {
    await run(issueCreateFactory.build(ctx()), {
      id: 'sched',
      title: 'scheduled work',
      when: { kind: 'every', every: '30m' },
      body: 'keep me',
    })
    const res = await run(issueUpdateFactory.build(ctx()), { id: 'sched', status: 'in_progress', priority: 'high' })
    expect(res.ok).toBe(true)
    const issue = await readBack('sched')
    expect(issue).toMatchObject({ status: 'in_progress', priority: 'high', body: 'keep me' })
    // scheduling frontmatter survives a board-field patch
    expect(issue?.when).toEqual({ kind: 'every', every: '30m' })
  })

  it('errors with no fields to update', async () => {
    await run(issueCreateFactory.build(ctx()), { id: 'x', title: 'x' })
    const res = await run(issueUpdateFactory.build(ctx()), { id: 'x' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/no fields/)
  })

  it('returns a not-found error for a missing issue (never throws)', async () => {
    const res = await run(issueUpdateFactory.build(ctx()), { id: 'ghost', status: 'done' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/no such issue/)
  })
})

describe('issue_comment', () => {
  it('appends a ws-authored comment into the issue body', async () => {
    await run(issueCreateFactory.build(ctx()), { id: 'c1', title: 'commentable', body: 'desc' })
    const res = await run(issueCommentFactory.build(ctx()), { id: 'c1', text: 'progress note' })
    expect(res.ok).toBe(true)
    const issue = await readBack('c1')
    expect(issue?.body).toMatch(/## Comments/)
    expect(issue?.body).toMatch(/\*\*ws:auto-quant\*\*/)
    expect(issue?.body).toMatch(/progress note/)
  })

  it('errors cleanly on a missing issue', async () => {
    const res = await run(issueCommentFactory.build(ctx()), { id: 'nope', text: 'hi' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/no such issue/)
  })
})

describe('issue_list / issue_show', () => {
  it('lists compact rows and shows one in full', async () => {
    await run(issueCreateFactory.build(ctx()), { id: 'a', title: 'Alpha', priority: 'high' })
    await run(issueCreateFactory.build(ctx()), { id: 'b', title: 'Beta' })
    const list = await run(issueListFactory.build(ctx()), {})
    expect(list.ok).toBe(true)
    expect((list.issues as Array<{ id: string }>).map((i) => i.id).sort()).toEqual(['a', 'b'])

    const show = await run(issueShowFactory.build(ctx()), { id: 'a' })
    expect(show.ok).toBe(true)
    expect(show.issue).toMatchObject({ id: 'a', title: 'Alpha', priority: 'high' })
  })

  it('issue_list returns empty (not an error) when no issues dir exists', async () => {
    const list = await run(issueListFactory.build(ctx()), {})
    expect(list.ok).toBe(true)
    expect(list.issues).toEqual([])
  })

  it('issue_show errors on a missing issue', async () => {
    const res = await run(issueShowFactory.build(ctx()), { id: 'missing' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/no such issue/)
  })
})

describe('workspace resolution failures', () => {
  it('errors cleanly when the resolver is unwired', async () => {
    const res = await run(issueListFactory.build(ctx({ resolveWorkspace: undefined })), {})
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/unavailable/)
  })

  it('errors cleanly when this workspace cannot be located', async () => {
    const res = await run(issueListFactory.build(ctx({ resolveWorkspace: () => null })), {})
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/cannot locate/)
  })
})
