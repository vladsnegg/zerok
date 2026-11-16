"""Access requests: gmail-only sign-up, admin approval, and role assignment.

The platform is invite-by-review: a visitor may only create an account that is
immediately locked behind ``access_status=pending``. No session is issued until
an organization admin approves the request and picks one of the three product
roles (admin, instructor, user). The single chokepoint for session minting
(:func:`src.services.auth.session.issue_session_or_challenge`) enforces this,
so every sign-in path — password, MFA, magic link, OAuth — inherits the gate.
"""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import _async_session_factory
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import User, UserRead
from src.security.auth import create_access_token, decode_jwt
from src.security.org_auth import require_org_admin
from src.security.security import security_hash_password
from src.services.analytics import events as analytics_events
from src.services.analytics.analytics import track
from src.services.security.password_validation import validate_password_complexity
from src.services.security.profile_validation import validate_profile_fields
from src.services.webhooks.dispatch import dispatch_webhooks

logger = logging.getLogger(__name__)

ACCESS_PENDING = "pending"
ACCESS_APPROVED = "approved"
ACCESS_REJECTED = "rejected"
ACCESS_STATUSES = frozenset({ACCESS_PENDING, ACCESS_APPROVED, ACCESS_REJECTED})

GMAIL_DOMAIN = "gmail.com"
ACCESS_STATUS_PURPOSE = "access_pending"
ACCESS_STATUS_TOKEN_DAYS = 30

# The only roles an admin may grant at approval time. Maintainer is gone from
# the product; the legacy role row is removed by the access-request migration.
APPROVAL_ROLE_UUIDS: dict[str, str] = {
    "admin": "role_global_admin",
    "teacher": "role_global_instructor",
    "student": "role_global_user",
}

_USERNAME_SAFE = re.compile(r"[^a-z0-9_.-]+")


def normalize_gmail(raw: str) -> str:
    """Canonical form of an address for storage and login.

    Gmail ignores dots and ``+suffix`` in the local part. Storing the canonical
    form and normalizing the login input prevents ``a.b+x@gmail.com`` and
    ``ab@gmail.com`` from becoming two accounts (and two pending requests).
    Non-Gmail addresses are lowercased only — the Gmail rule must not rewrite
    the local part of another provider.
    """
    email = str(raw or "").strip().lower()
    local, sep, domain = email.partition("@")
    if not sep:
        return email
    if domain == GMAIL_DOMAIN:
        local = local.split("+", 1)[0].replace(".", "")
        if not local:
            return email
        return f"{local}@{domain}"
    return email


def is_gmail_address(raw: str) -> bool:
    email = normalize_gmail(raw)
    local, sep, domain = email.partition("@")
    return bool(sep and local and domain == GMAIL_DOMAIN)


def create_status_token(user: User) -> str:
    return create_access_token(
        data={"sub": user.email, "purpose": ACCESS_STATUS_PURPOSE},
        expires_delta=timedelta(days=ACCESS_STATUS_TOKEN_DAYS),
    )


def decode_status_token(token: str) -> Optional[dict]:
    payload = decode_jwt(token)
    if not payload or payload.get("purpose") != ACCESS_STATUS_PURPOSE:
        return None
    return payload


def access_denied_exception(user: User, access_status: str) -> HTTPException:
    """The 403 returned by the session chokepoint for a non-approved account."""
    if access_status == ACCESS_REJECTED:
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCESS_REJECTED",
                "message": "Your access request was declined. Contact an administrator.",
            },
        )
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "ACCESS_PENDING",
            "message": "Your access request is waiting for an administrator's approval.",
            "status_token": create_status_token(user),
        },
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _unique_username(email: str) -> str:
    base = _USERNAME_SAFE.sub("", email.partition("@")[0].lower())[:30] or "member"
    return f"{base}_{uuid4().hex[:6]}"


def _generic_response() -> dict:
    # Deliberately identical for a new address, an existing pending request,
    # an approved account and a rejected one: the endpoint must not become an
    # account-enumeration oracle.
    return {"status": "received"}


def _email_bodies(user: User, org_name: Optional[str], approved: bool) -> tuple[str, str, str]:
    site = org_name or "LearnHouse"
    if approved:
        subject = f"{site}: access approved"
        body = (
            f"<p>Hello {user.first_name or user.username},</p>"
            f"<p>Your access request for <strong>{site}</strong> has been approved.</p>"
            "<p>You can now sign in with the e-mail and password you used when requesting access.</p>"
        )
        return subject, body, user.email
    subject = f"{site}: new access request"
    body = (
        "<p>A new access request is waiting for review.</p>"
        f"<p><strong>E-mail:</strong> {user.email}<br>"
        f"<strong>Name:</strong> {user.first_name or ''} {user.last_name or ''}</p>"
        "<p>Review it in Dashboard → Users → Requests.</p>"
    )
    return subject, body, ""


async def _send_mail(to: str, subject: str, body: str) -> None:
    """Best-effort notification. SMTP/Resend is optional in local installs."""
    if not to:
        return
    try:
        from config.config import get_learnhouse_config

        mailing = get_learnhouse_config().mailing_config
        # No sender address or no configured provider: stay silent instead of
        # logging a provider 401/503 stack trace on every access request.
        if not mailing.system_email_address:
            return
        if mailing.email_provider == "resend" and not mailing.resend_api_key:
            return
        if mailing.email_provider == "smtp" and not mailing.smtp_host:
            return

        from src.services.email.utils import send_email

        await asyncio.to_thread(send_email, to, subject, body)
    except Exception:
        logger.warning("Access notification to %s could not be sent", to, exc_info=True)


async def _notify_admins(user: User, org: Optional[Organization]) -> None:
    org_name = org.name if org else None
    subject, body, _ = _email_bodies(user, org_name, approved=False)
    recipients: set[str] = set()

    try:
        async with _async_session_factory() as session:
            rows = (
                await session.execute(
                    select(User.email)
                    .join(UserOrganization, UserOrganization.user_id == User.id)
                    .where(UserOrganization.role_id == 1)
                )
            ).scalars().all()
            recipients.update(str(r) for r in rows if r)
    except Exception:
        logger.debug("Could not resolve admin recipients", exc_info=True)

    if org is not None and org.email:
        recipients.add(str(org.email))
    for address in recipients:
        await _send_mail(address, subject, body)


async def create_access_request(
    request: Request,
    db_session: AsyncSession,
    email: str,
    password: str,
    first_name: str = "",
    last_name: str = "",
) -> dict:
    """Create a pending account. Always returns the same generic payload."""
    canonical = normalize_gmail(email)
    if not is_gmail_address(canonical):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "GMAIL_ONLY",
                "message": "Registration is available only for @gmail.com addresses.",
            },
        )

    validation = validate_password_complexity(password)
    if not validation.is_valid:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "WEAK_PASSWORD",
                "message": "Password does not meet security requirements",
                "errors": validation.errors,
                "requirements": validation.requirements,
            },
        )

    profile = validate_profile_fields(
        {"first_name": first_name, "last_name": last_name}
    )
    if not profile.is_valid:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PROFILE_FIELD_INVALID",
                "message": "Display name fields may not contain URLs or links",
                "errors": profile.errors,
            },
        )

    existing = (
        await db_session.execute(
            select(User).where(func.lower(User.email) == canonical)
        )
    ).scalars().first()
    if existing is not None:
        return _generic_response()

    user = User(
        username=_unique_username(canonical),
        first_name=(first_name or "").strip(),
        last_name=(last_name or "").strip(),
        email=canonical,
        password=security_hash_password(password),
        user_uuid=f"user_{uuid4()}",
        email_verified=True,
        signup_method="access_request",
        access_status=ACCESS_PENDING,
        access_requested_at=_now(),
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    org = (await db_session.execute(select(Organization).order_by(Organization.id))).scalars().first()

    if org is not None and org.id is not None:
        await track(
            event_name=analytics_events.USER_SIGNED_UP,
            org_id=org.id,
            user_id=user.id or 0,
            properties={"signup_method": "access_request", "status": ACCESS_PENDING},
        )
        try:
            await dispatch_webhooks(
                event_name=analytics_events.USER_SIGNED_UP,
                org_id=org.id,
                data={
                    "user": {
                        "user_uuid": user.user_uuid,
                        "email": user.email,
                        "username": user.username,
                    },
                    "signup_method": "access_request",
                },
            )
        except Exception:
            logger.debug("Access-request webhook dispatch failed", exc_info=True)

    await _notify_admins(user, org)
    return _generic_response()


async def get_access_status(db_session: AsyncSession, status_token: str) -> dict:
    payload = decode_status_token(status_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_STATUS_TOKEN", "message": "Invalid or expired status token"},
        )
    email = str(payload.get("sub") or "")
    user = (
        await db_session.execute(select(User).where(func.lower(User.email) == email.lower()))
    ).scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "email": user.email,
        "status": user.access_status or ACCESS_APPROVED,
        "requested_at": user.access_requested_at,
        "decided_at": user.access_decided_at,
    }


async def list_access_requests(
    request: Request,
    db_session: AsyncSession,
    org_id: int,
    current_user,
) -> list[dict]:
    await require_org_admin(current_user.id, org_id, db_session)

    users = (
        await db_session.execute(
            select(User)
            .where(User.access_status == ACCESS_PENDING)
            .order_by(User.access_requested_at)
        )
    ).scalars().all()

    return [
        {
            "id": user.id,
            "user_uuid": user.user_uuid,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "requested_at": user.access_requested_at,
        }
        for user in users
    ]


async def approve_access_request(
    request: Request,
    db_session: AsyncSession,
    org_id: int,
    user_id: int,
    role: str,
    current_user,
) -> UserRead:
    await require_org_admin(current_user.id, org_id, db_session)

    role_uuid = APPROVAL_ROLE_UUIDS.get(role)
    if role_uuid is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_ROLE",
                "message": "Role must be one of: admin, teacher, student",
            },
        )

    role_row = (
        await db_session.execute(select(Role).where(Role.role_uuid == role_uuid))
    ).scalars().first()
    if role_row is None or role_row.id is None:
        raise HTTPException(status_code=404, detail="Role not found")

    user = await db_session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if (user.access_status or ACCESS_APPROVED) != ACCESS_PENDING:
        raise HTTPException(
            status_code=409,
            detail={"code": "NOT_PENDING", "message": "This request is not pending"},
        )

    membership = (
        await db_session.execute(
            select(UserOrganization).where(
                UserOrganization.user_id == user.id,
                UserOrganization.org_id == org_id,
            )
        )
    ).scalars().first()

    now = str(datetime.now())
    if membership is None:
        membership = UserOrganization(
            user_id=user.id,
            org_id=org_id,
            role_id=role_row.id,
            creation_date=now,
            update_date=now,
        )
        db_session.add(membership)
    else:
        membership.role_id = role_row.id
        membership.update_date = now
        db_session.add(membership)

    user.access_status = ACCESS_APPROVED
    user.access_decided_at = _now()
    user.access_decided_by = current_user.id
    user.update_date = now
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    from src.routers.users import _invalidate_session_cache

    _invalidate_session_cache(user.id)

    org = await db_session.get(Organization, org_id)
    subject, body, to = _email_bodies(user, org.name if org else None, approved=True)
    await _send_mail(to, subject, body)

    return UserRead.model_validate(user)


async def reject_access_request(
    request: Request,
    db_session: AsyncSession,
    org_id: int,
    user_id: int,
    current_user,
) -> dict:
    await require_org_admin(current_user.id, org_id, db_session)

    user = await db_session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if (user.access_status or ACCESS_APPROVED) != ACCESS_PENDING:
        raise HTTPException(
            status_code=409,
            detail={"code": "NOT_PENDING", "message": "This request is not pending"},
        )

    user.access_status = ACCESS_REJECTED
    user.access_decided_at = _now()
    user.access_decided_by = current_user.id
    user.update_date = str(datetime.now())
    db_session.add(user)
    await db_session.commit()

    from src.routers.users import _invalidate_session_cache

    _invalidate_session_cache(user.id)
    return {"detail": "Access request rejected"}
