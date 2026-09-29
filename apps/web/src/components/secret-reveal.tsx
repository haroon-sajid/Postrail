import { AlertTriangle } from 'lucide-react';
import { CopyButton } from './copy-button';

/** Shows a secret exactly once, with a copy button and an unmissable warning. */
export function SecretReveal({
  value,
  label,
  warning,
}: {
  value: string;
  label: string;
  warning?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-fg">{label}</p>
      <div className="flex items-center gap-1 rounded border border-border-strong bg-bg-subtle p-2">
        <code className="min-w-0 flex-1 select-all break-all text-xs" data-testid="secret-value">
          {value}
        </code>
        <CopyButton value={value} label={label} />
      </div>
      <p className="flex items-start gap-1.5 text-xs text-warning-fg">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {warning ?? 'Copy it now. It will not be shown again.'}
      </p>
    </div>
  );
}
