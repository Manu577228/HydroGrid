import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import { AccountProvider } from './account'
import { client } from './api'
import { Shell } from './components/Shell'
import { Loading } from './components/ui'
import { NetworkProvider } from './network'
import { Overview } from './pages/Overview'
import './styles.css'

const AnalyticsPage = lazy(() => import('./pages/Analytics').then((page) => ({ default: page.AnalyticsPage })))
const CommandPage = lazy(() => import('./pages/Command').then((page) => ({ default: page.CommandPage })))
const LivePage = lazy(() => import('./pages/Live').then((page) => ({ default: page.LivePage })))
const OperationsPage = lazy(() => import('./pages/Operations').then((page) => ({ default: page.OperationsPage })))
const ResponderPage = lazy(() => import('./pages/Responder').then((page) => ({ default: page.ResponderPage })))
const ShelterPage = lazy(() => import('./pages/Shelter').then((page) => ({ default: page.ShelterPage })))
const SimulationPage = lazy(() => import('./pages/Simulation').then((page) => ({ default: page.SimulationPage })))
const SosPage = lazy(() => import('./pages/Sos').then((page) => ({ default: page.SosPage })))

const DashboardPage = lazy(() => import('./pages/Dashboard').then((page) => ({ default: page.DashboardPage })))
const IncidentsPage = lazy(() => import('./pages/Incidents').then((page) => ({ default: page.IncidentsPage })))
const ResourcesPage = lazy(() => import('./pages/Resources').then((page) => ({ default: page.ResourcesPage })))
const LoginPage = lazy(() => import('./pages/Account').then((page) => ({ default: page.LoginPage })))
const RegisterPage = lazy(() => import('./pages/Account').then((page) => ({ default: page.RegisterPage })))
const ProfilePage = lazy(() => import('./pages/Account').then((page) => ({ default: page.ProfilePage })))

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <HashRouter>
      <AccountProvider>
        <NetworkProvider>
        <Shell>
          <Suspense fallback={<Loading />}><Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/units" element={<ResourcesPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/command" element={<CommandPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="/sos" element={<SosPage />} />
            <Route path="/responder" element={<ResponderPage />} />
            <Route path="/shelters" element={<ShelterPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes></Suspense>
        </Shell>
        </NetworkProvider>
      </AccountProvider>
    </HashRouter>
  </QueryClientProvider>,
)
