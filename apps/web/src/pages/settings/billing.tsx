import { Pencil, Plus, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOrg } from '@/app/org-context';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LineTabsList, LineTabsTrigger, Tabs, TabsContent } from '@/components/ui/tabs';
import { PackagesTab } from './billing-packages';
import { PaymentsTab } from './billing-payments';
import { UtilizationTab } from './billing-utilization';
import { SettingsLayout } from './layout';
import { notAvailableYet } from './not-available';

const TABS = ['utilization', 'payments', 'packages'] as const;
type BillingTab = (typeof TABS)[number];

/**
 * Subscription at a glance, then usage, payments and plans as tabs. The open tab lives in
 * the URL (`?tab=packages`) so a link lands on it. Billing itself does not exist yet, so
 * usage is real and everything about money is laid out but inert.
 */
export function BillingSettingsPage() {
  const { org } = useOrg();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: BillingTab = TABS.find((t) => t === requested) ?? 'utilization';
  const setTab = (next: string) =>
    setParams(next === 'utilization' ? {} : { tab: next }, { replace: true });

  return (
    <>
      <PageHeader title="Billing" description="Your plan, usage, payments and packages." />
      <SettingsLayout>
        <Card>
          <dl className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <SummaryItem label="Workspace">
              <span className="truncate text-fg-muted">{org.name}</span>
              <Button asChild size="icon-sm" aria-label="Rename workspace">
                <Link to="/settings">
                  <Pencil />
                </Link>
              </Button>
            </SummaryItem>
            <SummaryItem label="Plan">
              Free
              <Button size="icon-sm" aria-label="Change plan" onClick={() => setTab('packages')}>
                <Settings2 />
              </Button>
            </SummaryItem>
            <SummaryItem label="Monthly add-ons">
              $0.00 <span className="text-xs font-normal text-fg-muted">/mo</span>
            </SummaryItem>
            <SummaryItem
              label="Credit balance"
              footer={
                <Button size="sm" onClick={() => notAvailableYet('Applying a coupon')}>
                  Apply coupon
                </Button>
              }
            >
              $0.00
              <Button
                size="icon-sm"
                aria-label="Add credit"
                onClick={() => notAvailableYet('Adding credit')}
              >
                <Plus />
              </Button>
            </SummaryItem>
            <SummaryItem
              label="Next invoice"
              footer={
                <button
                  type="button"
                  className="rounded-sm text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onClick={() => setTab('payments')}
                >
                  Add payment method
                </button>
              }
            >
              None
            </SummaryItem>
          </dl>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <LineTabsList aria-label="Billing sections">
            <LineTabsTrigger value="utilization">Utilization</LineTabsTrigger>
            <LineTabsTrigger value="payments">Payments</LineTabsTrigger>
            <LineTabsTrigger value="packages">Packages</LineTabsTrigger>
          </LineTabsList>
          <TabsContent value="utilization" className="pt-5 focus-visible:outline-none">
            <UtilizationTab />
          </TabsContent>
          <TabsContent value="payments" className="pt-5 focus-visible:outline-none">
            <PaymentsTab />
          </TabsContent>
          <TabsContent value="packages" className="pt-5 focus-visible:outline-none">
            <PackagesTab />
          </TabsContent>
        </Tabs>
      </SettingsLayout>
    </>
  );
}

function SummaryItem({
  label,
  footer,
  children,
}: {
  label: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 px-5 py-5">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-2 flex min-h-8 items-center gap-2 text-xl font-semibold leading-7 text-fg">
        {children}
      </dd>
      {footer ? <dd className="mt-2">{footer}</dd> : null}
    </div>
  );
}
