import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { RequireAuth } from './components/RequireAuth'
import { Spinner } from './components/states'
import { Components } from './pages/Components'
import { Groups } from './pages/Groups'
import { More } from './pages/More'
// === payments/permits ===
import { Payments } from './pages/payments/Payments'
import { Permits } from './pages/permits/Permits'
import { SiteDetail } from './pages/SiteDetail'
import { Sites } from './pages/Sites'
// === auth/settings (feature: auth) ===
import { Login } from './pages/auth/Login'
import { OwnerFirstRun } from './pages/auth/OwnerFirstRun'
import { Join } from './pages/auth/Join'
import { VendorConfirm } from './pages/VendorConfirm'
import { InvitePage } from './pages/auth/InvitePage'
import { RoleLanding } from './pages/auth/RoleLanding'
import { Settings } from './pages/settings/Settings'
// === setup & administration control plane (W4.1) === (lazy: keeps RHF + Zod
// out of the entry chunk — only the owner who opens /settings/admin pays for it)
const AdminConsole = lazy(() =>
  import('./features/admin/AdminConsole').then((m) => ({ default: m.AdminConsole })),
)
// === brief/owner ===
import { OwnerHome } from './pages/owner/OwnerHome'
// === pm "today" (W3.4) ===
import { Today as PmToday } from './features/pm/Today'
// === capture/attendance ===
import { SupervisorCapture } from './pages/supervisor/SupervisorCapture'
import { MukadamAttendance } from './pages/mukadam/MukadamAttendance'
// === reconcile === (lazy: keeps the DataGrid + TanStack Table/Virtual out of
// the entry chunk — only the accountant/owner who opens /reconcile pays for it)
const ReconcilePage = lazy(() =>
  import('./pages/reconcile/ReconcilePage').then((m) => ({
    default: m.ReconcilePage,
  })),
)
// === approvals ===
import { ApprovalInbox } from './pages/approvals/Inbox'
// === dpr (PM auto-DPR review) === lazy: AI-draft surface
const DprPage = lazy(() =>
  import('./pages/dpr/DprPage').then((m) => ({ default: m.DprPage })),
)
// === search ===
import { Search } from './pages/search/Search'
// === designer workspace shell (D4) === lazy: keeps the D2+D3 surface out of
// the entry chunk — only the architect who opens /designer pays for it
const DesignerWorkspace = lazy(() =>
  import('./features/designer/DesignerWorkspace').then((m) => ({
    default: m.DesignerWorkspace,
  })),
)
// === reports (W5 Slice 1) === lazy: PDF workers + preview surface kept out of entry chunk
const ReportsPage = lazy(() =>
  import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
// === documents register (W5 Slice 2a) === lazy: keeps register UI out of entry chunk
const DocumentsPage = lazy(() =>
  import('./features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
)
// === chat (T13) === lazy: keeps socket + thread out of entry chunk
const ChatPage = lazy(() =>
  import('./features/chat/ChatPage').then((m) => ({ default: m.ChatPage })),
)

/** Wrap a page that brings its own AppShell/Theme chrome in the auth gate. */
function Guarded({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}

/**
 * The full route map. Every page brings its own AppShell (role tab bar +
 * SiteSwitcher) or ThemeSurface, so there is no shared generic-Tailwind Layout
 * anymore. `/` is a role-aware landing redirect (the IA "where do I land" map);
 * each role lands on its correct home and can reach every screen it owns.
 *
 * Route map:
 *   /login, /join/:token, /welcome, /invite, /components  — auth + gallery
 *   /                       -> RoleLanding (redirects by role)
 *   /owner                  -> Owner/PM brief
 *   /supervisor/capture     -> Supervisor capture
 *   /mukadam/attendance     -> Mukadam attendance + my payments
 *   /reconcile              -> Accountant/Procurement reconcile
 *   /approvals              -> Approval inbox
 *   /search                 -> Ledger search
 *   /payments, /permits     -> Money + permits
 *   /sites, /sites/:id      -> Sites list + detail
 *   /groups                 -> WhatsApp group mapping
 *   /more                   -> Per-role overflow hub (+ Settings, Sign out)
 *   /settings               -> Profile / language / display
 */
export function App() {
  return (
    <>
      <CommandPalette />
      <Suspense fallback={<Spinner />}>
      <Routes>
      <Route path="/login" element={<Login />} />
      {/* === auth/settings (feature: auth) === */}
      <Route path="/join/:token" element={<Join />} />
      {/* Public vendor confirm-loop (Phase 3.8) — no auth; token is the capability. */}
      <Route path="/vendor-confirm/:token" element={<VendorConfirm />} />
      <Route path="/welcome" element={<Guarded><OwnerFirstRun /></Guarded>} />
      <Route path="/settings" element={<Guarded><Settings /></Guarded>} />
      {/* Setup & Administration control plane (W4.1). */}
      <Route path="/settings/admin" element={<Guarded><AdminConsole /></Guarded>} />
      <Route path="/invite" element={<Guarded><InvitePage /></Guarded>} />

      {/* Public design-system gallery — view the full kit in both themes. */}
      <Route path="/components" element={<Components />} />

      {/* Role-aware landing redirect (the "where do I land" map). */}
      <Route path="/" element={<Guarded><RoleLanding /></Guarded>} />

      {/* Owner brief. */}
      <Route path="/owner" element={<Guarded><OwnerHome /></Guarded>} />

      {/* PM "Today" — multi-site execution glance (W3.4). */}
      <Route path="/pm" element={<Guarded><PmToday /></Guarded>} />

      {/* Field-role screens (capture feature) bring their own AppShell. */}
      <Route path="/supervisor/capture" element={<Guarded><SupervisorCapture /></Guarded>} />
      <Route path="/mukadam/attendance" element={<Guarded><MukadamAttendance /></Guarded>} />

      {/* Accountant / Procurement. */}
      <Route path="/reconcile" element={<Guarded><ReconcilePage /></Guarded>} />

      {/* Designer workspace shell (D4) — the architect's unified cockpit. */}
      <Route path="/designer" element={<Guarded><DesignerWorkspace /></Guarded>} />

      {/* Spec schedule — legacy route; redirect to the /designer?tab=selections cockpit. */}
      <Route path="/spec-desk" element={<Navigate to="/designer?tab=selections" replace />} />

      {/* Approval Inbox (Site-themed full screen). */}
      <Route path="/approvals" element={<Guarded><ApprovalInbox /></Guarded>} />

      {/* PM Auto-DPR review (draft → review → share; never auto-sends). */}
      <Route path="/dpr" element={<Guarded><DprPage /></Guarded>} />

      {/* Search (own ThemeProvider chrome). */}
      <Route path="/search" element={<Guarded><Search /></Guarded>} />

      {/* Money + permits. */}
      <Route path="/payments" element={<Guarded><Payments /></Guarded>} />
      <Route path="/permits" element={<Guarded><Permits /></Guarded>} />
      <Route path="/permits/site/:siteId" element={<Guarded><Permits /></Guarded>} />

      {/* Sites list + detail. */}
      <Route path="/sites" element={<Guarded><Sites /></Guarded>} />
      <Route path="/sites/:id" element={<Guarded><SiteDetail /></Guarded>} />

      {/* WhatsApp group mapping. */}
      <Route path="/groups" element={<Guarded><Groups /></Guarded>} />

      {/* Reports & exports (W5 Slice 1). */}
      <Route path="/reports" element={<Guarded><ReportsPage /></Guarded>} />

      {/* Drawings register (W5 Slice 2a). */}
      <Route path="/settings/documents" element={<Guarded><DocumentsPage /></Guarded>} />

      {/* Chat inbox (T13). */}
      <Route path="/chat" element={<Guarded><ChatPage /></Guarded>} />

      {/* Per-role overflow hub. */}
      <Route path="/more" element={<Guarded><More /></Guarded>} />

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  )
}
