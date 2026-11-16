'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CheckCircle2, Info, Lock, Mail, User } from 'lucide-react'

import AuthLayout from '@components/Auth/AuthLayout'
import { useAuth } from '@components/Contexts/AuthContext'
import { postAuthPathForSession } from '@services/auth/redirects'

interface LoginClientProps {
  org: any
}

const GMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@gmail\.com$/i
const STATUS_TOKEN_KEY = 'lh_access_status_token'

type Mode = 'login' | 'request'
type Notice = { kind: 'sent' | 'error'; message: string } | null

export default function LoginClient({ org }: LoginClientProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { signIn } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)

  const resetMessages = () => {
    setError('')
    setNotice(null)
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    resetMessages()

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) {
      setError(t('validation.required', { defaultValue: 'This field is required' }))
      return
    }

    setSubmitting(true)
    try {
      const result: any = await signIn('credentials', {
        redirect: false,
        email: cleanEmail,
        password,
        orgSlug: org?.slug,
        callbackUrl: '/',
      })

      if (result?.ok) {
        const session = await fetch('/api/v1/users/session', {
          credentials: 'include',
          cache: 'no-store',
        })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
        window.location.href = postAuthPathForSession(session)
        return
      }

      let parsed: any = {}
      try {
        parsed = JSON.parse(result?.error || '{}')
      } catch {
        parsed = {}
      }

      if (parsed?.code === 'ACCESS_PENDING' && parsed?.status_token) {
        try {
          sessionStorage.setItem(STATUS_TOKEN_KEY, parsed.status_token)
        } catch {
          /* private mode: the pending page can still ask to sign in again */
        }
        router.push('/pending')
        return
      }

      if (parsed?.code === 'ACCESS_REJECTED') {
        setError(t('auth.access_rejected', {
          defaultValue: 'Your access request was declined. Contact an administrator.',
        }))
        return
      }

      setError(parsed?.message || t('auth.wrong_email_password', {
        defaultValue: 'Incorrect email or password.',
      }))
    } catch {
      setError(t('auth.errors.login_failed', { defaultValue: 'Sign-in failed. Please try again.' }))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    resetMessages()

    const cleanEmail = email.trim().toLowerCase()
    if (!GMAIL_RE.test(cleanEmail)) {
      setError(t('auth.gmail_only', {
        defaultValue: 'Registration is available only for @gmail.com addresses.',
      }))
      return
    }
    if (!password) {
      setError(t('validation.required', { defaultValue: 'This field is required' }))
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/v1/auth/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = data?.detail
        setError(
          (typeof detail === 'string' ? detail : detail?.message) ||
            t('auth.access_request_failed', { defaultValue: 'Could not send the request.' }),
        )
        return
      }
      setNotice({
        kind: 'sent',
        message: t('auth.access_request_sent', {
          defaultValue:
            'Request received. An administrator will review it and assign your role. You can sign in once it is approved.',
        }),
      })
      setMode('login')
    } catch {
      setError(t('auth.access_request_failed', { defaultValue: 'Could not send the request.' }))
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'box-border w-full bg-neutral-50 text-black rounded-lg px-4 border border-neutral-200 inline-flex h-[44px] appearance-none items-center focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-400 transition-all placeholder:text-black/25 text-sm'

  return (
    <AuthLayout
      org={org}
      welcomeText={t('auth.login_to', { defaultValue: 'Sign in to your organization' })}
      title={t('auth.image_title_login', { defaultValue: 'Welcome back to LearnHouse.' })}
      subtitle={t('auth.image_subtitle_login', {
        defaultValue: 'Your courses, students, and tools are waiting.',
      })}
    >
      <div className="flex-1 flex items-center justify-center px-6 md:px-12 lg:px-20">
        <div className="w-full max-w-[420px] py-10">
          <h1 className="text-[28px] md:text-[32px] font-black text-black tracking-tight leading-tight">
            {mode === 'login'
              ? t('auth.welcome_back', { defaultValue: 'Welcome back' })
              : t('auth.request_access_title', { defaultValue: 'Request access' })}
          </h1>
          <p className="mt-2 text-black/45 text-[15px] font-medium">
            {mode === 'login'
              ? t('auth.enter_credentials', { defaultValue: 'Enter your credentials to continue.' })
              : t('auth.request_access_subtitle', {
                  defaultValue:
                    'Registration is limited to @gmail.com. An administrator approves every account.',
                })}
          </p>

          {notice?.kind === 'sent' && (
            <div className="mt-6 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-start gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>{notice.message}</span>
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <Info size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : handleRequest} className="mt-8 space-y-4">
            {mode === 'request' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold text-black/70 mb-1.5">
                    {t('auth.first_name', { defaultValue: 'First name' })}
                  </label>
                  <div className="relative">
                    <User size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-black/30" />
                    <input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      className={`${inputClass} ps-9`}
                      autoComplete="given-name"
                      placeholder="Ivan"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-black/70 mb-1.5">
                    {t('auth.last_name', { defaultValue: 'Last name' })}
                  </label>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className={inputClass}
                    autoComplete="family-name"
                    placeholder="Ivanov"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-semibold text-black/70 mb-1.5">
                {t('auth.email', { defaultValue: 'Email' })}
              </label>
              <div className="relative">
                <Mail size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-black/30" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={`${inputClass} ps-9`}
                  autoComplete="email"
                  placeholder="you@gmail.com"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-black/70 mb-1.5">
                {t('auth.password', { defaultValue: 'Password' })}
              </label>
              <div className="relative">
                <Lock size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-black/30" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClass} ps-9`}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                />
              </div>
              {mode === 'request' && (
                <p className="mt-1.5 text-xs text-black/35">
                  {t('auth.password_rules', {
                    defaultValue:
                      'At least 8 characters, with upper/lower case, a number and a special character.',
                  })}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="box-border w-full inline-flex h-[44px] rounded-lg items-center justify-center bg-black hover:bg-black/85 text-white px-[15px] font-bold text-[14px] leading-none mt-2 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center space-x-2">
                  <span className="w-4 h-4 border-t-2 border-white rounded-full animate-spin" />
                  <span>{t('common.loading', { defaultValue: 'Loading' })}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {mode === 'login'
                    ? t('auth.login', { defaultValue: 'Sign in' })
                    : t('auth.request_access_submit', { defaultValue: 'Send request' })}
                  <ArrowRight size={15} />
                </span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-black/40">
            {mode === 'login' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('request')
                  resetMessages()
                }}
                className="text-black font-semibold hover:underline"
              >
                {t('auth.request_access_link', { defaultValue: 'Request access' })}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  resetMessages()
                }}
                className="text-black font-semibold hover:underline"
              >
                {t('auth.back_to_login', { defaultValue: 'Back to sign in' })}
              </button>
            )}
          </div>

          <p className="mt-8 text-center text-xs text-black/30">
            {t('auth.access_review_note', {
              defaultValue: 'Accounts are activated by an administrator after review.',
            })}
          </p>

          <p className="mt-2 text-center text-xs text-black/30">
            <Link href="/pending" className="hover:underline">
              {t('auth.check_request_status', { defaultValue: 'Check request status' })}
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}

