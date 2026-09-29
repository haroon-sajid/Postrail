import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { ApiKey } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { CodeBlock } from '@/components/code-block';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Copyable } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { RelativeTime } from '@/components/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { curlSnippet, KEY_PLACEHOLDER, nodeSnippet } from '@/pages/overview/onboarding';
import { CreateKeyDialog } from './create-dialog';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from './hooks';

export function ApiKeysPage() {
  const { org, canManage } = useOrg();
  const keys = useApiKeys(org.id);
  const create = useCreateApiKey(org.id);
  const revoke = useRevokeApiKey(org.id);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const active = keys.data?.filter((k) => !k.revoked_at) ?? [];
  const snippetKey = selected ?? active[0]?.prefix;
  const snippet = snippetKey ? `${snippetKey}…` : KEY_PLACEHOLDER;

  return (
    <>
      <PageHeader
        title="API keys"
        description="Bearer keys your applications use to call the API. Each acts for the whole organisation."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> Create key
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card>
          {keys.isPending ? (
            <TableSkeleton rows={4} cols={5} />
          ) : keys.isError ? (
            <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
          ) : keys.data.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              description="Create a key to authenticate requests to /v1. You will see it once."
              action={
                canManage ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus /> Create key
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.data.map((k) => (
                  <TableRow
                    key={k.id}
                    data-clickable={!k.revoked_at || undefined}
                    data-state={k.prefix === snippetKey && !k.revoked_at ? 'selected' : undefined}
                    onClick={() => !k.revoked_at && setSelected(k.prefix)}
                    className={k.revoked_at ? 'text-fg-muted' : undefined}
                  >
                    <TableCell className="whitespace-nowrap font-medium">
                      <span className="flex items-center gap-2">
                        {k.name}
                        {k.revoked_at ? <Badge tone="danger">Revoked</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Copyable value={k.prefix} display={`${k.prefix}…`} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <RelativeTime value={k.created_at} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <RelativeTime value={k.last_used_at} />
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {k.created_by?.email ?? 'seed script'}
                    </TableCell>
                    <TableCell>
                      {canManage && !k.revoked_at ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Revoke ${k.name}`}
                          className="text-fg-muted hover:text-danger-fg"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRevoking(k);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Send with this key</CardTitle>
              <CardDescription>
                {snippetKey
                  ? 'Only the prefix is shown here; use the full key you saved.'
                  : 'Create a key to fill these in.'}
              </CardDescription>
            </div>
          </CardHeader>
          <div className="p-5">
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">curl</TabsTrigger>
                <TabsTrigger value="node">Node</TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="mt-3">
                <CodeBlock code={curlSnippet(snippet)} title="curl" />
              </TabsContent>
              <TabsContent value="node" className="mt-3">
                <CodeBlock code={nodeSnippet(snippet)} title="node" />
              </TabsContent>
            </Tabs>
          </div>
        </Card>
      </div>

      <CreateKeyDialog
        open={creating}
        onOpenChange={setCreating}
        create={(name) => create.mutateAsync(name)}
      />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke "${revoking?.name ?? ''}"?`}
        description="Requests using this key start failing immediately. This cannot be undone."
        confirmLabel="Revoke key"
        destructive
        pending={revoke.isPending}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await revoke.mutateAsync(revoking.id);
            toast.success(`Revoked "${revoking.name}"`);
            setRevoking(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
