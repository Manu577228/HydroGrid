import { CheckCircle2, CloudUpload, Droplets, Gauge, History, LocateFixed, MapPin, Phone, Send, ShieldAlert, Siren, Users, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, getSession } from '../api'
import { useDeviceLocation } from '../deviceLocation'
import { Button, Empty, ErrorNotice, hazardLabels, PageTitle, PanelTitle, timestamp } from '../components/ui'
import { useNetwork } from '../network'
import { queueReport, retryQueuedAction, synchronize, useQueue, useSending } from '../offline'
import { useSnapshot } from '../snapshots'
import type { Hazard, IncidentInput, RoadNode, Severity } from '../types'

const descriptions: Record<Hazard, string> = {
  FLOOD: 'Flood rescue request', MEDICAL: 'Medical aid request', LANDSLIDE: 'Landslide rescue request',
  INFRASTRUCTURE: 'Infrastructure incident', OTHER: 'General assistance request',
}
import './workflows.css'

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
  const [note, setNote] = useState('')
  const [locationNote, setLocationNote] = useState('')
  const [receipt, setReceipt] = useState<string>()
  const [error, setError] = useState<unknown>()
  const position = useDeviceLocation()
  const sending = useSending()
  const session = getSession()
  const [saving, setSaving] = useState(false)
  const availableNodes = graph.data?.nodes ?? [defaultLocation]
  const location = availableNodes.find((node) => node.id === nodeId) ?? availableNodes[0] ?? defaultLocation
  const pending = queue.filter((action) => action.session === session && action.status === 'pending').length
  useEffect(() => {
    if (!position.fix) return
    const fix = position.fix
    const distance = (node: RoadNode) => Math.hypot(node.lat - fix.lat, (node.lng - fix.lng) * .97)
    const nearest = [...availableNodes].sort((first, second) => distance(first) - distance(second))[0]
    if (nearest && distance(nearest) <= .05) {
      setNodeId(nearest.id)
      setLocationNote('Selected the nearest exercise location. Device accuracy ±' + Math.round(fix.accuracy) + ' m.')
    } else {
      setLocationNote('Your device is outside the exercise area. Choose an exercise location. Device accuracy ±' + Math.round(fix.accuracy) + ' m.')
    }
    position.stop()
  }, [position.fix, availableNodes])

  async function save() {
    setSaving(true)
    setError(undefined)
    try {
      const localId = await queueReport({
        summary: descriptions[hazard], hazard, people, depthCm: hazard === 'FLOOD' ? depthCm : 0,
        medical, vulnerable, immediateDanger, reportedSeverity, lat: location.lat, lng: location.lng,
      }, note)
      setReceipt(localId)
      setNote('')
    } catch (problem) {
      setError(problem)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageTitle icon={<Siren size={24} aria-hidden="true" />} title="Citizen SOS" description="Send a practice SOS from the exercise map. You can save the report even when your device is offline." />
    <div className="practice-banner"><ShieldAlert size={20} aria-hidden="true" /><div><strong>Practice report</strong><span>Use fictional details. For an emergency in India, use the official 112 service.</span></div><a href="tel:112" className="button button-outline button-sm"><Phone size={15} /> Call 112</a></div>
    <div className="workspace-split">
      <section className="panel form-panel">
        <PanelTitle icon={<ShieldAlert size={18} />} title="Emergency report" detail="Fictional information only" />
        <form className="form-stack panel-body" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <div className="form-grid">
            <label className="field-label"><span><Siren size={15} aria-hidden="true" /> Emergency type</span><select value={hazard} onChange={(event) => setHazard(event.target.value as Hazard)}>
              {Object.entries(hazardLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="field-label"><span><Gauge size={15} aria-hidden="true" /> How urgent is it?</span><select value={reportedSeverity} onChange={(event) => setReportedSeverity(event.target.value as Severity)}>
              <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
            </select></label>
          </div>
          <label className="field-label"><span><MapPin size={15} /> Simulated location</span><select value={location.id} onChange={(event) => setNodeId(event.target.value)}>
            {availableNodes.map((node) => <option value={node.id} key={node.id}>{node.label} · {node.id}</option>)}
          </select></label>
          {position.supported && <div className="practice-location">
            <Button size="sm" variant="outline" disabled={position.tracking} onClick={() => { setLocationNote(''); position.start() }}><LocateFixed size={16} /> {position.tracking ? 'Finding location…' : 'Find nearest exercise location'}</Button>
            {position.tracking && <Button size="sm" variant="ghost" onClick={position.stop}>Cancel location</Button>}
            <span>Your GPS fix stays on this device.</span>
            {(position.problem || locationNote) && <p role="status">{position.problem || locationNote}</p>}
          </div>}
          <div className="form-grid">
            <label className="field-label"><span><Users size={15} /> People affected</span><input type="number" min="1" max="100" required value={people || ''} onChange={(event) => setPeople(Number(event.target.value))} /></label>
            {hazard === 'FLOOD' && <label className="field-label"><span><Droplets size={15} aria-hidden="true" /> Water depth (cm)</span><input type="number" min="0" max="500" required value={depthCm} onChange={(event) => setDepthCm(Number(event.target.value))} /></label>}
          </div>
          <fieldset className="checkbox-stack"><legend>Emergency conditions</legend>
            <label><input type="checkbox" checked={immediateDanger} onChange={(event) => setImmediateDanger(event.target.checked)} />Immediate danger</label>
            <label><input type="checkbox" checked={medical} onChange={(event) => setMedical(event.target.checked)} />Medical help needed</label>
            <label><input type="checkbox" checked={vulnerable} onChange={(event) => setVulnerable(event.target.checked)} />Someone needs help evacuating</label>
          </fieldset>
          <label className="field-label">Practice note<textarea maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Optional · stays on this device" /></label>
          <ErrorNotice error={error} />
          {receipt && <p className="notice notice-success" role="status">Saved on this device. Reference {receipt.slice(0, 8).toUpperCase()}. Delivery is shown in the log.</p>}
          <div className="form-footer practice-submit"><div><strong>{descriptions[hazard]}</strong><small>{offline ? 'This report will send when you reconnect.' : 'Check the delivery log to confirm it arrived.'}</small></div><Button type="submit" disabled={saving}><Send size={17} /> {offline ? 'Save SOS offline' : 'Submit SOS'}</Button></div>
        </form>
      </section>
      <div className="side-stack">
        <section className="panel">
          <PanelTitle icon={offline ? <WifiOff size={18} /> : <Wifi size={18} />} title="Connection" detail={offline ? 'Offline · reports save on this device' : 'Online · reports send automatically'} />
          <div className="panel-body form-stack">
            <label className="toggle-row"><input type="checkbox" checked={simulated} onChange={(event) => setSimulated(event.target.checked)} /> Simulate offline</label>
            <p className="muted small">{offline ? 'When you reconnect, HydroGrid sends any queued reports.' : 'Turn this on to try saving a report during an outage.'}</p>
          </div>
        </section>
        <section className="panel" aria-label="SOS delivery log">
          <PanelTitle icon={<History size={17} />} title="Delivery log" detail={pending ? pending + ' waiting to send' : 'Reports from this device'} />
          {queue.length ? <div className="delivery-log" aria-live="polite">
            {queue.map((action) => {
              const archived = action.session !== session
              const state = action.status === 'sent' ? 'Delivered' : archived ? 'Previous exercise'
                : action.status === 'failed' ? 'Needs attention' : action.clientId === sending ? 'Sending'
                : offline ? 'Queued offline' : 'Waiting to send'
              return <div className="delivery-item" key={action.clientId}>
                <div><strong>{(action.payload as IncidentInput).summary}</strong><small>{timestamp(action.createdAt)} · Ref {action.clientId.slice(0, 8).toUpperCase()}</small>
                  {action.localNote && <small>Device note · {action.localNote}</small>}
                  {action.error && <small className="form-error">{action.error}</small>}
                  {action.status !== 'sent' && archived && <small>This copy is still on your device. Send it explicitly to the current exercise.</small>}
                  {action.status !== 'sent' && (archived || action.status === 'failed') &&
                    <Button variant="outline" size="sm" onClick={() => void retryQueuedAction(action.clientId).catch(setError)}>{archived ? 'Send in current exercise' : 'Retry report'}</Button>}
                </div>
                <span className={'tag tag-' + (action.status === 'sent' ? 'green' : action.status === 'failed' ? 'critical' : 'medium')}>
                  {action.status === 'sent' && <CheckCircle2 size={13} aria-hidden="true" />} {state}
                </span>
              </div>
            })}
          </div> : <Empty>No reports saved on this device.</Empty>}
          {pending > 0 && <div className="panel-footer"><Button variant="outline" size="sm" disabled={offline} onClick={() => void synchronize()}><CloudUpload size={15} /> Retry sync</Button></div>}
        </section>
      </div>
    </div>
  </>
}
