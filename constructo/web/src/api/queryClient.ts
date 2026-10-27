import { QueryClient } from '@tanstack/react-query'

/** The app's one React Query cache. Sign-out and an ended session clear it
 *  (auth/session.ts), so the next person never sees the last company's data. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})
