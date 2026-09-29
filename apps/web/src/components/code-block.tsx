import { CopyButton } from './copy-button';
import { cn } from '@/lib/utils';

/** Monospace block with a copy button. For curl and SDK snippets. */
export function CodeBlock({
  code,
  className,
  title,
}: {
  code: string;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded border border-border bg-navy text-[#e6e9ef] dark:bg-bg-muted dark:text-fg',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 dark:border-border">
        <span className="text-xs text-white/60 dark:text-fg-muted">{title ?? 'shell'}</span>
        <CopyButton
          value={code}
          label="Snippet"
          className="text-white/70 hover:text-white dark:text-fg-muted"
        />
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-5">
        <code>{code}</code>
      </pre>
    </div>
  );
}
