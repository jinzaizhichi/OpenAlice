import { http, HttpResponse } from 'msw'
import { demoIssueDetail, demoIssuesSnapshot } from '../fixtures/issues'

// GET /api/issues returns the aggregated board SNAPSHOT (workspaces[].issues[]),
// produced server-side by scanning every workspace's `.alice/issues/<id>.md`
// dir — same shape family as /api/schedule, but the read-only board surface
// (no markdown body in the list; Phase 2 detail view loads it). The demo just
// passes the snapshot fixture through.
//
// GET /api/issues/:wsId/:id is the Phase 2a read-only DETAIL: one issue's full
// fields (body + scheduling frontmatter) + its headless run history (Activity
// feed). demoIssueDetail derives the display fields from the same board snapshot
// and returns null for an unknown (wsId, id) pair → 404 (mirrors the real route).
export const issuesHandlers = [
  http.get('/api/issues', () => HttpResponse.json(demoIssuesSnapshot)),
  http.get('/api/issues/:wsId/:id', ({ params }) => {
    const detail = demoIssueDetail(String(params.wsId), String(params.id))
    return detail
      ? HttpResponse.json(detail)
      : HttpResponse.json({ error: 'not_found' }, { status: 404 })
  }),
]
