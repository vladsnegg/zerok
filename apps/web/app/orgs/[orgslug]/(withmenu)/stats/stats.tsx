'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { RequestBodyWithAuthHeader, asArray } from '@services/utils/ts/requests'
import {
  addContest,
  addDefense,
  deleteContest,
  getLeaderboard,
  getMyStats,
  listMyContests,
  type ContestEntry,
  type Leaderboard,
  type MyStats,
  type StatsPeriod,
} from '@services/stats/stats'
import { formatDate } from '@/lib/format'

type TrailRun = {
  id: number
  status?: string
  course?: any
  steps?: any[]
  course_total_steps?: number
}

const PERIODS: StatsPeriod[] = ['week', 'month', 'all']

export default function StatsClient({ orgslug }: { orgslug: string }) {
  const { t, i18n } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const { isAdmin } = useAdminStatus() as any
  const token = session?.data?.tokens?.access_token
  const user = session?.data?.user

  const [period, setPeriod] = useState<StatsPeriod>('month')
  const [scope, setScope] = useState<'organization' | 'course'>('organization')
  const [courseUuid, setCourseUuid] = useState<string | null>(null)
  const [stats, setStats] = useState<MyStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null)
  const [contests, setContests] = useState<ContestEntry[]>([])
  const [runs, setRuns] = useState<TrailRun[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [contestTitle, setContestTitle] = useState('')
  const [contestDate, setContestDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  // Courses the user actually studies (for the course-scope selector).
  useEffect(() => {
    if (!token) return
    let cancelled = false
    Promise.all([
      fetch(`${getAPIUrl()}trail/`, RequestBodyWithAuthHeader('GET', null, null, token))
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch(`${getAPIUrl()}calendar`, RequestBodyWithAuthHeader('GET', null, null, token))
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([trail, calendar]) => {
      if (cancelled) return
      const nextRuns = asArray<TrailRun>(trail?.runs)
      setRuns(nextRuns)
      setEvents(Array.isArray(calendar) ? calendar : asArray(calendar?.events))
      const firstUuid = nextRuns.find((run) => run.course?.course_uuid)?.course?.course_uuid
      if (firstUuid) setCourseUuid((current) => current || String(firstUuid))
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const activeCourseUuid = scope === 'course' ? courseUuid : null

  useEffect(() => {
    if (!token || !org?.id) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getMyStats(org.id, token, period, activeCourseUuid).catch(() => null),
      getLeaderboard(org.id, token, period, activeCourseUuid).catch(() => null),
      listMyContests(org.id, token, period).catch(() => ({ items: [] })),
    ])
      .then(([nextStats, nextLeaderboard, nextContests]) => {
        if (cancelled) return
        setStats(nextStats)
        setLeaderboard(nextLeaderboard)
        setContests(asArray<ContestEntry>(nextContests?.items))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, org?.id, period, activeCourseUuid])

  const refresh = async () => {
    if (!token || !org?.id) return
    const [nextStats, nextLeaderboard, nextContests] = await Promise.all([
      getMyStats(org.id, token, period, activeCourseUuid).catch(() => null),
      getLeaderboard(org.id, token, period, activeCourseUuid).catch(() => null),
      listMyContests(org.id, token, period).catch(() => ({ items: [] })),
    ])
    setStats(nextStats)
    setLeaderboard(nextLeaderboard)
    setContests(asArray<ContestEntry>(nextContests?.items))
  }

  const courseOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: { uuid: string; name: string }[] = []
    for (const run of runs) {
      const uuid = run.course?.course_uuid
      if (!uuid || seen.has(uuid)) continue
      seen.add(uuid)
      options.push({ uuid: String(uuid), name: run.course?.name || t('stats.course', { defaultValue: 'Course' }) })
    }
    return options
  }, [runs, t])

  const upcoming = useMemo(() => {
    const now = Date.now()
    return events
      .map((event) => {
        const raw = event?.start || event?.date || event?.due_date
        const time = raw ? new Date(raw).getTime() : NaN
        return Number.isFinite(time) ? { event, time } : null
      })
      .filter(Boolean)
      .filter((entry: any) => entry.time >= now - 60_000)
      .sort((a: any, b: any) => a.time - b.time)
      .slice(0, 5) as { event: any; time: number }[]
  }, [events])

  const breakdown = stats?.breakdown
  const regularShare = breakdown && breakdown.total_weeks
    ? Math.round((breakdown.active_weeks / breakdown.total_weeks) * 100)
    : 0

  const addContestEntry = async () => {
    if (!token || !org?.id || busy) return
    setBusy(true)
    try {
      await addContest(org.id, token, {
        title: contestTitle.trim(),
        happened_on: contestDate,
      })
      setContestTitle('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const removeContest = async (id: number) => {
    if (!token || !org?.id || busy) return
    setBusy(true)
    try {
      await deleteContest(org.id, token, id)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const markDefense = async (userId: number) => {
    if (!token || !org?.id || busy || !activeCourseUuid) return
    setBusy(true)
    try {
      await addDefense(org.id, token, {
        user_id: userId,
        course_uuid: activeCourseUuid,
        note: 'Cabinet defense',
      })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const periodLabel = (value: StatsPeriod) =>
    value === 'week'
      ? t('stats.period_week', { defaultValue: 'Week' })
      : value === 'month'
        ? t('stats.period_month', { defaultValue: 'Month' })
        : t('stats.period_all', { defaultValue: 'All time' })

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/35">
            {t('stats.eyebrow', { defaultValue: 'Progress' })}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black">
            {t('stats.title', { defaultValue: 'Statistics' })}
          </h1>
          <p className="mt-1 text-sm text-black/45">
            {t('stats.subtitle', {
              defaultValue: 'Regular practice, defenses and deadlines in one place.',
            })}
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={`px-3.5 py-2 text-xs font-bold transition-colors ${
                period === value ? 'bg-black text-white' : 'text-black/50 hover:text-black'
              }`}
            >
              {periodLabel(value)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <Trophy size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('stats.kpi_score', { defaultValue: 'КПД' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{loading ? '—' : Math.round(stats?.score || 0)}</p>
          <p className="mt-1 text-xs text-black/35">
            {t('stats.kpi_regularity', { defaultValue: 'Regularity' })}: {regularShare}%
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <TrendingUp size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('stats.kpi_rank', { defaultValue: 'Rank' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">
            {stats?.rank ? `#${stats.rank}` : '—'}
          </p>
          <p className="mt-1 text-xs text-black/35">
            {t('stats.of_participants', {
              defaultValue: 'of {{count}}',
              count: stats?.participants || 0,
            })}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <ShieldCheck size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('stats.kpi_defenses', { defaultValue: 'Defenses' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{breakdown?.defense_count ?? 0}</p>
          <p className="mt-1 text-xs text-black/35">
            {t('stats.kpi_conversion', { defaultValue: 'Converted to defense' })}:{' '}
            {Math.round((breakdown?.conversion || 0) * 100)}%
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <CheckCircle2 size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('stats.kpi_solved', { defaultValue: 'Tasks solved' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{breakdown?.solved_count ?? 0}</p>
          <p className="mt-1 text-xs text-black/35">
            {t('stats.kpi_contests', { defaultValue: 'Contests' })}: {breakdown?.contest_count ?? 0}
          </p>
        </div>
      </div>

      {/* Leaderboard */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-black">
            <Award size={16} className="text-black/45" />
            {t('stats.leaderboard', { defaultValue: 'Leaderboard' })}
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-black/55">
              {leaderboard?.participants ?? 0}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200">
              <button
                type="button"
                onClick={() => setScope('organization')}
                className={`px-3 py-1.5 text-xs font-bold ${
                  scope === 'organization' ? 'bg-black text-white' : 'text-black/50'
                }`}
              >
                {t('stats.organization', { defaultValue: 'Organization' })}
              </button>
              <button
                type="button"
                onClick={() => setScope('course')}
                className={`px-3 py-1.5 text-xs font-bold ${
                  scope === 'course' ? 'bg-black text-white' : 'text-black/50'
                }`}
              >
                {t('stats.course', { defaultValue: 'Course' })}
              </button>
            </div>
            {scope === 'course' && courseOptions.length > 0 && (
              <select
                value={courseUuid || ''}
                onChange={(event) => setCourseUuid(event.target.value || null)}
                className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-black/70"
              >
                {courseOptions.map((option) => (
                  <option key={option.uuid} value={option.uuid}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {scope === 'course' && courseOptions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-black/40">
            {t('stats.no_course', { defaultValue: 'You are not enrolled in a course yet.' })}
          </p>
        ) : leaderboard && leaderboard.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-start text-[11px] uppercase tracking-wide text-black/35">
                  <th className="px-5 py-2.5 font-semibold">#</th>
                  <th className="px-3 py-2.5 font-semibold">{t('stats.student', { defaultValue: 'Student' })}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('stats.kpi_score', { defaultValue: 'КПД' })}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('stats.kpi_defenses', { defaultValue: 'Defenses' })}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('stats.kpi_solved', { defaultValue: 'Solved' })}</th>
                  {scope === 'course' && isAdmin && <th className="px-3 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {leaderboard.items.map((entry) => {
                  const isMe = entry.user_id === user?.id
                  return (
                    <tr key={entry.user_id} className={isMe ? 'bg-neutral-50' : ''}>
                      <td className="px-5 py-3 font-bold text-black/50">{entry.rank}</td>
                      <td className="px-3 py-3">
                        <span className={`font-semibold ${isMe ? 'text-black' : 'text-black/75'}`}>
                          {entry.name}
                          {isMe && (
                            <span className="ms-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-bold text-white">
                              {t('stats.you', { defaultValue: 'you' })}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-black text-black">{Math.round(entry.score)}</td>
                      <td className="px-3 py-3 text-black/60">{entry.defenses}</td>
                      <td className="px-3 py-3 text-black/60">{entry.solved}</td>
                      {scope === 'course' && isAdmin && (
                        <td className="px-3 py-3 text-end">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => markDefense(entry.user_id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] font-bold text-black/60 hover:text-black disabled:opacity-40"
                          >
                            <ShieldCheck size={12} />
                            {t('stats.add_defense', { defaultValue: 'Defense' })}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-black/40">
            {loading ? t('common.loading', { defaultValue: 'Loading' }) : t('stats.empty_board', { defaultValue: 'No activity in this period yet.' })}
          </p>
        )}
      </section>

      {/* Progress + deadlines */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-black">
              <BookOpen size={16} className="text-black/45" />
              {t('stats.my_courses', { defaultValue: 'My courses' })}
            </h2>
            <Link
              href={getUriWithOrg(orgslug, '/courses')}
              className="text-xs font-semibold text-black/45 hover:text-black"
            >
              {t('stats.all_courses', { defaultValue: 'All courses' })} →
            </Link>
          </div>
          {runs.length === 0 && (
            <p className="mt-4 text-sm text-black/40">
              {t('stats.no_progress', { defaultValue: 'No courses started yet.' })}
            </p>
          )}
          <ul className="mt-2 divide-y divide-neutral-100">
            {runs.map((run) => {
              const course = run.course || {}
              const total = run.course_total_steps || 0
              const done = (run.steps || []).length
              const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0
              const uuid = course.course_uuid ? String(course.course_uuid).replace('course_', '') : null
              return (
                <li key={run.id} className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-black">
                        {course.name || t('stats.course', { defaultValue: 'Course' })}
                      </p>
                      <p className="mt-0.5 text-xs text-black/35">
                        {t('cabinet.lesson_of', {
                          defaultValue: 'Lesson {{current}} of {{total}}',
                          current: done,
                          total,
                        })}{' '}
                        · {percent}%
                      </p>
                    </div>
                    {uuid && (
                      <Link
                        href={getUriWithOrg(orgslug, `/course/${uuid}`)}
                        className="shrink-0 text-xs font-semibold text-black/50 hover:text-black"
                      >
                        {t('cabinet.continue', { defaultValue: 'Continue' })}
                      </Link>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-[#c6ff4a]" style={{ width: `${percent}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-black">
              <CalendarDays size={16} className="text-black/45" />
              {t('stats.deadlines', { defaultValue: 'Deadlines' })}
            </h2>
            {upcoming.length === 0 && (
              <p className="mt-4 text-sm text-black/40">
                {t('cabinet.no_events', { defaultValue: 'Nothing scheduled.' })}
              </p>
            )}
            <ul className="mt-3 space-y-3">
              {upcoming.map(({ event, time }) => (
                <li key={event.id || time} className="text-sm">
                  <p className="font-medium text-black">
                    {event.title || event.name || t('cabinet.event', { defaultValue: 'Event' })}
                  </p>
                  <p className="text-xs text-black/35">
                    {new Date(time).toLocaleString(i18n.language)}
                  </p>
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
        </aside>
      </div>

      {/* Contests (self-reported, small weight) */}
      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-black/45" />
          <h2 className="text-sm font-bold text-black">
            {t('stats.contests', { defaultValue: 'Contests' })}
          </h2>
        </div>
        <p className="mt-1 text-xs text-black/40">
          {t('stats.contests_note', {
            defaultValue: 'Self-reported: small weight, does not affect regularity.',
          })}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-black/45">
            {t('stats.contest_date', { defaultValue: 'Date' })}
            <input
              type="date"
              value={contestDate}
              onChange={(event) => setContestDate(event.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-black"
            />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[11px] font-semibold text-black/45">
            {t('stats.contest_title', { defaultValue: 'Contest (optional)' })}
            <input
              value={contestTitle}
              onChange={(event) => setContestTitle(event.target.value)}
              placeholder={t('stats.contest_placeholder', { defaultValue: 'e.g. school olympiad' })}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-black"
            />
          </label>
          <button
            type="button"
            onClick={addContestEntry}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white hover:bg-black/85 disabled:opacity-40"
          >
            <Plus size={14} />
            {t('stats.contest_add', { defaultValue: 'Add' })}
          </button>
        </div>

        {contests.length > 0 && (
          <ul className="mt-4 divide-y divide-neutral-100">
            {contests.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black">
                    {entry.title || t('stats.contests', { defaultValue: 'Contests' })}
                  </p>
                  <p className="text-xs text-black/35">
                    {formatDate(entry.happened_on, i18n.language, { dateStyle: 'medium' })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeContest(entry.id)}
                  disabled={busy}
                  aria-label={t('common.delete', { defaultValue: 'Delete' })}
                  className="rounded-lg p-2 text-black/30 hover:bg-neutral-50 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
