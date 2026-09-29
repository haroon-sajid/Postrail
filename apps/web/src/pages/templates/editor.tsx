import { html } from '@codemirror/lang-html';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createTemplateRequestSchema,
  extractVariables,
  renderTemplateString,
  escapeHtml,
} from '@postrail/shared';
import CodeMirror from '@uiw/react-codemirror';
import { ArrowLeft, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import { errorMessage } from '@/api/client';
import { orgPath, useOrg } from '@/app/org-context';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError, FieldHint, Input, Label, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/lib/theme';
import { useCreateTemplate, useSendTestTemplate, useTemplate, useUpdateTemplate } from './hooks';

type FormValues = z.infer<typeof createTemplateRequestSchema>;

const STARTER: FormValues = {
  slug: '',
  subject: 'Welcome, {{name}}',
  html: '<p>Hi {{name}},</p>\n<p>Your verification code is <strong>{{code}}</strong>.</p>',
};

/** `/templates/new` and `/templates/:id`: form on the left, live preview on the right. */
export function TemplateEditorPage() {
  const { org } = useOrg();
  const { id } = useParams();
  const existing = useTemplate(org.id, id);

  if (id && existing.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (id && existing.isError) {
    return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  }
  return (
    <Editor
      key={existing.data?.id ?? 'new'}
      initial={
        existing.data
          ? { slug: existing.data.slug, subject: existing.data.subject, html: existing.data.html }
          : STARTER
      }
      id={existing.data?.id}
    />
  );
}

function Editor({ initial, id }: { initial: FormValues; id: string | undefined }) {
  const { org } = useOrg();
  const navigate = useNavigate();
  const create = useCreateTemplate(org.id);
  const update = useUpdateTemplate(org.id);
  const [theme] = useTheme();
  const [sample, setSample] = useState('{\n  "name": "Ada",\n  "code": "482913"\n}');
  const [testing, setTesting] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(createTemplateRequestSchema),
    defaultValues: initial,
  });
  const subject = form.watch('subject');
  const body = form.watch('html');

  const variables = useMemo(() => extractVariables(subject, body), [subject, body]);
  const sampleVars = useMemo(() => parseSample(sample), [sample]);
  const missing = variables.filter((v) => !sampleVars.ok || !(v in sampleVars.value));
  const preview = useMemo(() => {
    const vars = sampleVars.ok ? sampleVars.value : {};
    return {
      subject: renderTemplateString(subject, vars),
      html: renderTemplateString(body, vars, escapeHtml),
    };
  }, [subject, body, sampleVars]);

  const save = form.handleSubmit(async (values) => {
    try {
      if (id) {
        await update.mutateAsync({ id, body: { subject: values.subject, html: values.html } });
        toast.success('Template saved');
        form.reset(values);
      } else {
        const created = await create.mutateAsync(values);
        toast.success(`Created ${created.slug}`);
        void navigate(orgPath(org.id, `/templates/${created.id}`), { replace: true });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <>
      <PageHeader
        title={id ? initial.slug : 'New template'}
        description={
          id
            ? 'Changes apply to the next send. Variables are re-detected on save.'
            : 'Placeholders are {{name}}; values are HTML-escaped in the body.'
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to={orgPath(org.id, '/templates')}>
                <ArrowLeft /> Back
              </Link>
            </Button>
            {id ? (
              <Button
                variant="secondary"
                onClick={() => setTesting(true)}
                disabled={form.formState.isDirty}
              >
                <Send /> Send test
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => void save()}
              loading={form.formState.isSubmitting}
              disabled={id ? !form.formState.isDirty : false}
            >
              {id ? 'Save changes' : 'Create template'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Template</CardTitle>
              <CardDescription>
                {variables.length ? (
                  <span className="flex flex-wrap items-center gap-1">
                    Variables:
                    {variables.map((v) => (
                      <Badge key={v} tone={missing.includes(v) ? 'warning' : 'outline'}>
                        {v}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  'No variables detected.'
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <form className="space-y-4 p-4" noValidate onSubmit={(e) => void save(e)}>
            <div>
              <Label htmlFor="tpl-slug">Slug</Label>
              <Input
                id="tpl-slug"
                placeholder="welcome-email"
                disabled={!!id}
                aria-invalid={!!form.formState.errors.slug}
                {...form.register('slug')}
              />
              <FieldError message={form.formState.errors.slug?.message} />
              {!id ? (
                <FieldHint>
                  Lowercase letters, digits and dashes. Used as the `template` value when sending.
                </FieldHint>
              ) : null}
            </div>
            <div>
              <Label htmlFor="tpl-subject">Subject</Label>
              <Input
                id="tpl-subject"
                aria-invalid={!!form.formState.errors.subject}
                {...form.register('subject')}
              />
              <FieldError message={form.formState.errors.subject?.message} />
            </div>
            <div>
              <Label htmlFor="tpl-html">HTML</Label>
              <Controller
                control={form.control}
                name="html"
                render={({ field }) => (
                  <div
                    className="overflow-hidden rounded border border-border-strong"
                    data-testid="html-editor"
                  >
                    <CodeMirror
                      id="tpl-html"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      height="320px"
                      theme={theme}
                      extensions={[html()]}
                      basicSetup={{
                        lineNumbers: true,
                        foldGutter: false,
                        highlightActiveLine: false,
                      }}
                      aria-label="HTML body"
                    />
                  </div>
                )}
              />
              <FieldError message={form.formState.errors.html?.message} />
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Sample variables</CardTitle>
                <CardDescription>
                  JSON used for the preview and prefilled in test sends.
                </CardDescription>
              </div>
            </CardHeader>
            <div className="p-4">
              <Label htmlFor="tpl-sample" className="sr-only">
                Sample variables JSON
              </Label>
              <Textarea
                id="tpl-sample"
                className="font-mono text-xs"
                rows={5}
                value={sample}
                onChange={(e) => setSample(e.target.value)}
                aria-invalid={!sampleVars.ok}
              />
              {!sampleVars.ok ? (
                <FieldError message="Not valid JSON: values must be an object of strings, numbers or booleans." />
              ) : null}
              {sampleVars.ok && missing.length ? (
                <FieldHint>
                  Missing: {missing.join(', ')}. A real send without them is rejected.
                </FieldHint>
              ) : null}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Preview</CardTitle>
                <CardDescription className="truncate">
                  Subject: {preview.subject || <span className="italic">empty</span>}
                </CardDescription>
              </div>
            </CardHeader>
            <div className="p-4">
              <iframe
                title="Template preview"
                sandbox=""
                srcDoc={preview.html}
                className="h-80 w-full rounded border border-border bg-white"
              />
            </div>
          </Card>
        </div>
      </div>

      {id ? (
        <SendTestDialog
          open={testing}
          onOpenChange={setTesting}
          templateId={id}
          sample={sampleVars.ok ? sampleVars.value : {}}
        />
      ) : null}
    </>
  );
}

type Vars = Record<string, string | number | boolean>;

function parseSample(text: string): { ok: true; value: Vars } | { ok: false } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return { ok: false };
    const out: Vars = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else return { ok: false };
    }
    return { ok: true, value: out };
  } catch {
    return { ok: false };
  }
}

function SendTestDialog({
  open,
  onOpenChange,
  templateId,
  sample,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: string;
  sample: Vars;
}) {
  const { org, user } = useOrg();
  const send = useSendTestTemplate(org.id);
  const [to, setTo] = useState(user.email);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Send a test</DialogTitle>
          <DialogDescription>
            Goes through the normal send path with the sample variables.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const result = await send.mutateAsync({
                id: templateId,
                body: { to, variables: sample },
              });
              toast.success(`Queued test email (${result.id.slice(0, 8)}…)`);
              onOpenChange(false);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          <DialogBody>
            <Label htmlFor="test-to">Send to</Label>
            <Input
              id="test-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={send.isPending}>
              <Send /> Send test
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
