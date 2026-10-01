import { toast } from 'sonner';

/**
 * Some settings are laid out ahead of the feature (billing, account deletion). A control
 * that cannot act yet says so instead of doing nothing; `what` reads as the subject, e.g.
 * "Upgrading". The default description is the billing one.
 */
export function notAvailableYet(
  what: string,
  description = 'Postrail is free while in preview. Nothing is billed.',
): void {
  toast.message(`${what} is not available yet`, { description });
}
