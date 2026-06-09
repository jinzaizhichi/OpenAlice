/**
 * Built-in keyless read-only data UTAs (binance/okx/bybit-readonly) — verify the
 * code-injection path constructs them correctly (no API key) so they auto-register
 * for OOTB crypto K-lines. Pure construction; no network.
 */
import { describe, it, expect } from 'vitest'
import { createBroker } from './brokers/factory.js'
import type { UTAConfig } from '@/core/config.js'

function cfgFor(ex: string): UTAConfig {
  return {
    id: `${ex}-readonly`, label: `${ex} (read-only)`, presetId: 'ccxt-custom',
    enabled: true, guards: [], presetConfig: { exchange: ex },
    keyless: true, readOnly: true, editable: false,
  } as unknown as UTAConfig
}

describe('keyless data UTA injection (createBroker)', () => {
  for (const ex of ['binance', 'okx', 'bybit']) {
    it(`${ex}-readonly: constructs a keyless broker (no throw, keyless flag flows)`, () => {
      let broker: unknown
      expect(() => { broker = createBroker(cfgFor(ex)) }).not.toThrow()
      expect((broker as { id: string }).id).toBe(`${ex}-readonly`)
      // keyless must reach the broker (factory → fromConfig → constructor) so
      // init() skips the credential check.
      expect((broker as Record<string, unknown>).keyless).toBe(true)
      // and it declares the historical-bars capability for the federation.
      expect((broker as { getCapabilities(): { historicalBars?: { supported: boolean } } }).getCapabilities().historicalBars?.supported).toBe(true)
    })
  }
})
