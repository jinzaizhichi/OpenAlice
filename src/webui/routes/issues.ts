/**
 * /api/issues — read-only Issue board, a Linear-style human+AI surface that
 * aggregates issues across ALL workspaces.
 *
 * Like /api/schedule, this is built by SCANNING each workspace's own
 * `.alice/issues/` directory (one markdown file per issue) — there is NO central
 * store. An issue is a tracked work item; if it additionally carries a `when` it
 * self-schedules, and the row then carries the scanner's firing markers. Creation
 * / edit is NOT a route — issues are a coding task (the agent writes the files).
 * This surface is purely "what issues exist across my workspaces".
 *
 * Phase 2a adds a read-only DETAIL endpoint (GET /api/issues/:wsId/:id) for one
 * issue: its markdown body + scheduling/firing markers + its headless run history
 * (Activity feed). Still no write/edit route — authoring stays a coding task.
 */
import { Hono } from 'hono'

import type { WorkspaceService } from '../../workspaces/service.js'

export function createIssuesRoutes(svc: WorkspaceService): Hono {
  const app = new Hono()

  // GET /api/issues → { workspaces: [{ wsId, tag, status, error?, issues: [...] }] }
  app.get('/', async (c) => {
    return c.json(await svc.issuesSnapshot())
  })

  // GET /api/issues/:wsId/:id → { issue: {...incl. body + markers}, runs: [...] }.
  // 404 when the workspace or the issue id is absent (mirrors the workspaces route
  // convention: `{ error: 'not_found' }`).
  app.get('/:wsId/:id', async (c) => {
    const detail = await svc.issueDetail(c.req.param('wsId'), c.req.param('id'))
    if (!detail) return c.json({ error: 'not_found' }, 404)
    return c.json(detail)
  })

  return app
}
