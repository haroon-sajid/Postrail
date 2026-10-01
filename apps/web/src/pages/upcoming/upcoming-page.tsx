import { ArrowRight, Check, ExternalLink, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { navItemFor } from '@/app/nav';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PUBLIC_API_URL } from '@/lib/config';
import type { UpcomingFeature } from './upcoming';

/** A planned feature as a page of its own, titled and iconed from its nav item. */
export function UpcomingPage({ feature }: { feature: UpcomingFeature }) {
  const icon = navItemFor(useLocation().pathname)?.icon;
  return (
    <>
      <PageHeader title={feature.title} description={feature.description} />
      <UpcomingBody feature={feature} icon={icon} />
    </>
  );
}

/** What the feature will do, and what to use until it exists. Fills the space it is given. */
export function UpcomingBody({
  feature,
  icon: Icon,
}: {
  feature: UpcomingFeature;
  icon?: LucideIcon | undefined;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      {Icon ? (
        <span className="flex size-12 items-center justify-center rounded-lg border border-border bg-bg-subtle text-fg-muted">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <Badge tone="outline" className="mt-5">
        Coming soon
      </Badge>
      <h2 className="mt-3 text-xl font-semibold leading-7 text-fg">{feature.headline}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-fg-muted">{feature.body}</p>
      <ul className="mt-6 space-y-2.5 text-left text-sm text-fg">
        {feature.points.map((point) => (
          <li key={point} className="flex items-center gap-2.5">
            <Check className="size-4 shrink-0 text-primary" aria-hidden />
            {point}
          </li>
        ))}
      </ul>
      <Button asChild className="mt-8">
        {feature.today.external ? (
          <a href={`${PUBLIC_API_URL}${feature.today.to}`} target="_blank" rel="noreferrer">
            {feature.today.label} <ExternalLink />
          </a>
        ) : (
          <Link to={feature.today.to}>
            {feature.today.label} <ArrowRight />
          </Link>
        )}
      </Button>
    </div>
  );
}
