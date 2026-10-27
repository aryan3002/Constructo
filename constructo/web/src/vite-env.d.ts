/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_USE_MOCKS?: string
  readonly VITE_PRIVACY_URL?: string
  readonly VITE_TERMS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
