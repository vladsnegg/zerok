/**
 * Where each kind of account calls "home".
 *
 * Admins work from the dashboard; instructors and learners share the cabinet —
 * the instructor gets a teaching-focused view of it (courses to manage,
 * quick links into the dashboard) in the same shell the learners use. These
 * paths are used after sign-in and by the logo/home links.
 */

export const ADMIN_HOME = '/dash'
export const CABINET_HOME = '/cabinet'

const ADMIN_ROLE_UUID = 'role_global_admin'
const STAFF_ROLE_UUIDS = ['role_global_admin', 'role_global_instructor']

/** Role UUIDs from a `/users/session` payload (`{ roles: [...] }`). */
export function roleUuidsFromSession(session: any): string[] {
  const roles: any[] = Array.isArray(session?.roles) ? session.roles : []
  return roles
    .map((entry) => entry?.role?.role_uuid ?? entry?.role_uuid ?? entry?.role?.id)
    .filter(Boolean)
}

export function isAdminSession(session: any): boolean {
  return roleUuidsFromSession(session).includes(ADMIN_ROLE_UUID)
}

/** Instructor or admin: someone who works with content, not just learns. */
export function isStaffSession(session: any): boolean {
  const uuids = roleUuidsFromSession(session)
  return STAFF_ROLE_UUIDS.some((uuid) => uuids.includes(uuid))
}

export function homePathForSession(session: any): string {
  return isAdminSession(session) ? ADMIN_HOME : CABINET_HOME
}

/**
 * Logo / "home" link inside an organization. The cabinet is home for learners
 * and instructors; admins keep the organization's public home (course
 * catalog), which is where they preview and manage content from.
 */
export function orgHomePathForSession(session: any): string {
  return isAdminSession(session) ? '/' : CABINET_HOME
}
