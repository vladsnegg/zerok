'use client'

import React, { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, RefreshCw, UserCheck, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  asArray,
  detailMessage,
} from '@services/utils/ts/requests'

type AccessRequest = {
  id: number
  user_uuid: string
  email: string
  first_name?: string
  last_name?: string
  requested_at?: string
}

const ROLE_OPTIONS = [
  { value: 'student', labelKey: 'roles.student', fallback: 'Student' },
  { value: 'teacher', labelKey: 'roles.teacher', fallback: 'Teacher' },
  { value: 'admin', labelKey: 'roles.admin', fallback: 'Administrator' },
]

export default function OrgAccessRequests() {
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token

  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [roles, setRoles] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!org?.id || !token) return
    setLoading(true)
    try {
      const response = await fetch(
        `${getAPIUrl()}orgs/${org.id}/access-requests`,
        RequestBodyWithAuthHeader('GET', null, null, token),
      )
      const data = await response.json().catch(() => [])
      if (!response.ok) {
        throw new Error(detailMessage(data?.detail, 'Could not load access requests'))
      }
      setRequests(asArray<AccessRequest>(data))
    } catch (error: any) {
      toast.error(error?.message || 'Could not load access requests')
    } finally {
      setLoading(false)
    }
  }, [org?.id, token])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (request: AccessRequest, action: 'approve' | 'reject') => {
    if (!org?.id || !token || busy !== null) return
    setBusy(request.id)
    try {
      const body = action === 'approve' ? { role: roles[request.id] || 'student' } : {}
      const response = await fetch(
        `${getAPIUrl()}orgs/${org.id}/access-requests/${request.id}/${action}`,
        RequestBodyWithAuthHeader('POST', body, null, token),
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(detailMessage(data?.detail, 'Could not update the request'))
      }
      toast.success(
        action === 'approve'
          ? t('dashboard.users.requests.approved', { defaultValue: 'Access approved' })
          : t('dashboard.users.requests.rejected', { defaultValue: 'Request rejected' }),
      )
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Could not update the request')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="px-4 sm:px-10 pb-16 pt-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-black/45">
          {t('dashboard.users.requests.subtitle', {
            defaultValue:
              'New accounts stay locked until an administrator approves them and assigns a role.',
          })}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-black/60 hover:bg-neutral-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('common.refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-black/40">
            <tr>
              <th className="px-4 py-3 font-semibold">E-mail</th>
              <th className="px-4 py-3 font-semibold">
                {t('common.name', { defaultValue: 'Name' })}
              </th>
              <th className="px-4 py-3 font-semibold">
                {t('dashboard.users.requests.requested', { defaultValue: 'Requested' })}
              </th>
              <th className="px-4 py-3 font-semibold">
                {t('dashboard.users.requests.role', { defaultValue: 'Role' })}
              </th>
              <th className="px-4 py-3 text-end font-semibold">
                {t('common.actions', { defaultValue: 'Actions' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && requests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-black/35">
                  {t('common.loading', { defaultValue: 'Loading' })}
                </td>
              </tr>
            )}
            {!loading && requests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-black/35">
                  <UserCheck size={22} className="mx-auto mb-2 opacity-40" />
                  {t('dashboard.users.requests.empty', {
                    defaultValue: 'No pending requests.',
                  })}
                </td>
              </tr>
            )}
            {requests.map((request) => (
              <tr key={request.id} className="border-t border-neutral-100">
                <td className="px-4 py-3 font-medium text-black">{request.email}</td>
                <td className="px-4 py-3 text-black/60">
                  {[request.first_name, request.last_name].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 text-black/40">
                  {request.requested_at
                    ? new Date(request.requested_at).toLocaleString()
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={roles[request.id] || 'student'}
                    onChange={(event) =>
                      setRoles((current) => ({ ...current, [request.id]: event.target.value }))
                    }
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {t(role.labelKey, { defaultValue: role.fallback })}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void decide(request, 'approve')}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-bold text-white hover:bg-black/85 disabled:opacity-50"
                    >
                      <Check size={13} />
                      {t('dashboard.users.requests.approve', { defaultValue: 'Approve' })}
                    </button>
                    <button
                      type="button"
                      onClick={() => void decide(request, 'reject')}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-black/60 hover:bg-neutral-50 disabled:opacity-50"
                    >
                      <X size={13} />
                      {t('dashboard.users.requests.reject', { defaultValue: 'Reject' })}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
