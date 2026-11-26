import { CheckCircle2, CloudUpload, History, MapPin, Send, ShieldAlert, Users, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { Button, Empty, ErrorNotice, hazardLabels, PageTitle, PanelTitle, timestamp } from '../components/ui'
import { useNetwork } from '../network'
import { queueReport, synchronize, useQueue } from '../offline'
import { useSnapshot } from '../snapshots'
import type { Hazard, IncidentInput, RoadNode, Severity } from '../types'

const descriptions: Record<Hazard, string> = {
  FLOOD: 'Flood rescue request', MEDICAL: 'Medical aid request', LANDSLIDE: 'Landslide rescue request',
  INFRASTRUCTURE: 'Infrastructure incident', OTHER: 'General assistance request',
}
const defaultLocation: RoadNode = { id: 'N06', label: 'Market Cross', lat: 12.9806, lng: 77.6092 }

export function SosPage() {
  const { offline, simulated, setSimulated } = useNetwork()
  const queue = useQueue().filter((action) => action.kind === 'report').slice().reverse()
  const graph = useSnapshot(['graph', 'citizen'], () => api.graph('CITIZEN'))
  const [hazard, setHazard] = useState<Hazard>('FLOOD')
  const [people, setPeople] = useState(3)
  const [depthCm, setDepthCm] = useState(40)
  const [medical, setMedical] = useState(false)
  const [vulnerable, setVulnerable] = useState(false)
  const [immediateDanger, setImmediateDanger] = useState(false)
  const [reportedSeverity, setReportedSeverity] = useState<Severity>('MEDIUM')
  const [nodeId, setNodeId] = useState(defaultLocation.id)
  const [error, setError] = useState<unknown>()
  const [saving, setSaving] = useState(false)
  const availableNodes = graph.data?.nodes ?? [defaultLocation]
  const location = availableNodes.find((node) => node.id === nodeId) ?? availableNodes[0] ?? defaultLocation
  const pending = queue.filter((action) => action.status === 'pending').length

  async function save() {
    setSaving(true)
    setError(undefined)
    try {
      await queueReport({
        summary: descriptions[hazard], hazard, people, depthCm: hazard === 'FLOOD' ? depthCm : 0,
        medical, vulnerable, immediateDanger, reportedSeverity, lat: location.lat, lng: location.lng,
      })
    } catch (problem) {
      setError(problem)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageTitle title="Citizen SOS" description="Submit a simulated emergency report from a location on the demonstration map." />
    <div className="workspace-split">
      <section className="panel form-panel">
        <PanelTitle icon={<ShieldAlert size={18} />} title="Emergency report" detail="Fictional information only" />
        <form className="form-stack panel-body" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <div className="form-grid">
            <label className="field-label">Emergency type<select value={hazard} onChange={(event) => setHazard(event.target.value as Hazard)}>
              {Object.entries(hazardLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="field-label">Reported severity<select value={reportedSeverity} onChange={(event) => setReportedSeverity(event.target.value as Severity)}>
              <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
            </select></label>
          </div>
          <label className="field-label"><span><MapPin size={15} /> Simulated location</span><select value={location.id} onChange={(event) => setNodeId(event.target.value)}>
            {availableNodes.map((node) => <option value={node.id} key={node.id}>{node.label} · {node.id}</option>)}
          </select></label>
          <div className="form-grid">
            <label className="field-label"><span><Users size={15} /> People affected</span><input type="number" min="1" max="100" required value={people || ''} onChange={(event) => setPeople(Number(event.target.value))} /></label>
            {hazard === 'FLOOD' && <label className="field-label">Reported water depth (cm)<input type="number" min="0" max="500" required value={depthCm} onChange={(event) => setDepthCm(Number(event.target.value))} /></label>}
          </div>
          <fieldset className="checkbox-stack"><legend>Emergency conditions</legend>
            <label><input type="checkbox" checked={immediateDanger} onChange={(event) => setImmediateDanger(event.target.checked)} />Immediate danger</label>
            <label><input type="checkbox" checked={medical} onChange={(event) => setMedical(event.target.checked)} />Medical help needed</label>
            <label><input type="checkbox" checked={vulnerable} onChange={(event) => setVulnerable(event.target.checked)} />Vulnerable occupants</label>
          </fieldset>
          <ErrorNotice error={error} />
          <div className="form-footer"><div><strong>{descriptions[hazard]}</strong><small>{offline ? 'Saved on this device until the connection returns.' : 'Stored on this device first, then sent to HydroGrid.'}</small></div><Button type="submit" disabled={saving}><Send size={17} /> {offline ? 'Save SOS offline' : 'Submit SOS'}</Button></div>
        </form>
      </section>
      <div className="side-stack">
        <section className="panel">
          <PanelTitle icon={offline ? <WifiOff size={18} /> : <Wifi size={18} />} title="Connection" detail={offline ? 'Offline mode is active' : 'Automatic synchronization is enabled'} />
          <div className="panel-body form-stack">
            <label className="toggle-row"><input type="checkbox" checked={simulated} onChange={(event) => setSimulated(event.target.checked)} /> Simulate offline</label>
            <p className="muted small">{offline ? 'An SOS remains on this device until HydroGrid can receive it.' : 'Switch offline to test saving an SOS without a connection.'}</p>
          </div>
        </section>
        <section className="panel" aria-label="SOS delivery log">
          <PanelTitle icon={<History size={17} />} title="Delivery log" detail={pending + ' awaiting delivery'} />
          {queue.length ? <div className="delivery-log" aria-live="polite">
            {queue.map((action) => <div className="delivery-item" key={action.clientId}>
              <div><strong>{(action.payload as IncidentInput).summary}</strong><small>{timestamp(action.createdAt)}</small>{action.error && <small className="form-error">{action.error}</small>}</div>
              <span className={'tag tag-' + (action.status === 'sent' ? 'green' : action.status === 'failed' ? 'critical' : 'medium')}>{action.status === 'sent' ? <><CheckCircle2 size={13} /> Delivered</> : action.status === 'failed' ? 'Failed' : 'Queued offline'}</span>
            </div>)}
          </div> : <Empty>No reports saved on this device.</Empty>}
          {pending > 0 && <div className="panel-footer"><Button variant="outline" size="sm" disabled={offline} onClick={() => void synchronize()}><CloudUpload size={15} /> Retry sync</Button></div>}
        </section>
      </div>
    </div>
  </>
}
