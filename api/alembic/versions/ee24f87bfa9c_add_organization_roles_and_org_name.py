"""add organization roles and org name

Revision ID: ee24f87bfa9c
Revises: d4b83a1f6c27
Create Date: 2026-08-20 18:38:23.933678

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ee24f87bfa9c"
down_revision: str | None = "d4b83a1f6c27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default backfills every existing membership as 'owner' — they are
    # the original account holders.
    op.add_column(
        "organization_users",
        sa.Column("role", sa.String(), server_default="owner", nullable=False),
    )
    op.add_column("organizations", sa.Column("name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "name")
    op.drop_column("organization_users", "role")
