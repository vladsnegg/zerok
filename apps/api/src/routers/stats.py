from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.stats import stats as stats_service

router = APIRouter()


class ContestBody(BaseModel):
    org_id: int
    title: str = ""
    happened_on: Optional[str] = None


class DefenseBody(BaseModel):
    org_id: int
    user_id: Optional[int] = None
    email: Optional[str] = None
    course_uuid: Optional[str] = None
    assignment_uuid: Optional[str] = None
    note: str = ""


@router.get(
    "/me",
    summary="Personal learning stats",
    description=(
        "КПД score and its parts for the current user, their rank in the "
        "organization and (optionally) a course, and the organization top-10."
    ),
)
async def api_my_stats(
    request: Request,
    org_id: int = Query(...),
    period: str = Query("month"),
    course_uuid: Optional[str] = Query(None),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await stats_service.get_my_stats(
        db_session, org_id, current_user, period=period, course_uuid=course_uuid
    )


@router.get(
    "/leaderboard",
    summary="Leaderboard",
    description=(
        "Top students by КПД for the organization or one course. Students see "
        "their own row even when it is outside the top list."
    ),
)
async def api_leaderboard(
    request: Request,
    org_id: int = Query(...),
    period: str = Query("month"),
    course_uuid: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await stats_service.get_leaderboard(
        db_session,
        org_id,
        current_user,
        period=period,
        course_uuid=course_uuid,
        limit=limit,
    )


@router.get(
    "/contests",
    summary="My contest entries",
    description="Self-reported contest participation for the current user.",
)
async def api_my_contests(
    request: Request,
    org_id: int = Query(...),
    period: str = Query("month"),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await stats_service.list_my_contests(
        db_session, org_id, current_user, period=period
    )


@router.post(
    "/contests",
    summary="Report a contest",
    description=(
        "Students report their own contest participation. Nobody verifies it, "
        "so the score gives it a small weight and it does not count as "
        "regularity."
    ),
)
async def api_create_contest(
    request: Request,
    body: ContestBody,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await stats_service.create_contest(
        db_session,
        body.org_id,
        current_user,
        title=body.title,
        happened_on=body.happened_on,
    )


@router.delete(
    "/contests/{contest_id}",
    summary="Delete a contest report",
    description="Lets a student remove a contest entry they reported by mistake.",
)
async def api_delete_contest(
    request: Request,
    contest_id: int,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await stats_service.delete_my_contest(
        db_session, org_id, current_user, contest_id
    )


@router.post(
    "/defenses",
    summary="Record a confirmed defense",
    description=(
        "Instructor/admin only. Marks that a student defended a task in a "
        "course. This is the verified signal used by the КПД score."
    ),
)
async def api_create_defense(
    request: Request,
    body: DefenseBody,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await stats_service.create_defense(
        db_session,
        body.org_id,
        current_user,
        user_id=body.user_id,
        email=body.email,
        course_uuid=body.course_uuid,
        assignment_uuid=body.assignment_uuid,
        note=body.note,
    )
