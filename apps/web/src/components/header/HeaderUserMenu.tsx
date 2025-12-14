import { User, BookOpen, Settings, HelpCircle, LogOut, Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  useUnreadCount,
  useNotifications,
  useUpdateNotificationStatus,
  useMarkAllAsRead,
} from '@/lib/hooks/useNotifications';

interface HeaderUserMenuProps {
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  onNavigate: (view: string) => void;
  onSignOut: () => void;
}

export default function HeaderUserMenu({ user, onNavigate, onSignOut }: HeaderUserMenuProps) {
  const navigate = useNavigate();
  const { data: unreadData } = useUnreadCount();
  const { data: notifications, refetch } = useNotifications(false);
  const updateStatus = useUpdateNotificationStatus();
  const markAllRead = useMarkAllAsRead();

  const unreadCount = unreadData?.count ?? 0;
  const recentNotifications = (notifications ?? []).slice(0, 3);

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const handleNotificationClick = (notification: { id: string; link: string | null }) => {
    updateStatus.mutate({ notificationId: notification.id, status: 'read' });
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      refetch();
    }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:ring-offset-2 transition-all">
          <Avatar className="size-9 cursor-pointer hover:ring-2 hover:ring-neutral-300 transition-all">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-3 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end" sideOffset={8}>
        {/* Notifications Section */}
        <div className="px-2 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-neutral-900">
              Notifications {unreadCount > 0 && `(${unreadCount})`}
            </span>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllRead.mutate()}
                className="text-xs h-auto py-1 px-2"
              >
                <Check className="size-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
          {recentNotifications.length === 0 ? (
            <p className="text-xs text-neutral-500 py-2">No new notifications</p>
          ) : (
            <div className="space-y-1">
              {recentNotifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full text-left px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded truncate"
                >
                  <Bell className="size-3 inline mr-2 text-neutral-400" />
                  {notification.message}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => onNavigate('notifications')}
            className="w-full text-xs text-[rgb(var(--theme-primary))] hover:underline mt-2 text-left"
          >
            View all notifications
          </button>
        </div>

        <DropdownMenuSeparator />

        {/* User Info */}
        <DropdownMenuLabel className="py-2">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 truncate">{user.name}</p>
              <p className="text-xs text-neutral-500 truncate">{user.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Navigation Items */}
        <DropdownMenuItem onClick={() => onNavigate('my-profile')} className="cursor-pointer py-2">
          <User className="size-4 mr-3 text-neutral-500" />
          <span>My Profile</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onNavigate('my-legacies')} className="cursor-pointer py-2">
          <BookOpen className="size-4 mr-3 text-neutral-500" />
          <span>My Legacies</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onNavigate('settings')} className="cursor-pointer py-2">
          <Settings className="size-4 mr-3 text-neutral-500" />
          <span>Settings</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onNavigate('help')} className="cursor-pointer py-2">
          <HelpCircle className="size-4 mr-3 text-neutral-500" />
          <span>Help & Support</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onSignOut}
          className="cursor-pointer py-2 text-red-600 focus:text-red-600"
        >
          <LogOut className="size-4 mr-3" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
