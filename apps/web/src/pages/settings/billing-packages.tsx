import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SettingsSection } from './layout';
import { notAvailableYet } from './not-available';
import { ENTERPRISE, PLANS, type Plan } from './plans';

/** The plan catalogue. Only the free plan is real today; see plans.ts. */
export function PackagesTab() {
  return (
    <SettingsSection
      title="Plans"
      description="Choose a plan for this workspace. Postrail is free while in preview: the paid plans show what is planned and cannot be purchased yet."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
      <EnterpriseCard />
    </SettingsSection>
  );
}

const planCardClass = 'rounded-lg border border-border bg-bg-subtle/50 p-6';

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={cn(
        planCardClass,
        'flex flex-col',
        plan.current && 'border-primary/50 bg-primary/[0.05]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold leading-7 text-fg">{plan.name}</h3>
        {plan.current ? (
          <Badge tone="success">Current plan</Badge>
        ) : (
          <Badge tone="outline">Coming soon</Badge>
        )}
      </div>
      <p className="mt-5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="tabular text-3xl font-semibold leading-9 text-fg">{plan.price}</span>
        <span className="text-xs text-fg">{plan.priceNote}</span>
      </p>

      <dl className="mt-6 space-y-3.5 text-sm">
        {plan.headline.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-fg">{label}</dt>
            <dd className="text-right font-semibold text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <dl className="mt-5 space-y-2.5 border-t border-border-strong pt-4 text-xs">
        {plan.details.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="text-right text-fg">{value}</dd>
          </div>
        ))}
      </dl>

      {!plan.current ? (
        <Button
          variant="primary"
          className="mt-6 w-full"
          onClick={() => notAvailableYet(`Upgrading to ${plan.name}`)}
        >
          Upgrade
        </Button>
      ) : null}
    </div>
  );
}

function EnterpriseCard() {
  return (
    <div className={cn(planCardClass, 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')}>
      <div>
        <h3 className="text-2xl font-semibold leading-8 text-fg">{ENTERPRISE.name}</h3>
        <p className="mt-2 text-sm text-fg">{ENTERPRISE.tagline}</p>
        <Button
          variant="primary"
          className="mt-5 w-full"
          onClick={() => notAvailableYet('Contacting sales')}
        >
          Contact sales
        </Button>
      </div>
      <div>
        <p className="text-sm font-semibold text-fg">{ENTERPRISE.featuresTitle}</p>
        <ul className="mt-3 grid gap-x-6 gap-y-2.5 text-sm text-fg sm:grid-cols-2 xl:grid-cols-3">
          {ENTERPRISE.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
