import { describe, expect, it } from 'vitest'

import {
  agentWireShapes,
  anthropicAuthModeForBaseUrl,
  baseUrlToVendor,
  pickAgentWire,
} from './presetHelpers'

const multiWire = {
  anthropic: 'https://provider.example/anthropic',
  'openai-chat': 'https://provider.example/v1',
} as const

describe('agent wire selection', () => {
  it('lists every compatible Pi/opencode protocol in runtime preference order', () => {
    expect(agentWireShapes(multiWire, 'pi')).toEqual(['openai-chat', 'anthropic'])
    expect(agentWireShapes(multiWire, 'opencode')).toEqual(['openai-chat', 'anthropic'])
  })

  it('honors an explicit compatible protocol and rejects an incompatible one', () => {
    expect(pickAgentWire(multiWire, 'pi', 'anthropic')).toEqual({
      shape: 'anthropic',
      baseUrl: 'https://provider.example/anthropic',
    })
    expect(pickAgentWire(multiWire, 'codex', 'anthropic')).toBeNull()
  })
})

describe('provider inference', () => {
  it('recognizes the native Gemini endpoint', () => {
    expect(baseUrlToVendor('https://generativelanguage.googleapis.com/v1beta')).toBe('google')
  })

  it('keeps UI Anthropic auth inference aligned with the backend', () => {
    expect(anthropicAuthModeForBaseUrl('https://api.minimaxi.com/anthropic')).toBe('bearer')
    expect(anthropicAuthModeForBaseUrl('https://api.minimax.io/anthropic')).toBe('bearer')
    expect(anthropicAuthModeForBaseUrl('https://api.longcat.chat/anthropic')).toBe('bearer')
    expect(anthropicAuthModeForBaseUrl('https://api.anthropic.com')).toBe('x-api-key')
  })
})
