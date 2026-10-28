import {
  AUTH_MAX_REDIRECT_URLS,
  normalizeRedirectUrl,
  redirectUrlSchema,
} from '@postrail/shared/browser';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';

export interface RedirectUrlsEditorProps {
  /** The saved list. Remount (change `key`) to adopt a new one after a save. */
  urls: string[];
  canManage: boolean;
  /** Resolves true when the list was saved. */
  onSave: (urls: string[]) => Promise<boolean>;
}

/**
 * Edits the allow-list as a draft: add and remove locally, then save the whole list, so a
 * half-edited list never reaches the API and sign-ins in flight keep working until then.
 */
export function RedirectUrlsEditor({ urls, canManage, onSave }: RedirectUrlsEditorProps) {
  const [list, setList] = useState(urls);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const dirty = list.length !== urls.length || list.some((url, i) => url !== urls[i]);

  const add = () => {
    const parsed = redirectUrlSchema.safeParse(draft.trim());
    if (!parsed.success) {
      setError('Enter an https URL (http on localhost) without a query or fragment.');
      return;
    }
    const url = normalizeRedirectUrl(parsed.data);
    if (list.includes(url)) {
      setError('That URL is already in the list.');
      return;
    }
    if (list.length >= AUTH_MAX_REDIRECT_URLS) {
      setError(`A workspace can have at most ${AUTH_MAX_REDIRECT_URLS} redirect URLs.`);
      return;
    }
    setList([...list, url]);
    setDraft('');
    setError(undefined);
  };

  return (
    <div className="space-y-4">
      {list.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.map((url) => (
            <li key={url} className="flex items-center gap-1 py-1 pl-3 pr-1">
              <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
              <CopyButton value={url} label="URL" />
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${url}`}
                  className="text-fg-muted hover:text-danger-fg"
                  onClick={() => setList(list.filter((u) => u !== url))}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-fg-muted">
          No redirect URLs yet. Google and magic-link sign-in stay refused until you add one.
        </p>
      )}

      {canManage ? (
        <div>
          <Label htmlFor="redirect-url">Add a redirect URL</Label>
          <div className="flex gap-2">
            <Input
              id="redirect-url"
              type="url"
              placeholder="https://yourapp.com/auth/callback"
              value={draft}
              aria-invalid={!!error}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button type="button" onClick={add} disabled={!draft.trim()}>
              <Plus /> Add
            </Button>
          </div>
          <FieldError message={error} />
          <FieldHint>
            The exact page in your app that receives <code>?code=...</code>. Use http only for
            localhost.
          </FieldHint>
        </div>
      ) : null}

      {canManage ? (
        <div className="flex items-center justify-end gap-3">
          {dirty ? <span className="text-xs text-fg-muted">Unsaved changes</span> : null}
          <Button
            type="button"
            variant="primary"
            disabled={!dirty || saving}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(list);
              setSaving(false);
            }}
          >
            Save redirect URLs
          </Button>
        </div>
      ) : null}
    </div>
  );
}
