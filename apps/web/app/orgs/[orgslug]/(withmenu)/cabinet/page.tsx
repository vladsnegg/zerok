'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  UserRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { RequestBodyWithAuthHeader, asArray } from '@services/utils/ts/requests'
import TeacherCabinetHome from './teacher-home'

type TrailRun = {
  id: number
  course_id?: number
  status?: string
  course?: any
  steps?: any[]
  course_total_steps?: number
  update_date?: string
}

type CalendarEvent = any

/**
 * The cabinet is home for both learners and instructors: learners get their
 * learning view, instructors a teaching view with the same shell.
 */
export default function CabinetPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = React.use(params)
  const session = useLHSession() as any
  const { isAdmin, loading: rightsLoading } = useAdminStatus() as any

  // While the role is being resolved, keep the skeleton neutral so neither
  // view flashes before we know who is asking.
  if (rightsLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-10">
        <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    )
  }

  if (isAdmin) {
    return <TeacherCabinetHome orgslug={orgslug} />
  }
  return <StudentCabinetView orgslug={orgslug} />
}

function StudentCabinetView({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const user = session?.data?.user

  const [runs, setRuns] = useState<TrailRun[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    const load = async () => {
      try {
        const [trailRes, calendarRes] = await Promise.all([
          fetch(`${getAPIUrl()}trail/`, RequestBodyWithAuthHeader('GET', null, null, token)),
          fetch(`${getAPIUrl()}calendar`, RequestBodyWithAuthHeader('GET', null, null, token)),
        ])

        if (!cancelled && trailRes.ok) {
          const trail = await trailRes.json().catch(() => null)
          setRuns(asArray<TrailRun>(trail?.runs))
        }
        if (!cancelled && calendarRes.ok) {
          const calendar = await calendarRes.json().catch(() => null)
          setEvents(Array.isArray(calendar) ? calendar : asArray(calendar?.events))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  const stats = useMemo(() => {
    const inProgress = runs.filter((run) => run.status === 'STATUS_IN_PROGRESS').length
    const completed = runs.filter((run) => run.status === 'STATUS_COMPLETED').length
    return { total: runs.length, inProgress, completed }
  }, [runs])

  const progressOf = (run: TrailRun) => {
    const total = run.course_total_steps || 0
    const done = (run.steps || []).length
    if (!total) return 0
    return Math.min(100, Math.round((done / total) * 100))
  }

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/35">
            {t('cabinet.eyebrow', { defaultValue: 'My learning' })}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black">
            {displayName
              ? t('cabinet.welcome_name', { defaultValue: 'Welcome, {{name}}', name: displayName })
              : t('cabinet.welcome', { defaultValue: 'Welcome' })}
          </h1>
          <p className="mt-1 text-sm text-black/45">
            {t('cabinet.subtitle', {
              defaultValue: 'Your courses, deadlines and progress in one place.',
            })}
          </p>
        </div>
        <Link
          href={getUriWithOrg(orgslug, '/courses')}
          className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white hover:bg-black/85"
        >
          <BookOpen size={16} />
          {t('cabinet.browse_courses', { defaultValue: 'Browse courses' })}
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <BookOpen size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('cabinet.courses', { defaultValue: 'Courses' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <Clock3 size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('cabinet.in_progress', { defaultValue: 'In progress' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{stats.inProgress}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <CheckCircle2 size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('cabinet.completed', { defaultValue: 'Completed' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{stats.completed}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-black">
              {t('cabinet.my_courses', { defaultValue: 'My courses' })}
            </h2>
            <Link
              href={getUriWithOrg(orgslug, '/trail')}
              className="text-xs font-semibold text-black/45 hover:text-black"
            >
              {t('cabinet.full_trail', { defaultValue: 'Full trail' })}
            </Link>
          </div>

          {loading && (
            <p className="mt-6 text-sm text-black/35">
              {t('common.loading', { defaultValue: 'Loading' })}
            </p>
          )}

          {!loading && runs.length === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-neutral-200 p-6 text-center">
              <GraduationCap size={22} className="mx-auto text-black/25" />
              <p className="mt-2 text-sm text-black/45">
                {t('cabinet.no_courses', {
                  defaultValue: 'You have not started a course yet.',
                })}
              </p>
              <Link
                href={getUriWithOrg(orgslug, '/courses')}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-black hover:underline"
              >
                {t('cabinet.find_course', { defaultValue: 'Find a course' })}
                <ArrowRight size={14} />
              </Link>
            </div>
          )}

          <ul className="mt-4 divide-y divide-neutral-100">
            {runs.map((run) => {
              const course = run.course || {}
              const uuid = course.course_uuid || course.uuid
              const title = course.name || `Course #${run.course_id}`
              const percent = progressOf(run)
              return (
                <li key={run.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-black">{title}</p>
                      <p className="mt-0.5 text-xs text-black/35">
                        {run.status === 'STATUS_COMPLETED'
                          ? t('cabinet.status_completed', { defaultValue: 'Completed' })
                          : t('cabinet.status_in_progress', { defaultValue: 'In progress' })}
                      </p>
                    </div>
                    {uuid && (
                      <Link
                        href={getUriWithOrg(orgslug, `/course/${uuid}`)}
                        className="shrink-0 text-xs font-semibold text-black/50 hover:text-black"
                      >
                        {t('cabinet.continue', { defaultValue: 'Open' })}
                      </Link>
                    )}
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-black" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-1 text-end text-[11px] text-black/30">{percent}%</p>
                </li>
              )
            })}
          </ul>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-black/45" />
              <h2 className="text-sm font-bold text-black">
                {t('cabinet.deadlines', { defaultValue: 'Deadlines & events' })}
              </h2>
            </div>
            {loading && <p className="mt-4 text-sm text-black/35">…</p>}
            {!loading && events.length === 0 && (
              <p className="mt-4 text-sm text-black/40">
                {t('cabinet.no_events', { defaultValue: 'Nothing scheduled.' })}
              </p>
            )}
            <ul className="mt-4 space-y-3">
              {events.slice(0, 5).map((event, index) => (
                <li key={event.id ?? index} className="text-sm">
                  <p className="font-medium text-black">
                    {event.title || event.name || t('cabinet.event', { defaultValue: 'Event' })}
                  </p>
                  {(event.start || event.date || event.due_date) && (
                    <p className="text-xs text-black/35">
                      {new Date(event.start || event.date || event.due_date).toLocaleString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <Link
              href={getUriWithOrg(orgslug, '/calendar')}
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-black/45 hover:text-black"
            >
              {t('cabinet.open_calendar', { defaultValue: 'Open calendar' })}
              <ArrowRight size={12} />
            </Link>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <UserRound size={16} className="text-black/45" />
              <h2 className="text-sm font-bold text-black">
                {t('cabinet.account', { defaultValue: 'Account' })}
              </h2>
            </div>
            <p className="mt-3 text-sm text-black/45">{user?.email}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={getUriWithOrg(orgslug, '/account/general')}
                className="text-xs font-semibold text-black/50 hover:text-black"
              >
                {t('cabinet.account_settings', { defaultValue: 'Account settings' })}
              </Link>
              <Link
                href={getUriWithOrg(orgslug, '/account/security')}
                className="text-xs font-semibold text-black/50 hover:text-black"
              >
                {t('cabinet.security', { defaultValue: 'Security' })}
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

