'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, Info, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const STATUS_TOKEN_KEY = 'lh_access_status_token'

type Status = 'loading' | 'pending' | 'approved' | 'rejected' | 'error' | 'missing'

export default function PendingAccessPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>('loading')
  const [email, setEmail] = useState('')

  const load = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/v1/auth/access-status', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!response.ok) {
        setStatus('error')
        return
      }
      const data = await response.json()
      setEmail(data?.email || '')
      if (data?.status === 'approved') setStatus('approved')
      else if (data?.status === 'rejected') setStatus('rejected')
      else setStatus('pending')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let token: string | null = null
    try {
      token = sessionStorage.getItem(STATUS_TOKEN_KEY)
    } catch {
      token = null
    }
    if (!token) {
      setStatus('missing')
      return
    }
    setStatus('loading')
    void load(token)
    const interval = setInterval(() => void load(token as string), 5000)
    return () => clearInterval(interval)
  }, [load])

  const card = (() => {
    if (status === 'loading') {
      return (
        <div className="flex flex-col items-center text-center">
          <div className="w-8 h-8 border-2 border-black/15 border-t-black rounded-full animate-spin" />
          <p className="mt-4 text-sm text-black/40">
            {t('common.loading', { defaultValue: 'Loading' })}
          </p>
        </div>
      )
    }

    if (status === 'missing') {
      return (
        <div className="flex flex-col items-center text-center">
          <Info size={32} className="text-black/30" />
          <h1 className="mt-4 text-2xl font-bold">Проверка заявки</h1>
          <p className="mt-2 text-sm text-black/45 max-w-sm">
            {t('auth.pending_missing', {
              defaultValue:
                'We could not find a status token in this browser. Sign in with the same e-mail to check your request again.',
            })}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-[44px] items-center justify-center rounded-lg bg-black px-6 text-sm font-bold text-white hover:bg-black/85"
          >
            {t('auth.back_to_login', { defaultValue: 'Back to sign in' })}
          </Link>
        </div>
      )
    }

    if (status === 'approved') {
      return (
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 size={34} className="text-green-600" />
          <h1 className="mt-4 text-2xl font-bold">
            {t('auth.pending_approved_title', { defaultValue: 'Access approved' })}
          </h1>
          <p className="mt-2 text-sm text-black/45 max-w-sm">
            {t('auth.pending_approved_body', {
              defaultValue: 'Your account has been activated. You can sign in now.',
            })}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-[44px] items-center justify-center rounded-lg bg-black px-6 text-sm font-bold text-white hover:bg-black/85"
          >
            {t('auth.login', { defaultValue: 'Sign in' })}
          </Link>
        </div>
      )
    }

    if (status === 'rejected') {
      return (
        <div className="flex flex-col items-center text-center">
          <XCircle size={34} className="text-red-500" />
          <h1 className="mt-4 text-2xl font-bold">
            {t('auth.pending_rejected_title', { defaultValue: 'Request declined' })}
          </h1>
          <p className="mt-2 text-sm text-black/45 max-w-sm">
            {t('auth.pending_rejected_body', {
              defaultValue:
                'An administrator declined this request. Contact your organization if you think this is a mistake.',
            })}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-[44px] items-center justify-center rounded-lg border border-neutral-200 px-6 text-sm font-semibold text-black hover:bg-neutral-50"
          >
            {t('auth.back_to_login', { defaultValue: 'Back to sign in' })}
          </Link>
        </div>
      )
    }

    if (status === 'error') {
      return (
        <div className="flex flex-col items-center text-center">
          <Info size={32} className="text-black/30" />
          <h1 className="mt-4 text-2xl font-bold">
            {t('auth.pending_error_title', { defaultValue: 'Could not check the status' })}
          </h1>
          <p className="mt-2 text-sm text-black/45 max-w-sm">
            {t('auth.pending_error_body', {
              defaultValue: 'The status link may have expired. Sign in again to request a fresh check.',
            })}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-[44px] items-center justify-center rounded-lg bg-black px-6 text-sm font-bold text-white hover:bg-black/85"
          >
            {t('auth.back_to_login', { defaultValue: 'Back to sign in' })}
          </Link>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center text-center">
        <Clock size={34} className="text-amber-500" />
        <h1 className="mt-4 text-2xl font-bold">
          {t('auth.pending_title', { defaultValue: 'Waiting for approval' })}
        </h1>
        <p className="mt-2 text-sm text-black/45 max-w-sm">
          {email
            ? t('auth.pending_body_email', {
                defaultValue:
                  'The request for {{email}} is being reviewed by an administrator. This page checks the status automatically.',
                email,
              })
            : t('auth.pending_body', {
                defaultValue:
                  'Your request is being reviewed by an administrator. This page checks the status automatically.',
              })}
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs text-black/30">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          {t('auth.pending_refreshing', { defaultValue: 'Checking every 5 seconds' })}
        </div>
        <Link href="/login" className="mt-6 text-sm font-semibold text-black hover:underline">
          {t('auth.back_to_login', { defaultValue: 'Back to sign in' })}
        </Link>
      </div>
    )
  })()

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">{card}</div>
    </div>
  )
}
