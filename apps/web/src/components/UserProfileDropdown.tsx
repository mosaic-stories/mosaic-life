import { User, BookOpen, MessageSquare, Users, Settings, HelpCircle, LogOut, Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

interface UserProfileDropdownProps {
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  onNavigate: (view: string) => void;
  onSignOut: () => void;
}

export default function UserProfileDropdown({ user, onNavigate, onSignOut }: UserProfileDropdownProps) {
  const initials = user.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-[rgb(var(--theme-primary))] focus:ring-offset-2 transition-all">
          <Avatar className="size-9 cursor-pointer hover:ring-2 hover:ring-neutral-300 transition-all">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" sideOffset={8}>
        {/* User Info Header */}
        <DropdownMenuLabel className="pb-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback className="bg-[rgb(var(--theme-primary))] text-white">
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
        <DropdownMenuItem 
          onClick={() => onNavigate('my-profile')}
          className="cursor-pointer py-2.5"
        >
          <User className="size-4 mr-3 text-neutral-500" />
          <span>My Profile</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => onNavigate('my-legacies')}
          className="cursor-pointer py-2.5"
        >
          <BookOpen className="size-4 mr-3 text-neutral-500" />
          <span>My Legacies</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => onNavigate('my-stories')}
          className="cursor-pointer py-2.5"
        >
          <MessageSquare className="size-4 mr-3 text-neutral-500" />
          <span>My Stories</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem
          onClick={() => onNavigate('connected-legacies')}
          className="cursor-pointer py-2.5"
        >
          <Users className="size-4 mr-3 text-neutral-500" />
          <span>Connected Legacies</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onNavigate('notifications')}
          className="cursor-pointer py-2.5"
        >
          <Bell className="size-4 mr-3 text-neutral-500" />
          <span>Notification History</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={() => onNavigate('settings')}
          className="cursor-pointer py-2.5"
        >
          <Settings className="size-4 mr-3 text-neutral-500" />
          <span>Settings</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => onNavigate('help')}
          className="cursor-pointer py-2.5"
        >
          <HelpCircle className="size-4 mr-3 text-neutral-500" />
          <span>Help & Support</span>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={onSignOut}
          className="cursor-pointer py-2.5 text-red-600 focus:text-red-600"
        >
          <LogOut className="size-4 mr-3" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
