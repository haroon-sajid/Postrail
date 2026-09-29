// Wire shapes live in @postrail/shared so the web app and SDKs can reuse them.
export {
  batchEmailItemSchema,
  emailListQuerySchema,
  emailListResponseSchema,
  emailSchema,
  idempotencyKeySchema,
  idParamSchema,
  sendEmailBatchRequestSchema,
  sendEmailBatchResponseSchema,
  sendEmailRequestSchema,
  sendEmailResponseSchema,
  type BatchEmailItem,
  type BatchItemResult,
  type Email,
  type EmailListQuery,
  type SendEmailRequest,
  type SendEmailResponse,
} from '@postrail/shared';
