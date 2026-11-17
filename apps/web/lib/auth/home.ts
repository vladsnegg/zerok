/**
 * Where each kind of account calls "home".
 *
 * Staff (admins, instructors) work from the dashboard; learners get the
 * lightweight cabinet. These same paths are used after sign-in and by the
 * logo/home links, so a learner never lands on the catalog by accident.
 */

export const STAFF_HOME = '/dash'
export const LEARNER_HOME = '/cabinet'

const STAFF_ROLE_UUIDS = ['role_global_admin', 'role_global_instructor']

/** Role UUIDs from a `/users/session` payload (`{ roles: [...] }`). */
export function roleUuidsFromSession(session: any): string[] {
  const roles: any[] = Array.isArray(session?.roles) ? session.roles : []
  return roles
    .map((entry) => entry?.role?.role_uuid ?? entry?.role_uuid ?? entry?.role?.id)
    .filter(Boolean)
}

export function isStaffSession(session: any): boolean {
  const uuids = roleUuidsFromSession(session)
  return STAFF_ROLE_UUIDS.some((uuid) => uuids.includes(uuid))
}

/** True when the account is a plain learner (no staff role). */
export function isLearnerSession(session: any): boolean {
  return !isStaffSession(session)
}

export function homePathForSession(session: any): string {
  return isStaffSession(session) ? STAFF_HOME : LEARNER_HOME
}

/**
 * Logo / "home" link inside an organization. Learners land in the cabinet;
 * staff keep the organization's public home (course catalog), which is where
 * they preview and manage content from.
 */
export function orgHomePathForSession(session: any): string {
  return isStaffSession(session) ? '/' : LEARNER_HOME
}
