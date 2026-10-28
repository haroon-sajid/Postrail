import { AUTH_TEMPLATE_VARIABLES, type AuthEmailKind } from '@postrail/shared/browser';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuthSettings, Template } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSection } from '@/pages/settings/layout';
import type { UpdateAuthSettingsBody } from './hooks';

/** Radix Select cannot hold an empty value, so "no template" needs a name of its own. */
const BUILT_IN = '__built_in__';

const KINDS: { kind: AuthEmailKind; label: string }[] = [
  { kind: 'magic_link', label: 'Magic link email' },
  { kind: 'email_otp', label: 'Email code email' },
];

/** A template can carry a sign-in email when Postrail can fill in everything it asks for. */
export function templateFits(template: Pick<Template, 'variables'>, kind: AuthEmailKind): boolean {
  const allowed: readonly string[] = AUTH_TEMPLATE_VARIABLES[kind];
  return (
    template.variables.includes(AUTH_TEMPLATE_VARIABLES[kind][0]) &&
    template.variables.every((v) => allowed.includes(v))
  );
}

export interface EmailsSectionProps {
  settings: AuthSettings;
  templates: Template[];
  canManage: boolean;
  save: (body: UpdateAuthSettingsBody, done: string) => Promise<boolean>;
}

/** The name sign-in emails use, and which template each of them is written with. */
export function EmailsSection({ settings, templates, canManage, save }: EmailsSectionProps) {
  const { org } = useOrg();
  const [name, setName] = useState(settings.app_name ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== (settings.app_name ?? '');

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        // An empty name means "use the workspace name", which the API stores as null.
        await save({ app_name: name.trim() || null }, 'App name saved');
        setSaving(false);
      }}
    >
      <SettingsSection
        title="Sign-in emails"
        description={
          <>
            Links and codes are sent from your{' '}
            <Link to="/mailboxes" className="text-primary underline">
              connected mailboxes
            </Link>
            . They are listed in Logs, but their content is hidden and deleted once sent.
          </>
        }
        footer={
          canManage ? (
            <Button type="submit" variant="primary" disabled={!dirty || saving} loading={saving}>
              Save app name
            </Button>
          ) : null
        }
      >
        <div className="max-w-md">
          <Label htmlFor="app-name">App name</Label>
          <Input
            id="app-name"
            maxLength={80}
            placeholder={org.name}
            disabled={!canManage}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldHint>
            Used in the subject, as in &quot;Sign in to {name.trim() || org.name}&quot;. Leave empty
            to use the workspace name.
          </FieldHint>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {KINDS.map(({ kind, label }) => {
            const [required, ...optional] = AUTH_TEMPLATE_VARIABLES[kind];
            const fitting = templates.filter((t) => templateFits(t, kind));
            const chosen = settings.email_templates[kind];
            return (
              <div key={kind}>
                <Label htmlFor={`template-${kind}`}>{label}</Label>
                <Select
                  value={chosen ?? BUILT_IN}
                  disabled={!canManage}
                  onValueChange={(value) => {
                    const slug = value === BUILT_IN ? null : value;
                    const email_templates: UpdateAuthSettingsBody['email_templates'] = {};
                    email_templates[kind] = slug;
                    void save(
                      { email_templates },
                      slug ? `${label} now uses "${slug}"` : `${label} uses the built-in wording`,
                    );
                  }}
                >
                  <SelectTrigger id={`template-${kind}`} aria-label={label}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BUILT_IN}>Built-in wording</SelectItem>
                    {fitting.map((t) => (
                      <SelectItem key={t.id} value={t.slug}>
                        {t.slug}
                      </SelectItem>
                    ))}
                    {/* Still chosen but no longer usable: show it, so the choice is visible. */}
                    {chosen && !fitting.some((t) => t.slug === chosen) ? (
                      <SelectItem value={chosen}>{chosen} (missing)</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
                <FieldHint>
                  A template for this must contain <code>{`{{${required}}}`}</code> and may use{' '}
                  {optional.map((v, i) => (
                    <span key={v}>
                      {i > 0 ? ', ' : ''}
                      <code>{`{{${v}}}`}</code>
                    </span>
                  ))}
                  .
                </FieldHint>
              </div>
            );
          })}
        </div>
      </SettingsSection>
    </form>
  );
}
