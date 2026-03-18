import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MoreVertical, Loader2, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useMyConnections,
  useRemoveConnection,
} from '../hooks/useUserConnections';
import { formatDistanceToNow } from 'date-fns';

export default function MyConnectionsTab() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: connections, isLoading } = useMyConnections();
  const removeConnection = useRemoveConnection();
  const highlightedConnectionId = searchParams.get('connection');

  useEffect(() => {
    if (!highlightedConnectionId) {
      return;
    }

    const target = document.getElementById(
      `connection-card-${highlightedConnectionId}`
    );
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightedConnectionId, connections]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <Users className="size-12 text-neutral-300 mx-auto" />
        <p className="text-neutral-500">No connections yet</p>
        <p className="text-sm text-neutral-400">
          Search for users or visit their profiles to send connection requests.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
      {connections.map((conn) => {
        const initials = conn.display_name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase();
        return (
          <Card
            key={conn.id}
            id={`connection-card-${conn.id}`}
            className={`p-4 ${
              conn.id === highlightedConnectionId
                ? 'ring-2 ring-theme-primary ring-offset-2'
                : ''
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() =>
                  conn.username
                    ? navigate(`/u/${conn.username}`)
                    : undefined
                }
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <Avatar className="size-11">
                  <AvatarImage src={conn.avatar_url || undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 truncate">
                    {conn.display_name}
                  </p>
                  {conn.username && (
                    <p className="text-xs text-neutral-500">
                      @{conn.username}
                    </p>
                  )}
                  <p className="text-xs text-neutral-400 mt-1">
                    Connected{' '}
                    {formatDistanceToNow(new Date(conn.connected_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {conn.username && (
                    <DropdownMenuItem
                      onClick={() => navigate(`/u/${conn.username}`)}
                    >
                      View Profile
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (
                        confirm(
                          `Remove connection with ${conn.display_name}?`
                        )
                      ) {
                        removeConnection.mutate(conn.id);
                      }
                    }}
                  >
                    Remove Connection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
