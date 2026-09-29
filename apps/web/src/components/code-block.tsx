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
        'overflow-hidden rounded-lg border border-navy/80 bg-navy text-[#dfe4ec] dark:border-border dark:bg-bg-subtle dark:text-fg',
        className,
      )}
    >
      <div className="flex h-9 items-center justify-between border-b border-white/10 pl-4 pr-2 dark:border-border">
        <span className="font-mono text-xs text-white/50 dark:text-fg-muted">
          {title ?? 'shell'}
        </span>
        <CopyButton
          value={code}
          label="Snippet"
          className="text-white/60 hover:bg-white/10 hover:text-white dark:text-fg-muted dark:hover:bg-bg-muted dark:hover:text-fg"
        />
      </div>
      <pre className="scrollbar-thin overflow-x-auto p-4 text-xs leading-5">
        <code>{code}</code>
      </pre>
    </div>
  );
}
