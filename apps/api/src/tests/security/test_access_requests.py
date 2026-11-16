"""Access-request onboarding: Gmail normalization, pending gate, approval."""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request

from src.db.roles import Role, RoleTypeEnum
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.auth.access import (
    ACCESS_PENDING,
    approve_access_request,
    create_access_request,
    is_gmail_address,
    normalize_gmail,
    reject_access_request,
)
from src.services.auth.session import issue_session_or_challenge


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/access-request",
            "headers": [],
            "client": ("127.0.0.1", 12345),
        }
    )


class TestGmailNormalization:
    def test_dots_and_plus_suffix_are_ignored(self):
        assert normalize_gmail("John.Doe+school@Gmail.com") == "johndoe@gmail.com"

    def test_other_domains_are_only_lowercased(self):
        assert normalize_gmail("First.Last@Example.com") == "first.last@example.com"

    def test_gmail_detection(self):
        assert is_gmail_address("a.b@gmail.com") is True
        assert is_gmail_address("user@example.com") is False


class TestAccessRequest:
    async def _create(self, db):
        with patch(
            "src.services.auth.access._notify_admins",
            new_callable=AsyncMock,
        ):
            return await create_access_request(
                _request(),
                db,
                email="New.Member+tag@gmail.com",
                password="StrongPass1!",
                first_name="New",
                last_name="Member",
            )

    async def test_request_creates_pending_user_without_membership(self, db, org):
        result = await self._create(db)
        assert result == {"status": "received"}

        user = (
            await db.execute(
                select(User).where(User.email == "newmember@gmail.com")
            )
        ).scalars().first()
        assert user is not None
        assert user.access_status == ACCESS_PENDING
        assert user.password and user.password != "StrongPass1!"
        assert user.email_verified is True

        membership = (
            await db.execute(
                select(UserOrganization).where(UserOrganization.user_id == user.id)
            )
        ).scalars().first()
        assert membership is None

    async def test_non_gmail_is_rejected(self, db, org):
        with pytest.raises(HTTPException) as exc:
            await create_access_request(
                _request(),
                db,
                email="someone@example.com",
                password="StrongPass1!",
            )
        assert exc.value.status_code == 400
        assert exc.value.detail["code"] == "GMAIL_ONLY"

    async def test_duplicate_request_is_generic_and_idempotent(self, db, org):
        await self._create(db)
        result = await self._create(db)
        assert result == {"status": "received"}
        users = (
            await db.execute(select(User).where(User.email == "newmember@gmail.com"))
        ).scalars().all()
        assert len(users) == 1


class TestPendingSessionGate:
    async def test_pending_user_cannot_receive_a_session(self, db, org):
        with patch(
            "src.services.auth.access._notify_admins",
            new_callable=AsyncMock,
        ):
            await create_access_request(
                _request(),
                db,
                email="pending@gmail.com",
                password="StrongPass1!",
            )
        user = (
            await db.execute(select(User).where(User.email == "pending@gmail.com"))
        ).scalars().first()

        with pytest.raises(HTTPException) as exc:
            await issue_session_or_challenge(db, user)
        assert exc.value.status_code == 403
        assert exc.value.detail["code"] == "ACCESS_PENDING"
        assert exc.value.detail["status_token"]


class TestApproval:
    async def _pending_user(self, db, org):
        with patch(
            "src.services.auth.access._notify_admins",
            new_callable=AsyncMock,
        ):
            await create_access_request(
                _request(),
                db,
                email="approved@gmail.com",
                password="StrongPass1!",
            )
        return (
            await db.execute(select(User).where(User.email == "approved@gmail.com"))
        ).scalars().first()

    async def _global_user_role(self, db):
        role = Role(
            id=4,
            name="User",
            role_type=RoleTypeEnum.TYPE_GLOBAL,
            role_uuid="role_global_user",
            rights={},
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        db.add(role)
        await db.commit()
        await db.refresh(role)
        return role

    async def test_approve_assigns_role_and_unlocks(self, db, org, admin_user):
        user = await self._pending_user(db, org)
        await self._global_user_role(db)

        with patch(
            "src.services.auth.access._send_mail", new_callable=AsyncMock
        ), patch("src.routers.users._invalidate_session_cache"):
            result = await approve_access_request(
                _request(), db, org.id, user.id, "student", admin_user
            )

        assert result.access_status == "approved"
        membership = (
            await db.execute(
                select(UserOrganization).where(
                    UserOrganization.user_id == user.id,
                    UserOrganization.org_id == org.id,
                )
            )
        ).scalars().first()
        assert membership is not None and membership.role_id == 4

        with patch("src.services.auth.mfa.is_mfa_active", new_callable=AsyncMock, return_value=False):
            issued = await issue_session_or_challenge(db, user)
        assert issued.access_token and issued.refresh_token

    async def test_reject_keeps_the_account_locked(self, db, org, admin_user):
        user = await self._pending_user(db, org)
        with patch("src.routers.users._invalidate_session_cache"):
            result = await reject_access_request(
                _request(), db, org.id, user.id, admin_user
            )
        assert result["detail"] == "Access request rejected"
        await db.refresh(user)
        assert user.access_status == "rejected"
