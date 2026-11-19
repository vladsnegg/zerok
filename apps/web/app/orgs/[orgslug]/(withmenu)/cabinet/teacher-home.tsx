'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ChartNoAxesColumn,
  FolderOpen,
  PlusCircle,
  Settings,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { RequestBodyWithAuthHeader, asArray } from '@services/utils/ts/requests'
import { getOrgCourses } from '@services/courses/courses'
import { isOrgAnalyticsAvailable } from '@ee/components/Analytics/availability'
import { isOrgFeatureEnabled } from '@/lib/org/features'
import RecentCourses from '@components/Dashboard/Home/RecentCourses'
import OnboardingHomeCard from '@components/Dashboard/Onboarding/OnboardingHomeCard'
import ContentOverview from '@components/Dashboard/Home/ContentOverview'
import RecentMembers from '@components/Dashboard/Home/RecentMembers'
import UsageOverview from '@components/Dashboard/Home/UsageOverview'
import QuickStats from '@ee/components/Analytics/Home/QuickStats'

type CalendarEvent = any

/**
 * The instructor's home inside the cabinet.
 *
 * Same shell and visual language as the student cabinet, but the content is
 * the teaching surface: the instructor's courses to manage and quick links
 * into the parts of the dashboard their role allows. Admin-only entries
 * (members, org settings) appear only for admins.
 */
export default function TeacherCabinetHome({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const { canManageOrg } = useAdminStatus() as any
  const token = session?.data?.tokens?.access_token
  const user = session?.data?.user

  const [courses, setCourses] = useState<any[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    const load = async () => {
      try {
        const [coursesRes, calendarRes] = await Promise.all([
          getOrgCourses(orgslug, null, token, true).catch(() => null),
          fetch(`${getAPIUrl()}calendar`, RequestBodyWithAuthHeader('GET', null, null, token))
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
        ])
        if (!cancelled) {
          setCourses(Array.isArray(coursesRes) ? coursesRes : asArray(coursesRes?.courses))
          setEvents(
            Array.isArray(calendarRes) ? calendarRes : asArray(calendarRes?.events),
          )
        }
      } finally {
        if (!cancelled) {
          setCoursesLoading(false)
          setEventsLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token, orgslug])

  const stats = useMemo(() => {
    const published = courses.filter((course: any) => course.published).length
    return {
      total: courses.length,
      published,
      drafts: courses.length - published,
    }
  }, [courses])

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username

  const quickLinks = [
    {
      href: '/cabinet/courses',
      label: t('cabinet.teacher_link_courses', { defaultValue: 'Courses' }),
      Icon: BookOpen,
    },
    {
      href: '/cabinet/assignments',
      label: t('cabinet.teacher_link_assignments', { defaultValue: 'Assignments' }),
      Icon: ClipboardList,
    },
    // Feature-gated: boards and the library can be switched off per org.
    ...(isOrgFeatureEnabled(org, 'boards')
      ? [
          {
            href: '/cabinet/boards',
            label: t('cabinet.teacher_link_boards', { defaultValue: 'Boards' }),
            Icon: ChartNoAxesColumn,
          },
        ]
      : []),
    // Admins manage the organization, so their grid gains the members and
    // settings entries; instructors get the library instead.
    ...(canManageOrg
      ? [
          {
            href: '/cabinet/users/settings/users',
            label: t('cabinet.teacher_link_members', { defaultValue: 'Members' }),
            Icon: Users,
          },
          {
            href: '/cabinet/org/settings/general',
            label: t('cabinet.teacher_link_settings', { defaultValue: 'Settings' }),
            Icon: Settings,
          },
        ]
      : []),
    ...(isOrgFeatureEnabled(org, 'folders')
      ? [
          {
            href: '/cabinet/library',
            label: t('cabinet.teacher_link_library', { defaultValue: 'Library' }),
            Icon: FolderOpen,
          },
        ]
      : []),
  ]

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/35">
            {t('cabinet.teacher_eyebrow', { defaultValue: 'My teaching' })}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-black">
            {displayName
              ? t('cabinet.welcome_name', { defaultValue: 'Welcome, {{name}}', name: displayName })
              : t('cabinet.welcome', { defaultValue: 'Welcome' })}
          </h1>
          <p className="mt-1 text-sm text-black/45">
            {t('cabinet.teacher_subtitle', {
              defaultValue: 'Your courses, assignments and teaching tools in one place.',
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={getUriWithOrg(orgslug, '/cabinet/courses?new=true')}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white hover:bg-black/85"
          >
            <PlusCircle size={16} />
            {t('dashboard.home.create_course', { defaultValue: 'Create course' })}
          </Link>
          {isOrgAnalyticsAvailable() && (
            <Link
              href={getUriWithOrg(orgslug, '/cabinet/analytics')}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-black/70 hover:text-black"
            >
              <ChartNoAxesColumn size={16} />
              {t('dashboard.home.analytics', { defaultValue: 'Analytics' })}
            </Link>
          )}
          {canManageOrg && (
            <Link
              href={getUriWithOrg(orgslug, '/cabinet/users/settings/users')}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-black/70 hover:text-black"
            >
              <Users size={16} />
              {t('dashboard.home.members', { defaultValue: 'Members' })}
            </Link>
          )}
          {canManageOrg && (
            <Link
              href={getUriWithOrg(orgslug, '/cabinet/org/settings/general')}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-black/70 hover:text-black"
            >
              <Settings size={16} />
              {t('dashboard.home.settings', { defaultValue: 'Settings' })}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <BookOpen size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('cabinet.teacher_courses', { defaultValue: 'Courses' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <CheckCircle2 size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('cabinet.teacher_published', { defaultValue: 'Published' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{stats.published}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 text-black/45">
            <ClipboardList size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('cabinet.teacher_drafts', { defaultValue: 'Drafts' })}
            </span>
          </div>
          <p className="mt-3 text-3xl font-black text-black">{stats.drafts}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {quickLinks.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={getUriWithOrg(orgslug, href)}
            className="group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-black">
              <Icon size={16} className="text-black/45" />
              {label}
            </span>
            <ArrowRight size={14} className="text-black/25 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <RecentCourses />
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-black/45" />
              <h2 className="text-sm font-bold text-black">
                {t('cabinet.deadlines', { defaultValue: 'Deadlines & events' })}
              </h2>
            </div>
            {eventsLoading && <p className="mt-4 text-sm text-black/35">…</p>}
            {!eventsLoading && events.length === 0 && (
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
            <p className="text-xs font-semibold uppercase tracking-wide text-black/35">
              {t('cabinet.account', { defaultValue: 'Account' })}
            </p>
            <p className="mt-3 truncate text-sm text-black/45">{user?.email}</p>
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

      {/* Org-management widgets: admins only. Instructors do not hold the
          users/organizations rights these panels need. */}
      {canManageOrg && (
        <div className="mt-10 space-y-6">
          <OnboardingHomeCard />
          <ContentOverview />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentMembers />
            </div>
            <div className="space-y-6">
              <UsageOverview />
              {isOrgAnalyticsAvailable() && <QuickStats />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
