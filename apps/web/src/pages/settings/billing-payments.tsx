import { CreditCard, Plus, Receipt } from 'lucide-react';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SettingsSection } from './layout';
import { notAvailableYet } from './not-available';

/** The card on file and what has been charged. Both are empty until billing exists. */
export function PaymentsTab() {
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Payment method"
        description="Your default card is used for any recurring charges on this workspace."
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-dashed border-border-strong px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg-subtle text-fg-muted">
              <CreditCard className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">No payment method on file</p>
              <p className="text-xs text-fg-muted">None is needed while Postrail is free.</p>
            </div>
          </div>
          <Button onClick={() => notAvailableYet('Adding a payment method')}>
            <Plus /> Add payment method
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        flush
        title="Billing history"
        description="Invoices and receipts for this workspace."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Invoice</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
        <EmptyState
          icon={Receipt}
          title="No payments yet"
          description="Postrail is free while in preview, so there is nothing to bill."
        />
      </SettingsSection>
    </div>
  );
}
