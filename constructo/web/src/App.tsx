import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Components } from './pages/Components'
import { Dashboard } from './pages/Dashboard'
import { Groups } from './pages/Groups'
import { Login } from './pages/Login'
import { Search } from './pages/search/Search'
import { SiteDetail } from './pages/SiteDetail'
import { Sites } from './pages/Sites'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
      {/* Search brings its own ThemeProvider chrome (like the Dashboard). */}
      <Route
        path="/search"
        element={
          <RequireAuth>
            <Search />
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
        <Route path="/groups" element={<Groups />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
