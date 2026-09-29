/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the Postrail API, e.g. http://localhost:8080. */
  readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
