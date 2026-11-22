import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, getResponseMetadata } from '@services/utils/ts/requests'

export type StatsPeriod = 'week' | 'month' | 'all'

export interface ScoreBreakdown {
  score: number
  regularity: number
  defenses: number
  solved: number
  contests: number
  conversion: number
  active_weeks: number
  total_weeks: number
  solved_count: number
  defense_count: number
  contest_count: number
  components: Record<string, number>
}

export interface LeaderboardEntry {
  rank: number
  score: number
  defenses: number
  solved: number
  contests: number
  regularity: number
  user_id: number
  name: string
  username: string
}

export interface MyStats {
  period: StatsPeriod
  score: number
  breakdown: ScoreBreakdown
  rank: number | null
  participants: number
  top: LeaderboardEntry[]
  course?: {
    course_uuid: string
    course_name: string
    score: number
    rank: number | null
    participants: number
    breakdown: ScoreBreakdown
  } | null
}

export interface Leaderboard {
  period: StatsPeriod
  scope: 'organization' | 'course'
  course_uuid: string | null
  participants: number
  items: LeaderboardEntry[]
  me: LeaderboardEntry | null
}

export interface ContestEntry {
  id: number
  title: string
  happened_on: string
}

async function getJson(url: string, token?: string) {
  const res = await fetch(url, RequestBodyWithAuthHeader('GET', null, null, token))
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

export function getMyStats(
  orgId: number,
  token: string,
  period: StatsPeriod,
  courseUuid?: string | null,
): Promise<MyStats> {
  const query = new URLSearchParams({ org_id: String(orgId), period })
  if (courseUuid) query.set('course_uuid', courseUuid)
  return getJson(`${getAPIUrl()}stats/me?${query.toString()}`, token)
}

export function getLeaderboard(
  orgId: number,
  token: string,
  period: StatsPeriod,
  courseUuid?: string | null,
  limit = 10,
): Promise<Leaderboard> {
  const query = new URLSearchParams({
    org_id: String(orgId),
    period,
    limit: String(limit),
  })
  if (courseUuid) query.set('course_uuid', courseUuid)
  return getJson(`${getAPIUrl()}stats/leaderboard?${query.toString()}`, token)
}

export function listMyContests(
  orgId: number,
  token: string,
  period: StatsPeriod,
): Promise<{ items: ContestEntry[] }> {
  return getJson(`${getAPIUrl()}stats/contests?org_id=${orgId}&period=${period}`, token)
}

export async function addContest(
  orgId: number,
  token: string,
  body: { title?: string; happened_on?: string },
) {
  const res = await fetch(
    `${getAPIUrl()}stats/contests`,
    RequestBodyWithAuthHeader('POST', { org_id: orgId, ...body }, null, token),
  )
  const data = await getResponseMetadata(res)
  return data as unknown as { id: number; happened_on: string; title: string }
}

export async function deleteContest(orgId: number, token: string, contestId: number) {
  const res = await fetch(
    `${getAPIUrl()}stats/contests/${contestId}?org_id=${orgId}`,
    RequestBodyWithAuthHeader('DELETE', null, null, token),
  )
  const data = await getResponseMetadata(res)
  return data as unknown as { ok: boolean }
}

export async function addDefense(
  orgId: number,
  token: string,
  body: { user_id: number; course_uuid?: string | null; note?: string },
) {
  const res = await fetch(
    `${getAPIUrl()}stats/defenses`,
    RequestBodyWithAuthHeader('POST', { org_id: orgId, ...body }, null, token),
  )
  const data = await getResponseMetadata(res)
  return data as unknown as { id: number }
}
