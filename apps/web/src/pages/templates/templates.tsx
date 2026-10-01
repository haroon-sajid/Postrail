import { FileText, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { Template } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Copyable } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { ErrorState, PageEmptyState, TableSkeleton } from '@/components/states';
import { RelativeTime } from '@/components/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDeleteTemplate, useTemplates } from './hooks';

export function TemplatesPage() {
  const { org } = useOrg();
  const navigate = useNavigate();
  const templates = useTemplates(org.id);
  const remove = useDeleteTemplate(org.id);
  const [removing, setRemoving] = useState<Template | null>(null);

  const newButton = (
    <Button asChild variant="primary">
      <Link to="/templates/new">
        <Plus /> New template
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable subject and HTML with {{variables}}. Send one with template + variables."
        actions={newButton}
      />
      {templates.data?.length === 0 ? (
        <PageEmptyState
          icon={FileText}
          title="No templates yet"
          description="A template is a slug, a subject and HTML. Placeholders like {{name}} become required variables."
          action={newButton}
        />
      ) : (
        <Card>
          {templates.isPending ? (
            <TableSkeleton rows={4} cols={4} />
          ) : templates.isError ? (
            <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.data.map((t) => (
                  <TableRow
                    key={t.id}
                    data-clickable
                    onClick={() => void navigate(`/templates/${t.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Copyable value={t.slug} />
                    </TableCell>
                    <TableCell className="max-w-72 truncate">{t.subject}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {t.variables.length === 0 ? (
                          <span className="text-fg-muted">none</span>
                        ) : (
                          t.variables.map((v) => (
                            <Badge key={v} tone="outline">
                              {v}
                            </Badge>
                          ))
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <RelativeTime value={t.updated_at} className="text-fg-muted" />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${t.slug}`}
                        className="text-fg-muted hover:text-danger-fg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoving(t);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete "${removing?.slug ?? ''}"?`}
        description="Sends that reference this slug will fail with NOT_FOUND."
        confirmLabel="Delete template"
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await remove.mutateAsync(removing.id);
            toast.success(`Deleted ${removing.slug}`);
            setRemoving(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
