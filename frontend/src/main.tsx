import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import { client } from './api'
import { Shell } from './components/Shell'
import { Loading } from './components/ui'
import { NetworkProvider } from './network'
import { Overview } from './pages/Overview'
import './styles.css'

const AnalyticsPage = lazy(() => import('./pages/Analytics').then((page) => ({ default: page.AnalyticsPage })))
const CommandPage = lazy(() => import('./pages/Command').then((page) => ({ default: page.CommandPage })))
const LivePage = lazy(() => import('./pages/Live').then((page) => ({ default: page.LivePage })))
const ResponderPage = lazy(() => import('./pages/Responder').then((page) => ({ default: page.ResponderPage })))
const ShelterPage = lazy(() => import('./pages/Shelter').then((page) => ({ default: page.ShelterPage })))
const SimulationPage = lazy(() => import('./pages/Simulation').then((page) => ({ default: page.SimulationPage })))
const SosPage = lazy(() => import('./pages/Sos').then((page) => ({ default: page.SosPage })))

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <NetworkProvider>
      <HashRouter>
        <Shell>
          <Suspense fallback={<Loading />}><Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/command" element={<CommandPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/sos" element={<SosPage />} />
            <Route path="/responder" element={<ResponderPage />} />
            <Route path="/shelters" element={<ShelterPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes></Suspense>
        </Shell>
      </HashRouter>
    </NetworkProvider>
  </QueryClientProvider>,
)
