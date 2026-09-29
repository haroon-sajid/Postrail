import { AlertTriangle, Info, XCircle } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const styles = {
  info: { box: 'border-info-fg/20 bg-info-bg text-info-fg', Icon: Info },
  warning: { box: 'border-warning/30 bg-warning-bg text-warning-fg', Icon: AlertTriangle },
  danger: { box: 'border-danger/30 bg-danger-bg text-danger-fg', Icon: XCircle },
};

export function Alert({
  tone = 'info',
  title,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof styles; title?: string }) {
  const { box, Icon } = styles[tone];
  return (
    <div
      role="status"
      className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', box, className)}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5 opacity-90')}>{children}</div> : null}
      </div>
    </div>
  );
}
