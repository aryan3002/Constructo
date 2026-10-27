import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { queryClient } from './api/queryClient'
import { installSessionGuard } from './auth/session'
import { LanguageProvider } from './i18n'
import { ThemeModeProvider } from './ui/ThemeModeProvider'
import { OwnerSkinSync } from './ui/OwnerSkinSync'
import { ToastProvider } from './ui/Toast'
import './ui/fonts.css'
import './index.css'

// An expired or revoked token on any API call ends the session in one place.
installSessionGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <OwnerSkinSync />
        <LanguageProvider>
          <ToastProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </LanguageProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
