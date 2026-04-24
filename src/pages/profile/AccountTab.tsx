// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'
import type { User } from '../../types'
import { FieldRow, SectionHeading, buttonPrimaryClass, cardClass, inputClass } from './shared'

// AccountTab combines the original "Profile" and "Security" sections — both
// are identity-related and belong on the same surface. Username + display
// name + email live here, as does the change-password form.
export default function AccountTab() {
  const { user, callApi, updateUser } = useAuth()
  const { show: showToast } = useToast()

  // ── Profile form ──
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [profileSaving, setProfileSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name)
      setEmail(user.email)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedName = displayName.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName || !trimmedEmail) return
    setProfileSaving(true)
    try {
      const updated = await callApi<User>('/api/v1/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ display_name: trimmedName, email: trimmedEmail }),
      })
      updateUser(updated)
      showToast('Profile updated', { variant: 'success' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile', { variant: 'error' })
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Password form ──
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', { variant: 'error' })
      return
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', { variant: 'error' })
      return
    }
    setPasswordSaving(true)
    try {
      await callApi('/api/v1/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      showToast('Password changed', { variant: 'success' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password', { variant: 'error' })
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading label="Profile" />
        <form onSubmit={handleProfileSave} className={cardClass}>
          <FieldRow label="Username">
            <p className="text-sm text-gray-700 dark:text-gray-300">{user?.username}</p>
          </FieldRow>
          <FieldRow label="Display name" htmlFor="display-name">
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoComplete="name"
              className={inputClass}
            />
          </FieldRow>
          <FieldRow label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className={inputClass}
            />
          </FieldRow>
          <div className="px-6 py-4 flex justify-end">
            <button
              type="submit"
              disabled={profileSaving || !displayName.trim() || !email.trim()}
              className={buttonPrimaryClass}
            >
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <SectionHeading label="Security" />
        <form onSubmit={handlePasswordChange} className={cardClass}>
          <FieldRow label="Current password" htmlFor="current-password">
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className={inputClass}
            />
          </FieldRow>
          <FieldRow label="New password" htmlFor="new-password">
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </FieldRow>
          <FieldRow label="Confirm new password" htmlFor="confirm-password">
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </FieldRow>
          <div className="px-6 py-4 flex justify-end">
            <button
              type="submit"
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className={buttonPrimaryClass}
            >
              {passwordSaving ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
