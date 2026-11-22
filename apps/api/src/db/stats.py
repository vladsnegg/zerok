"""Defense and contest records used by the stats/КПД engine.

Defenses are the verified signal: only an instructor/admin records them.
Contests are self-reported by the student (nobody verifies them), so they
carry a deliberately small weight in the score and do not feed "regularity".
"""

from typing import Optional

from sqlalchemy import Column, ForeignKey, Index, Integer
from sqlmodel import Field, SQLModel


class DefenseRecord(SQLModel, table=True):
    __tablename__ = "defense_record"
    __table_args__ = (
        Index("ix_defense_record_org_user", "org_id", "user_id"),
        Index("ix_defense_record_course_user", "course_id", "user_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    )
    org_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False
        )
    )
    course_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("course.id", ondelete="SET NULL"), nullable=True),
    )
    assignment_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("assignment.id", ondelete="SET NULL"), nullable=True
        ),
    )
    confirmed_by: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    # ISO timestamp of when the defense was confirmed.
    confirmed_at: str = ""
    note: str = ""
    creation_date: str = ""
    update_date: str = ""


class ContestEntry(SQLModel, table=True):
    __tablename__ = "contest_entry"
    __table_args__ = (
        Index("ix_contest_entry_org_user", "org_id", "user_id"),
        Index("ix_contest_entry_org_date", "org_id", "happened_on"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    )
    org_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False
        )
    )
    title: str = ""
    # ISO date (YYYY-MM-DD) the contest took place.
    happened_on: str = ""
    creation_date: str = ""
    update_date: str = ""
