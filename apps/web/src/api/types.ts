import type { paths } from './schema';

type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;

/** JSON body of the success response for a path+method, e.g. `ResponseOf<'/app/me', 'get'>`. */
export type ResponseOf<
  P extends keyof paths,
  M extends keyof paths[P],
  Status extends number = 200,
> = paths[P][M] extends { responses: infer R }
  ? Status extends keyof R
    ? Json<R[Status]>
    : never
  : never;

/** JSON request body for a path+method. */
export type BodyOf<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** Query parameters for a path+method. */
export type QueryOf<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  parameters: { query?: infer Q };
}
  ? NonNullable<Q>
  : never;

export type Me = ResponseOf<'/app/me', 'get'>;
export type Org = Me['orgs'][number];
export type Overview = ResponseOf<'/app/orgs/{orgId}/overview', 'get'>;
export type Email = ResponseOf<'/app/orgs/{orgId}/emails/{id}', 'get'>;
export type EmailList = ResponseOf<'/app/orgs/{orgId}/emails', 'get'>;
export type Mailbox = ResponseOf<'/app/orgs/{orgId}/mailboxes', 'get'>['data'][number];
export type ApiKey = ResponseOf<'/app/orgs/{orgId}/api-keys', 'get'>['data'][number];
export type ApiKeyCreated = ResponseOf<'/app/orgs/{orgId}/api-keys', 'post', 201>;
export type Template = ResponseOf<'/app/orgs/{orgId}/templates/{id}', 'get'>;
export type Webhook = ResponseOf<'/app/orgs/{orgId}/webhooks/{id}', 'get'>;
export type WebhookCreated = ResponseOf<'/app/orgs/{orgId}/webhooks', 'post', 201>;
export type WebhookDelivery = ResponseOf<
  '/app/orgs/{orgId}/webhooks/{id}/deliveries',
  'get'
>['data'][number];
export type Suppression = ResponseOf<'/app/orgs/{orgId}/suppressions', 'get'>['data'][number];
export type Member = ResponseOf<'/app/orgs/{orgId}/members', 'get'>['data'][number];
export type Invite = ResponseOf<'/app/orgs/{orgId}/invites', 'get'>['data'][number];
