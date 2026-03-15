"""Service for managing user connections (list, remove, relationship)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.connection import Connection
from ..models.relationship import Relationship
from ..models.user import User
from ..schemas.connection import ConnectionDetailResponse, ConnectionResponse

logger = logging.getLogger(__name__)


async def list_connections(db: AsyncSession, user_id: UUID) -> list[ConnectionResponse]:
    """List all active connections for a user."""
    result = await db.execute(
        select(Connection).where(
            or_(
                Connection.user_a_id == user_id,
                Connection.user_b_id == user_id,
            ),
            Connection.removed_at.is_(None),
        )
    )
    connections = result.scalars().all()

    responses: list[ConnectionResponse] = []
    for conn in connections:
        other_user_id = conn.user_b_id if conn.user_a_id == user_id else conn.user_a_id
        user_result = await db.execute(select(User).where(User.id == other_user_id))
        other_user = user_result.scalar_one()
        responses.append(
            ConnectionResponse(
                id=conn.id,
                user_id=other_user.id,
                display_name=other_user.name,
                username=other_user.username,
                avatar_url=other_user.avatar_url,
                connected_at=conn.connected_at,
            )
        )

    return responses


async def remove_connection(
    db: AsyncSession, connection_id: UUID, user_id: UUID
) -> None:
    """Soft-delete a connection."""
    conn = await _get_connection(db, connection_id, user_id)
    conn.removed_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(
        "connection.removed",
        extra={"connection_id": str(connection_id), "user_id": str(user_id)},
    )

    # Best-effort graph sync - remove edge
    try:
        from ..providers.registry import get_provider_registry

        registry = get_provider_registry()
        graph_adapter = registry.get_graph_adapter()
        if graph_adapter:
            user_a_node = f"user-{conn.user_a_id}"
            user_b_node = f"user-{conn.user_b_id}"
            await graph_adapter.delete_relationship(
                "Person",
                user_a_node,
                "CONNECTED_TO",
                "Person",
                user_b_node,
            )
    except Exception:
        logger.warning(
            "connection.graph_remove_failed",
            extra={"connection_id": str(connection_id)},
            exc_info=True,
        )


async def get_relationship(
    db: AsyncSession, connection_id: UUID, user_id: UUID
) -> ConnectionDetailResponse:
    """Get connection details with relationship data."""
    conn = await _get_connection(db, connection_id, user_id)

    other_user_id = conn.user_b_id if conn.user_a_id == user_id else conn.user_a_id
    user_result = await db.execute(select(User).where(User.id == other_user_id))
    other_user = user_result.scalar_one()

    # Get relationship data
    rel_result = await db.execute(
        select(Relationship).where(
            Relationship.owner_user_id == user_id,
            Relationship.connection_id == connection_id,
        )
    )
    rel = rel_result.scalar_one_or_none()

    return ConnectionDetailResponse(
        id=conn.id,
        user_id=other_user.id,
        display_name=other_user.name,
        username=other_user.username,
        avatar_url=other_user.avatar_url,
        connected_at=conn.connected_at,
        relationship_type=rel.relationship_type if rel else None,
        who_they_are_to_me=rel.who_they_are_to_me if rel else None,
        who_i_am_to_them=rel.who_i_am_to_them if rel else None,
        nicknames=rel.nicknames if rel else None,
        character_traits=rel.character_traits if rel else None,
    )


async def update_relationship(
    db: AsyncSession,
    connection_id: UUID,
    user_id: UUID,
    relationship_type: str | None = None,
    who_they_are_to_me: str | None = None,
    who_i_am_to_them: str | None = None,
    nicknames: list[str] | None = None,
    character_traits: list[str] | None = None,
    fields_set: set[str] | None = None,
) -> ConnectionDetailResponse:
    """Upsert relationship data for a connection."""
    conn = await _get_connection(db, connection_id, user_id)

    rel_result = await db.execute(
        select(Relationship).where(
            Relationship.owner_user_id == user_id,
            Relationship.connection_id == connection_id,
        )
    )
    rel = rel_result.scalar_one_or_none()

    if rel is None:
        rel = Relationship(
            owner_user_id=user_id,
            connection_id=connection_id,
        )
        db.add(rel)

    # Only update fields that were explicitly provided
    update_fields = fields_set or set()
    if "relationship_type" in update_fields:
        rel.relationship_type = relationship_type
    if "who_they_are_to_me" in update_fields:
        rel.who_they_are_to_me = who_they_are_to_me
    if "who_i_am_to_them" in update_fields:
        rel.who_i_am_to_them = who_i_am_to_them
    if "nicknames" in update_fields:
        rel.nicknames = nicknames
    if "character_traits" in update_fields:
        rel.character_traits = character_traits

    await db.commit()
    await db.refresh(rel)

    other_user_id = conn.user_b_id if conn.user_a_id == user_id else conn.user_a_id
    user_result = await db.execute(select(User).where(User.id == other_user_id))
    other_user = user_result.scalar_one()

    return ConnectionDetailResponse(
        id=conn.id,
        user_id=other_user.id,
        display_name=other_user.name,
        username=other_user.username,
        avatar_url=other_user.avatar_url,
        connected_at=conn.connected_at,
        relationship_type=rel.relationship_type,
        who_they_are_to_me=rel.who_they_are_to_me,
        who_i_am_to_them=rel.who_i_am_to_them,
        nicknames=rel.nicknames,
        character_traits=rel.character_traits,
    )


async def is_connected(db: AsyncSession, user_a_id: UUID, user_b_id: UUID) -> bool:
    """Check if two users are connected."""
    a_id = min(user_a_id, user_b_id)
    b_id = max(user_a_id, user_b_id)
    result = await db.execute(
        select(Connection).where(
            Connection.user_a_id == a_id,
            Connection.user_b_id == b_id,
            Connection.removed_at.is_(None),
        )
    )
    return result.scalar_one_or_none() is not None


async def _get_connection(
    db: AsyncSession, connection_id: UUID, user_id: UUID
) -> Connection:
    """Get a connection where user is a participant."""
    result = await db.execute(
        select(Connection).where(
            Connection.id == connection_id,
            or_(
                Connection.user_a_id == user_id,
                Connection.user_b_id == user_id,
            ),
            Connection.removed_at.is_(None),
        )
    )
    conn = result.scalar_one_or_none()
    if conn is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn
