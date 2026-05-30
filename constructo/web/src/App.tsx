import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Components } from './pages/Components'
import { Dashboard } from './pages/Dashboard'
import { Groups } from './pages/Groups'
import { SiteDetail } from './pages/SiteDetail'
import { Sites } from './pages/Sites'
// === auth/settings (feature: auth) ===
import { Login } from './pages/auth/Login'
import { OwnerFirstRun } from './pages/auth/OwnerFirstRun'
import { Join } from './pages/auth/Join'
import { InvitePage } from './pages/auth/InvitePage'
import { Settings } from './pages/settings/Settings'
// === brief/owner ===
import { OwnerHome } from './pages/owner/OwnerHome'
// === capture/attendance ===
import { SupervisorCapture } from './pages/supervisor/SupervisorCapture'
import { MukadamAttendance } from './pages/mukadam/MukadamAttendance'
// === reconcile ===
import { ReconcilePage } from './pages/reconcile/ReconcilePage'
// === approvals ===
import { ApprovalInbox } from './pages/approvals/Inbox'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* === auth/settings (feature: auth) === */}
      <Route path="/join/:token" element={<Join />} />
      <Route
        path="/welcome"
        element={
          <RequireAuth>
            <OwnerFirstRun />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <Settings />
          </RequireAuth>
        }
      />
      <Route
        path="/invite"
        element={
          <RequireAuth>
            <InvitePage />
          </RequireAuth>
        }
      />
      {/* Public design-system gallery — view the full kit in both themes. */}
      <Route path="/components" element={<Components />} />
      {/* Dashboard brings its own AppShell (context header + role tab bar). */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      {/* phaseB brief/owner — Owner Home (brings its own AppShell). */}
      <Route
        path="/owner"
        element={
          <RequireAuth>
            <OwnerHome />
          </RequireAuth>
        }
      />
      {/* Field-role screens (capture feature) bring their own AppShell. */}
      <Route
        path="/supervisor/capture"
        element={
          <RequireAuth>
            <SupervisorCapture />
          </RequireAuth>
        }
      />
      <Route
        path="/mukadam/attendance"
        element={
          <RequireAuth>
            <MukadamAttendance />
          </RequireAuth>
        }
      />
      {/* Approval Inbox brings its own Site-themed surface (full screen). */}
      <Route
        path="/approvals"
        element={
          <RequireAuth>
            <ApprovalInbox />
          </RequireAuth>
        }
      />
      {/* The remaining pages keep the existing Layout chrome for now. */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/sites" element={<Sites />} />
        <Route path="/sites/:id" element={<SiteDetail />} />
        <Route path="/reconcile" element={<ReconcilePage />} />
        <Route path="/groups" element={<Groups />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
