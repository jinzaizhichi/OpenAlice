/**
 * Reusable preset-enumeration form controls, shared by the AI Provider
 * credential vault and the per-workspace AI config modal.
 *
 * - EndpointField: a region/endpoint <select> built from a preset's enumerated
 *   endpoints, PLUS a "Custom…" escape that never loses a stored non-listed URL
 *   (a bare <select> would silently overwrite a custom endpoint with the first
 *   option on save). When the preset has no endpoints, it degrades to free text.
 * - ModelCombobox: an <input> backed by a <datalist> of suggested models. The
 *   suggestions curb typos (minimax-m3 vs MiniMax-M3) for known vendors while
 *   still allowing a free-typed model id (no version-lock) — and for custom /
 *   unrecognized providers it's just a plain input.
 */

import { useId, useState } from 'react'
import { inputClass } from '../form'
import type { LabeledOption } from '../../lib/presetHelpers'

const CUSTOM = '__custom__'

export function EndpointField({ value, endpoints, onChange, placeholder }: {
  value: string
  endpoints: LabeledOption[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  // No enumeration → plain free text (claude-api / codex-api / gemini / custom).
  if (endpoints.length === 0) {
    return (
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'leave empty for the official endpoint'}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    )
  }

  const known = endpoints.some((e) => e.id === value)
  // Start in custom mode if the stored value is a non-listed, non-empty URL —
  // so editing a credential with a proxy/self-host endpoint keeps it.
  const [custom, setCustom] = useState(!known && value.trim() !== '')
  const showCustom = custom || (!known && value.trim() !== '')

  return (
    <div className="space-y-2">
      <select
        className={inputClass}
        value={showCustom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true)
            // keep the current value so the free-text box is pre-filled
          } else {
            setCustom(false)
            onChange(e.target.value)
          }
        }}
      >
        {endpoints.map((e) => (
          <option key={e.id} value={e.id}>{e.label}</option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {showCustom && (
        <input
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'https://…'}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      )}
    </div>
  )
}

export function ModelCombobox({ value, suggestions, onChange, placeholder }: {
  value: string
  suggestions: LabeledOption[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const listId = useId()
  return (
    <>
      <input
        className={inputClass}
        list={suggestions.length > 0 ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'model id'}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {/* Chromium shows the option value (the model id), which is the
              human-meaningful string here; the label is a hint where supported. */}
          {suggestions.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </datalist>
      )}
    </>
  )
}
