import { describe, expect, it } from 'vitest'

import { getView } from './registry'

describe('file-viewer URL projection', () => {
  it('projects Ask Alice artifacts into the chat route with Session context', () => {
    expect(getView('file-viewer').toUrl({
      kind: 'file-viewer',
      params: {
        wsId: 'chat-1',
        path: 'research/note.md',
        source: 'chat',
        returnSessionId: 'pi-crisp-granite-pencil',
      },
    })).toBe(
      '/chat/workspaces/chat-1/view/research%2Fnote.md?sessionId=pi-crisp-granite-pencil',
    )
  })

  it('preserves the existing Workspace file URL', () => {
    expect(getView('file-viewer').toUrl({
      kind: 'file-viewer',
      params: { wsId: 'workspace-1', path: 'README.md' },
    })).toBe('/workspaces/workspace-1/view/README.md')
  })
})
