# Notification System Implementation Plan

## Overview

Add an in-app notification system to notify users of events like legacy invitations. The system includes a bell icon in the header with unread badge, a dropdown panel for active notifications, and a history page in user settings.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Notification states | `unread`, `read`, `dismissed` | Separate states allow tracking engagement vs explicit dismissal |
| Creation timing | Synchronous | Simple, fits MVP scale. No background jobs needed. |
| Polling strategy | Refresh on dropdown open | Simplest approach, no continuous polling |
| Initial scope | Invitations only | Start small, add stories/media later |
| History display | Show all (read + dismissed) | Single chronological view, no tabs needed |
| Click behavior | Navigate + mark read | User clicks notification → goes to resource AND marks read |

## Implementation Tasks

### Phase 1: Backend Foundation

#### Task 1.1: Create Notification Model
**File:** `services/core-api/app/models/notification.py`

```python
"""Notification model for in-app notifications."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

if TYPE_CHECKING:
    from .user import User


class NotificationStatus(str, Enum):
    """Status of a notification."""
    UNREAD = "unread"
    READ = "read"
    DISMISSED = "dismissed"


class Notification(Base):
    """Notification model for user notifications."""

    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    link: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    actor_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    resource_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    resource_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=NotificationStatus.UNREAD.value,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    actor: Mapped["User | None"] = relationship("User", foreign_keys=[actor_id])

    def __repr__(self) -> str:
        return f"<Notification(id={self.id}, user_id={self.user_id}, type={self.type}, status={self.status})>"
```

**Update:** `services/core-api/app/models/__init__.py`
- Add `Notification` to imports and `__all__`

#### Task 1.2: Create Database Migration
**Command:** `cd services/core-api && uv run alembic revision --autogenerate -m "add notifications table"`

Migration should create:
- `notifications` table with all columns
- Indexes on `user_id`, `type`, `status`
- Foreign keys to `users` table

#### Task 1.3: Create Notification Schemas
**File:** `services/core-api/app/schemas/notification.py`

```python
"""Pydantic schemas for notifications."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    """Schema for notification response."""

    id: UUID
    type: str
    title: str
    message: str
    link: str | None = None
    actor_id: UUID | None = None
    actor_name: str | None = None
    actor_avatar_url: str | None = None
    resource_type: str | None = None
    resource_id: UUID | None = None
    status: str  # unread, read, dismissed
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationUpdateRequest(BaseModel):
    """Schema for updating notification status."""

    status: str = Field(
        ...,
        pattern="^(read|dismissed)$",
        description="New status for the notification",
    )


class UnreadCountResponse(BaseModel):
    """Schema for unread notification count."""

    count: int
```

#### Task 1.4: Create Notification Service
**File:** `services/core-api/app/services/notification.py`

```python
"""Notification service for managing user notifications."""

import logging
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.notification import Notification, NotificationStatus
from ..models.user import User
from ..schemas.notification import NotificationResponse, UnreadCountResponse

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    user_id: UUID,
    notification_type: str,
    title: str,
    message: str,
    link: str | None = None,
    actor_id: UUID | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
) -> Notification:
    """Create a new notification for a user."""
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        link=link,
        actor_id=actor_id,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    logger.info(
        "notification.created",
        extra={
            "notification_id": str(notification.id),
            "user_id": str(user_id),
            "type": notification_type,
        },
    )

    return notification


async def list_notifications(
    db: AsyncSession,
    user_id: UUID,
    include_dismissed: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[NotificationResponse]:
    """List notifications for a user."""
    query = (
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(Notification.user_id == user_id)
    )

    if not include_dismissed:
        query = query.where(Notification.status != NotificationStatus.DISMISSED.value)

    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    notifications = result.scalars().all()

    return [
        NotificationResponse(
            id=n.id,
            type=n.type,
            title=n.title,
            message=n.message,
            link=n.link,
            actor_id=n.actor_id,
            actor_name=n.actor.name if n.actor else None,
            actor_avatar_url=n.actor.avatar_url if n.actor else None,
            resource_type=n.resource_type,
            resource_id=n.resource_id,
            status=n.status,
            created_at=n.created_at,
        )
        for n in notifications
    ]


async def get_unread_count(db: AsyncSession, user_id: UUID) -> UnreadCountResponse:
    """Get count of unread notifications for a user."""
    result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(
                Notification.user_id == user_id,
                Notification.status == NotificationStatus.UNREAD.value,
            )
        )
    )
    count = result.scalar() or 0
    return UnreadCountResponse(count=count)


async def update_notification_status(
    db: AsyncSession,
    notification_id: UUID,
    user_id: UUID,
    new_status: str,
) -> NotificationResponse | None:
    """Update the status of a notification."""
    result = await db.execute(
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        return None

    notification.status = new_status
    await db.commit()
    await db.refresh(notification)

    logger.info(
        "notification.status_updated",
        extra={
            "notification_id": str(notification_id),
            "user_id": str(user_id),
            "new_status": new_status,
        },
    )

    return NotificationResponse(
        id=notification.id,
        type=notification.type,
        title=notification.title,
        message=notification.message,
        link=notification.link,
        actor_id=notification.actor_id,
        actor_name=notification.actor.name if notification.actor else None,
        actor_avatar_url=notification.actor.avatar_url if notification.actor else None,
        resource_type=notification.resource_type,
        resource_id=notification.resource_id,
        status=notification.status,
        created_at=notification.created_at,
    )


async def mark_all_as_read(db: AsyncSession, user_id: UUID) -> int:
    """Mark all unread notifications as read for a user."""
    result = await db.execute(
        update(Notification)
        .where(
            and_(
                Notification.user_id == user_id,
                Notification.status == NotificationStatus.UNREAD.value,
            )
        )
        .values(status=NotificationStatus.READ.value)
    )
    await db.commit()

    count = result.rowcount
    logger.info(
        "notification.mark_all_read",
        extra={"user_id": str(user_id), "count": count},
    )

    return count
```

#### Task 1.5: Create Notification Routes
**File:** `services/core-api/app/routes/notification.py`

```python
"""Notification API routes."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from ..auth.dependencies import require_auth
from ..database import DbSession
from ..schemas.notification import (
    NotificationResponse,
    NotificationUpdateRequest,
    UnreadCountResponse,
)
from ..services import notification as notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    db: DbSession,
    user_id: UUID = require_auth(),
    include_dismissed: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[NotificationResponse]:
    """List notifications for the current user."""
    return await notification_service.list_notifications(
        db, user_id, include_dismissed, limit, offset
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    db: DbSession,
    user_id: UUID = require_auth(),
) -> UnreadCountResponse:
    """Get unread notification count for the current user."""
    return await notification_service.get_unread_count(db, user_id)


@router.patch("/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: UUID,
    data: NotificationUpdateRequest,
    db: DbSession,
    user_id: UUID = require_auth(),
) -> NotificationResponse:
    """Update notification status (read/dismissed)."""
    result = await notification_service.update_notification_status(
        db, notification_id, user_id, data.status
    )
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    return result


@router.post("/mark-all-read")
async def mark_all_read(
    db: DbSession,
    user_id: UUID = require_auth(),
) -> dict:
    """Mark all unread notifications as read."""
    count = await notification_service.mark_all_as_read(db, user_id)
    return {"message": f"Marked {count} notifications as read", "count": count}
```

**Update:** `services/core-api/app/main.py`
- Import `notification_router`
- Add `app.include_router(notification_router)`

#### Task 1.6: Integrate with Invitation Service
**Update:** `services/core-api/app/services/invitation.py`

Add notification creation when an invitation is sent. After the invitation is created and before returning:

```python
# At top, add import:
from .notification import create_notification

# In create_invitation(), after db.commit() and before logger.info():

# Create notification for the invited user (if they exist)
if user:
    await create_notification(
        db=db,
        user_id=user.id,
        notification_type="invitation_received",
        title="Legacy Invitation",
        message=f"{inviter.name or inviter.email} invited you to join '{legacy.name}' as {data.role}",
        link=f"/invite/{invitation.token}",
        actor_id=inviter_id,
        resource_type="invitation",
        resource_id=invitation.id,
    )
```

### Phase 2: Frontend Foundation

#### Task 2.1: Create Notification API Client
**File:** `apps/web/src/lib/api/notifications.ts`

```typescript
// Notification API client functions

import { apiGet, apiPatch, apiPost } from './client';

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  resource_type: string | null;
  resource_id: string | null;
  status: 'unread' | 'read' | 'dismissed';
  created_at: string;
}

export interface UnreadCountResponse {
  count: number;
}

export interface NotificationUpdateRequest {
  status: 'read' | 'dismissed';
}

export async function listNotifications(
  includeDismissed = false,
  limit = 50,
  offset = 0
): Promise<NotificationResponse[]> {
  const params = new URLSearchParams({
    include_dismissed: String(includeDismissed),
    limit: String(limit),
    offset: String(offset),
  });
  return apiGet<NotificationResponse[]>(`/api/notifications?${params}`);
}

export async function getUnreadCount(): Promise<UnreadCountResponse> {
  return apiGet<UnreadCountResponse>('/api/notifications/unread-count');
}

export async function updateNotificationStatus(
  notificationId: string,
  status: 'read' | 'dismissed'
): Promise<NotificationResponse> {
  return apiPatch<NotificationResponse>(`/api/notifications/${notificationId}`, {
    status,
  });
}

export async function markAllAsRead(): Promise<{ message: string; count: number }> {
  return apiPost<{ message: string; count: number }>('/api/notifications/mark-all-read');
}
```

#### Task 2.2: Create Notification Hooks
**File:** `apps/web/src/lib/hooks/useNotifications.ts`

```typescript
// TanStack Query hooks for notifications

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listNotifications,
  getUnreadCount,
  updateNotificationStatus,
  markAllAsRead,
} from '@/lib/api/notifications';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (includeDismissed: boolean) =>
    [...notificationKeys.all, 'list', includeDismissed] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

export function useNotifications(includeDismissed = false) {
  return useQuery({
    queryKey: notificationKeys.list(includeDismissed),
    queryFn: () => listNotifications(includeDismissed),
    staleTime: 0, // Always refetch when dropdown opens
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCount,
    staleTime: 30_000, // Cache for 30 seconds
    refetchOnWindowFocus: true,
  });
}

export function useUpdateNotificationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      notificationId,
      status,
    }: {
      notificationId: string;
      status: 'read' | 'dismissed';
    }) => updateNotificationStatus(notificationId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
```

### Phase 3: Frontend UI Components

#### Task 3.1: Create NotificationBell Component
**File:** `apps/web/src/components/notifications/NotificationBell.tsx`

```typescript
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUnreadCount, useNotifications, useUpdateNotificationStatus, useMarkAllAsRead } from '@/lib/hooks/useNotifications';
import NotificationItem from './NotificationItem';
import { Button } from '@/components/ui/button';

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: unreadData } = useUnreadCount();
  const { data: notifications, refetch } = useNotifications(false);
  const updateStatus = useUpdateNotificationStatus();
  const markAllRead = useMarkAllAsRead();

  const unreadCount = unreadData?.count ?? 0;

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      refetch();
    }
  };

  const handleNotificationClick = (notification: { id: string; link: string | null }) => {
    // Mark as read
    updateStatus.mutate({ notificationId: notification.id, status: 'read' });

    // Navigate if there's a link
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  const handleDismiss = (notificationId: string) => {
    updateStatus.mutate({ notificationId, status: 'dismissed' });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-full hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:ring-offset-2 transition-all"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="size-5 text-neutral-600" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 size-2 bg-red-500 rounded-full" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs h-auto py-1"
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500">
              No notifications
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
                onDismiss={() => handleDismiss(notification.id)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

#### Task 3.2: Create NotificationItem Component
**File:** `apps/web/src/components/notifications/NotificationItem.tsx`

```typescript
import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { NotificationResponse } from '@/lib/api/notifications';
import { formatDistanceToNow } from 'date-fns';

interface NotificationItemProps {
  notification: NotificationResponse;
  onClick: () => void;
  onDismiss: () => void;
}

export default function NotificationItem({
  notification,
  onClick,
  onDismiss,
}: NotificationItemProps) {
  const initials = notification.actor_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?';

  const isUnread = notification.status === 'unread';
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  return (
    <div
      className={`relative flex gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors ${
        isUnread ? 'bg-blue-50/50' : ''
      }`}
    >
      <button
        onClick={onClick}
        className="flex gap-3 flex-1 text-left"
      >
        <Avatar className="size-9 flex-shrink-0">
          <AvatarImage src={notification.actor_avatar_url || undefined} />
          <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-900 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-neutral-500 mt-1">{timeAgo}</p>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="p-1 hover:bg-neutral-200 rounded-full transition-colors self-start"
        aria-label="Dismiss notification"
      >
        <X className="size-4 text-neutral-400" />
      </button>
      {isUnread && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 size-2 bg-blue-500 rounded-full" />
      )}
    </div>
  );
}
```

#### Task 3.3: Create Index Export
**File:** `apps/web/src/components/notifications/index.ts`

```typescript
export { default as NotificationBell } from './NotificationBell';
export { default as NotificationItem } from './NotificationItem';
```

### Phase 4: Header Integration

#### Task 4.1: Add NotificationBell to Headers
**Files to update:** Any page component with a header that shows the user profile dropdown

Look for the pattern:
```tsx
<UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
```

Add before `UserProfileDropdown`:
```tsx
{user && <NotificationBell />}
<UserProfileDropdown user={user} onNavigate={onNavigate} onSignOut={onSignOut} />
```

Affected files (based on exploration):
- `apps/web/src/components/HowItWorks.tsx`
- `apps/web/src/components/MyLegacies.tsx`
- `apps/web/src/components/LegacyProfile.tsx`
- `apps/web/src/components/MediaGallery.tsx`
- Any other authenticated page headers

Import at top of each file:
```tsx
import { NotificationBell } from '@/components/notifications';
```

### Phase 5: Notification History Page

#### Task 5.1: Create NotificationHistory Component
**File:** `apps/web/src/components/NotificationHistory.tsx`

```typescript
import { useNotifications, useUpdateNotificationStatus } from '@/lib/hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Bell } from 'lucide-react';

interface NotificationHistoryProps {
  onNavigate: (view: string) => void;
}

export default function NotificationHistory({ onNavigate }: NotificationHistoryProps) {
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useNotifications(true); // Include dismissed
  const updateStatus = useUpdateNotificationStatus();

  const handleNotificationClick = (notification: { id: string; link: string | null; status: string }) => {
    if (notification.status === 'unread') {
      updateStatus.mutate({ notificationId: notification.id, status: 'read' });
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleDismiss = (notificationId: string) => {
    updateStatus.mutate({ notificationId, status: 'dismissed' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-neutral-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Notification History</h1>

      {!notifications || notifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="size-12 text-neutral-300 mx-auto mb-4" />
          <p className="text-neutral-500">No notifications yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow divide-y">
          {notifications.map((notification) => {
            const initials = notification.actor_name
              ?.split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase() || '?';
            const isUnread = notification.status === 'unread';
            const isDismissed = notification.status === 'dismissed';
            const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
              addSuffix: true,
            });

            return (
              <div
                key={notification.id}
                className={`relative flex gap-4 p-4 ${
                  isUnread ? 'bg-blue-50/50' : isDismissed ? 'opacity-60' : ''
                }`}
              >
                <button
                  onClick={() => handleNotificationClick(notification)}
                  className="flex gap-4 flex-1 text-left"
                  disabled={isDismissed}
                >
                  <Avatar className="size-10 flex-shrink-0">
                    <AvatarImage src={notification.actor_avatar_url || undefined} />
                    <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-sm">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">
                      {notification.title}
                    </p>
                    <p className="text-sm text-neutral-600 mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-neutral-500 mt-2">{timeAgo}</p>
                  </div>
                </button>
                {!isDismissed && (
                  <button
                    onClick={() => handleDismiss(notification.id)}
                    className="p-1 hover:bg-neutral-200 rounded-full transition-colors self-start"
                    aria-label="Dismiss notification"
                  >
                    <X className="size-4 text-neutral-400" />
                  </button>
                )}
                {isUnread && (
                  <span className="absolute left-1 top-1/2 -translate-y-1/2 size-2 bg-blue-500 rounded-full" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

#### Task 5.2: Add Route for Notification History
**Update:** `apps/web/src/routes/index.tsx`

Add lazy import:
```typescript
const NotificationHistoryBase = lazy(() => import('@/components/NotificationHistory'));
const NotificationHistory = withSharedProps(NotificationHistoryBase);
```

Add route in protected routes section:
```typescript
{
  path: 'notifications',
  element: (
    <ProtectedRoute>
      <LazyPage><NotificationHistory /></LazyPage>
    </ProtectedRoute>
  ),
},
```

#### Task 5.3: Add Navigation Link
**Update:** `apps/web/src/components/UserProfileDropdown.tsx`

Add import:
```typescript
import { Bell } from 'lucide-react';
```

Add menu item after "My Stories" or in Settings section:
```tsx
<DropdownMenuItem
  onClick={() => onNavigate('notifications')}
  className="cursor-pointer py-2.5"
>
  <Bell className="size-4 mr-3 text-neutral-500" />
  <span>Notification History</span>
</DropdownMenuItem>
```

**Update:** `apps/web/src/routes/RootLayout.tsx`

Add to `routeMap`:
```typescript
'notifications': '/notifications',
```

## Testing Plan

### Backend Tests
1. **Unit tests for notification service**
   - `test_create_notification`
   - `test_list_notifications_excludes_dismissed`
   - `test_list_notifications_includes_dismissed`
   - `test_get_unread_count`
   - `test_update_notification_status`
   - `test_mark_all_as_read`

2. **Integration tests for routes**
   - `test_list_notifications_endpoint`
   - `test_unread_count_endpoint`
   - `test_update_notification_requires_auth`
   - `test_update_nonexistent_notification_returns_404`

3. **Integration test for invitation notification**
   - `test_invitation_creates_notification_for_existing_user`

### Frontend Tests
1. **Component tests**
   - `NotificationBell` renders with unread count
   - `NotificationBell` opens dropdown on click
   - `NotificationItem` displays notification content
   - `NotificationItem` calls onDismiss when X clicked
   - `NotificationHistory` renders list of notifications

2. **E2E tests (Playwright)**
   - User receives notification when invited
   - User can view and dismiss notifications
   - Clicking notification navigates to resource

## Verification Steps

After each phase, verify:

1. **Phase 1**: Run `uv run pytest` - all tests pass
2. **Phase 2**: TypeScript compiles without errors
3. **Phase 3**: Components render in Storybook (if available)
4. **Phase 4**: Bell icon appears in header for authenticated users
5. **Phase 5**: Full flow works end-to-end

## Future Enhancements (Not in Scope)

- Background polling for real-time badge updates
- Story/media notification types
- Email notifications
- Notification preferences/settings
- Push notifications
