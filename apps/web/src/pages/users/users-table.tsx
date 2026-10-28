import { LogOut, MoreHorizontal, Trash2 } from 'lucide-react';
import type { AuthUser } from '@/api/types';
import { CopyButton } from '@/components/copy-button';
import { RelativeTime } from '@/components/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PROVIDER_LABEL: Record<AuthUser['providers'][number], string> = {
  google: 'Google',
  github: 'GitHub',
};

export interface UsersTableProps {
  users: AuthUser[];
  /** Admins and owners. Members see the list without the actions column. */
  canManage: boolean;
  onSignOut: (user: AuthUser) => void;
  onDelete: (user: AuthUser) => void;
  className?: string | undefined;
}

export function UsersTable({ users, canManage, onSignOut, onDelete, className }: UsersTableProps) {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Signs in with</TableHead>
          <TableHead>Last sign-in</TableHead>
          <TableHead>Joined</TableHead>
          {canManage ? <TableHead className="w-10" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="max-w-80">
              <span className="flex items-center gap-3">
                <Avatar user={user} />
                <span className="min-w-0">
                  {user.name ? (
                    <span className="block truncate font-medium">{user.name}</span>
                  ) : null}
                  <span className="flex items-center gap-0.5">
                    <span className={user.name ? 'truncate text-xs text-fg-muted' : 'truncate'}>
                      {user.email}
                    </span>
                    <CopyButton value={user.email} label="Email" />
                  </span>
                </span>
              </span>
            </TableCell>
            <TableCell>
              <span className="flex flex-wrap gap-1">
                {user.providers.map((p) => (
                  <Badge key={p} tone="info">
                    {PROVIDER_LABEL[p]}
                  </Badge>
                ))}
                {/* No linked provider means every sign-in so far was a link or a code. */}
                {user.providers.length === 0 ? <Badge tone="outline">Email</Badge> : null}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <RelativeTime value={user.last_sign_in_at} className="text-fg-muted" />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <RelativeTime value={user.created_at} className="text-fg-muted" />
            </TableCell>
            {canManage ? (
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.email}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onSignOut(user)}>
                      <LogOut /> Sign out everywhere
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => onDelete(user)}>
                      <Trash2 /> Delete user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Avatar({ user }: { user: AuthUser }) {
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();
  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-subtle text-xs font-semibold text-fg-muted">
      {user.image ? (
        // Google's picture host can answer 403 when the request carries a referrer.
        <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-full" />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </span>
  );
}
