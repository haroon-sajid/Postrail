/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute URL of the Postrail API, e.g. https://postrail-api.onrender.com. Baked in at
   * build time. Optional on localhost, required everywhere else; see src/lib/config.ts.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
