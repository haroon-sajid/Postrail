import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

/** Small icon button that copies `value`. Put one next to every id, key prefix and email. */
export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`${label}: ${value}`}
      className={cn('text-fg-muted', className)}
      onClick={async (e) => {
        e.stopPropagation();
        await copyToClipboard(value, label === 'Copy' ? 'Copied' : `${label} copied`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

/** Monospace value with a copy button, e.g. an id or key prefix. */
export function Copyable({
  value,
  display,
  className,
}: {
  value: string;
  display?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <code className="rounded bg-bg-muted px-1 py-0.5 text-xs">{display ?? value}</code>
      <CopyButton value={value} />
    </span>
  );
}
