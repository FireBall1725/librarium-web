// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'
import { PIN_MAX, pinProblem } from '../../lib/pin'
import { FieldRow, SectionHeading, buttonPrimaryClass, buttonSecondaryClass, cardClass, inputClass } from './shared'

// A short PIN for quick sign-ins where a password is impractical, such as a
// library kiosk. The server only ever says whether one is set; the PIN itself
// lives in component state while it is typed and is cleared as soon as the
// form closes, so it is never shown back or written anywhere.
export default function PinSection() {
  const { t } = useTranslation()
  const { callApi } = useAuth()
  const { show: showToast } = useToast()

  const [isSet, setIsSet] = useState<boolean | null>(null)
  const [editing, setEditing] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    callApi<{ set: boolean }>('/api/v1/me/pin')
      .then(r => setIsSet(Boolean(r?.set)))
      .catch(() => setIsSet(false))
  }, [callApi])

  const closeForm = () => {
    setEditing(false)
    setPin('')
    setConfirmPin('')
    setAttempted(false)
    setServerError(null)
  }

  const problem = pinProblem(pin, confirmPin)
  const problemText =
    problem === 'format'
      ? t('pin.error_format', { defaultValue: 'A PIN is 4 to 8 digits.' })
      : problem === 'mismatch'
        ? t('pin.error_mismatch', { defaultValue: "The two PINs don't match." })
        : null

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    setServerError(null)
    if (problem) return
    setSaving(true)
    try {
      await callApi('/api/v1/me/pin', { method: 'PUT', body: JSON.stringify({ pin }) })
      setIsSet(true)
      closeForm()
      showToast(t('pin.saved', { defaultValue: 'PIN saved' }), { variant: 'success' })
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('pin.save_failed', { defaultValue: "Couldn't save the PIN" }))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm(t('pin.remove_confirm', {
      defaultValue: 'Remove your PIN? You won\'t be able to use it for a quick sign-in until you set a new one.',
    }))) return
    setSaving(true)
    try {
      await callApi('/api/v1/me/pin', { method: 'DELETE' })
      setIsSet(false)
      closeForm()
      showToast(t('pin.removed', { defaultValue: 'PIN removed' }), { variant: 'success' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('pin.remove_failed', { defaultValue: "Couldn't remove the PIN" }), { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // Digits only, and no more than the server takes, so a stray letter or a
  // ninth digit never reaches the field in the first place.
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, PIN_MAX)

  return (
    <section>
      <SectionHeading label={t('pin.heading', { defaultValue: 'PIN' })} />
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            {isSet === null ? (
              <div className="h-5 w-16 animate-pulse rounded bg-surface-strong" />
            ) : (
              <span className="rounded bg-surface-inset px-2 py-0.5 text-xs font-medium text-content-tertiary">
                {isSet
                  ? t('pin.status_set', { defaultValue: 'Set' })
                  : t('pin.status_not_set', { defaultValue: 'Not set' })}
              </span>
            )}
            <p className="mt-1.5 text-xs text-content-muted">
              {t('pin.description', {
                defaultValue:
                  "Optional. A short number that identifies you for a quick sign-in where typing your password isn't practical, like a library kiosk.",
              })}
            </p>
          </div>
          {isSet !== null && !editing && (
            <div className="flex flex-shrink-0 items-center gap-3">
              {isSet && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={saving}
                  className="text-xs text-danger transition-colors hover:text-danger-strong disabled:opacity-60"
                >
                  {t('pin.remove', { defaultValue: 'Remove' })}
                </button>
              )}
              <button type="button" onClick={() => setEditing(true)} className={buttonSecondaryClass}>
                {isSet
                  ? t('pin.change', { defaultValue: 'Change PIN' })
                  : t('pin.set', { defaultValue: 'Set PIN' })}
              </button>
            </div>
          )}
        </div>

        {editing && (
          <form onSubmit={handleSave} noValidate>
            <div className="grid sm:grid-cols-2">
              <FieldRow label={t('pin.new_pin', { defaultValue: 'New PIN' })} htmlFor="pin-new">
                <input
                  id="pin-new"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={PIN_MAX}
                  value={pin}
                  onChange={e => setPin(digits(e.target.value))}
                  aria-invalid={attempted && problem === 'format'}
                  aria-describedby="pin-hint"
                  className={inputClass}
                />
              </FieldRow>
              <FieldRow label={t('pin.confirm_pin', { defaultValue: 'Confirm PIN' })} htmlFor="pin-confirm">
                <input
                  id="pin-confirm"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={PIN_MAX}
                  value={confirmPin}
                  onChange={e => setConfirmPin(digits(e.target.value))}
                  aria-invalid={attempted && problem === 'mismatch'}
                  className={inputClass}
                />
              </FieldRow>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4">
              {(attempted && problemText) || serverError ? (
                <p role="alert" className="mr-auto text-sm text-danger">
                  {serverError ?? problemText}
                </p>
              ) : (
                <p id="pin-hint" className="mr-auto text-xs text-content-muted">
                  {t('pin.hint', { defaultValue: '4 to 8 digits.' })}
                </p>
              )}
              <button type="button" onClick={closeForm} disabled={saving} className={buttonSecondaryClass}>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button type="submit" disabled={saving || !pin || !confirmPin} className={buttonPrimaryClass}>
                {saving
                  ? t('pin.saving', { defaultValue: 'Saving…' })
                  : t('pin.save', { defaultValue: 'Save PIN' })}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
