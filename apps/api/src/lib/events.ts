import { type WebhookEvent } from '@postrail/shared';

/** Fan-out point for things tenants can subscribe to. The webhooks service implements it. */
export interface EventBus {
  emit: (orgId: string, event: WebhookEvent, data: Record<string, unknown>) => Promise<void>;
}

export const noopEventBus: EventBus = { emit: () => Promise.resolve() };
