/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional absolute API origin. Leave unset to call the API on the same
   * origin that serves the app (production) or via the Vite dev proxy (dev).
   */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
