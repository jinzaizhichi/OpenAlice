/**
 * Shared preset-catalog helpers — the single source for turning a serialized
 * Preset (from /api/config/presets) into the enumerations the UI surfaces
 * (endpoint dropdowns, model suggestions) and for resolving a vendor/baseUrl to
 * its preset. Used by both the AI Provider credential vault and the per-workspace
 * AI config modal so the vendor map can't drift between them.
 *
 * The preset is the enumeration backbone: its `endpoints` → schema.baseUrl.oneOf,
 * its `models` → schema.model.oneOf (see src/ai-providers/presets.ts buildJsonSchema).
 */

import type { Preset } from '../api'

export interface LabeledOption {
  id: string
  label: string
}

function schemaProps(schema: Preset['schema']): Record<string, Record<string, unknown>> {
  return (schema?.properties as Record<string, Record<string, unknown>>) ?? {}
}

function oneOf(schema: Preset['schema'], field: string): LabeledOption[] {
  const f = schemaProps(schema)[field] as { oneOf?: Array<{ const: string; title: string }> } | undefined
  return f?.oneOf ? f.oneOf.map((o) => ({ id: o.const, label: o.title })) : []
}

/** Enumerated models for a preset (empty for custom / un-enumerated presets). */
export function presetModels(p: Preset): LabeledOption[] {
  return oneOf(p.schema, 'model')
}

/** Enumerated endpoints (regions) for a preset, e.g. China / International. */
export function presetEndpoints(p: Preset): LabeledOption[] {
  return oneOf(p.schema, 'baseUrl')
}

/** The preset's default baseUrl (first endpoint / declared default), or ''. */
export function presetBaseUrlDefault(p: Preset): string {
  const f = schemaProps(p.schema)['baseUrl'] as { default?: string } | undefined
  if (typeof f?.default === 'string') return f.default
  return presetEndpoints(p)[0]?.id ?? ''
}

/** Only api-key presets belong in the credential vault — oauth ones log in via the CLI. */
export function isApiKeyPreset(p: Preset): boolean {
  return 'apiKey' in schemaProps(p.schema)
}

/** Probe/request shape: agent-sdk backend → anthropic, everything else → openai. */
export function presetShape(p: Preset): 'anthropic' | 'openai' {
  const backend = (schemaProps(p.schema)['backend'] as { const?: string } | undefined)?.const
  return backend === 'agent-sdk' ? 'anthropic' : 'openai'
}

/** Codex speaks the Responses API; openai-compatible gateways speak Chat Completions. */
export function presetWireApi(p: Preset): 'chat' | 'responses' {
  return p.id.startsWith('codex') ? 'responses' : 'chat'
}

/** Vendor tag stored on a credential, by preset id (api-key presets only). */
export const VENDOR_BY_PRESET: Record<string, string> = {
  'claude-api': 'anthropic',
  'codex-api': 'openai',
  gemini: 'google',
  minimax: 'minimax',
  glm: 'glm',
  kimi: 'kimi',
  deepseek: 'deepseek',
  custom: 'custom',
}

/** Reverse: the api-key preset for a vendor (falls back to 'custom'). */
export function vendorPreset(vendor: string, presets: Preset[]): Preset | undefined {
  const presetId = Object.entries(VENDOR_BY_PRESET).find(([, v]) => v === vendor)?.[0]
  return presets.find((p) => p.id === presetId) ?? presets.find((p) => p.id === 'custom')
}

// Mirrors the backend baseUrl→vendor heuristic (src/core/credential-inference.ts
// VENDORS_BY_BASEURL). Kept in sync by hand — it's a tiny, stable map.
const VENDOR_BY_BASEURL: Array<[RegExp, string]> = [
  [/bigmodel\.cn|z\.ai/i, 'glm'],
  [/minimaxi\.com|minimax\.io/i, 'minimax'],
  [/moonshot\.cn|moonshot\.ai/i, 'kimi'],
  [/deepseek\.com/i, 'deepseek'],
]

/**
 * Infer the provider vendor from a baseUrl, used to pick which model list to
 * suggest. A recognized gateway URL wins; otherwise `fallback` (the agent tab's
 * implied vendor, e.g. claude→anthropic, codex→openai) decides. Returns null
 * when nothing is known (e.g. a custom/local endpoint) → caller shows no
 * suggestions (free text), which is correct: custom providers have no catalog.
 */
export function baseUrlToVendor(baseUrl: string | null | undefined, fallback?: string | null): string | null {
  const url = (baseUrl ?? '').trim()
  for (const [pattern, vendor] of VENDOR_BY_BASEURL) {
    if (pattern.test(url)) return vendor
  }
  return fallback ?? null
}
