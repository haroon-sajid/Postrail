import { loadDotenv } from '@postrail/shared';
import { defineConfig } from 'drizzle-kit';

// `generate` works offline; only `migrate` needs credentials, so a missing URL is not fatal here.
loadDotenv();
const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  ...(url ? { dbCredentials: { url } } : {}),
});
