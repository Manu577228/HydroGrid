import { Crosshair, LockKeyhole, LogOut, MapPin, RadioTower, Send, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Button, PanelTitle } from './ui'
import { bengaluruTime } from '../deviceLocation'
import type { FieldBoard, useFieldWorkspace } from '../fieldWorkspace'

type FieldWorkspace = ReturnType<typeof useFieldWorkspace>

export function FieldPanel({ field, board, freshFix, showOnMap }: {
  field: FieldWorkspace
  board?: FieldBoard
  freshFix: boolean
  showOnMap?: (point: [number, number]) => void
}) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const busy = !!field.busy
  return <section className="panel live-field" id="private-field-board" tabIndex={-1}>
    <PanelTitle icon={<ShieldCheck size={19} />} title="Private field test" detail="Access-code workspace for invited testers"
      actions={field.authenticated && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void field.leave()}><LogOut size={15} /> Sign out</Button>} />
    <div className="panel-body live-field-body">
      {!field.authenticated ? <>
        {field.status.isPending && !field.status.isPaused ? <p role="status">Checking workspace availability…</p>
          : field.status.isError || field.status.isPaused ? <p role="status">Workspace availability could not be checked.</p>
          : !field.status.data?.available ? <p role="status">The private field workspace is disabled on this deployment.</p>
          : <form className="live-unlock" onSubmit={(event) => {
            event.preventDefault()
            void field.enter(code).then((entered) => { if (entered) setCode('') })
          }}>
            <label className="field-label">Workspace access code
              <input type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={256} />
            </label>
            <Button type="submit" size="sm" disabled={busy || code.length === 0}><LockKeyhole size={15} /> {busy ? 'Opening…' : 'Unlock workspace'}</Button>
          </form>}
        <p className="live-copy">Testers can share a device location or send a test report. Test reports go to this board only.</p>
      </> : <>
        <div className="live-board-status" role="status">
          <RadioTower size={17} />
          <div><strong>{field.boardFailed ? board ? 'Last received board' : 'Board unavailable' : board ? 'Board connected' : 'Connecting to board…'}</strong>
            <span>{field.updated ? 'HydroGrid server · ' + bengaluruTime(field.updated) : 'HydroGrid server'}</span></div>
        </div>
        <div className="live-field-controls">
          <section aria-label="Share a device location" className="live-field-card">
            <h3><Crosshair size={17} /> Share location</h3>
            <p>Other testers can see your marker. It expires five minutes after your last successful update.</p>
            <label className="field-label">Device label
              <input disabled={field.sharing || busy || field.removalPending} maxLength={40} placeholder="For example, Field phone" value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            {field.sharing || field.removalPending
              ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void field.stopSharing()}>
                <Crosshair size={15} /> {field.removalPending ? 'Retry marker removal' : 'Stop sharing'}
              </Button>
              : <Button size="sm" variant="secondary" disabled={busy || !freshFix || !label.trim()} onClick={() => field.startSharing(label.trim())}>
                <Crosshair size={15} /> Share my location
              </Button>}
            {!freshFix && <small>{field.sharing ? 'Waiting for a fresh device location.' : 'Enable device location above to share.'}</small>}
          </section>
          <form aria-label="Send a test report" className="live-field-card" onSubmit={(event) => {
            event.preventDefault()
            void field.report(note.trim()).then((sent) => { if (sent) setNote('') })
          }}>
            <h3><Send size={17} /> Test report</h3>
            <p>Sends your current location to testers for exercise use. Reports appear here for 24 hours.</p>
            <label className="field-label">Report note
              <input value={note} placeholder="Describe the test" maxLength={280} required onChange={(event) => setNote(event.target.value)} />
            </label>
            <Button type="submit" size="sm" variant="outline" disabled={busy || !freshFix || !note.trim()}><Send size={15} /> Send test report</Button>
            {!freshFix && <small>Enable device location above to attach your location.</small>}
          </form>
        </div>
        {board && <div className="live-board-lists">
          <section aria-label="Shared devices" className="live-field-card">
            <h3>Shared devices <span>{board.positions.length}</span></h3>
            {board.positions.length === 0 && <p>No devices are sharing.</p>}
            {board.positions.length > 0 && <ul>{board.positions.map((position) => <li key={position.id}><strong>{position.label}{position.id === board.deviceId && ' · This device'}</strong>
              <span>{Math.round(position.accuracy)} m accuracy · {bengaluruTime(position.seenAt)}</span>
              {showOnMap && <button type="button" className="live-board-map-button" onClick={() => showOnMap([position.lat, position.lng])}><MapPin size={13} /> Show on map</button>}</li>)}</ul>}
          </section>
          <section aria-label="Test reports" className="live-field-card">
            <h3>Test reports <span>{board.reports.length}</span></h3>
            {board.reports.length === 0 && <p>No test reports in the last 24 hours.</p>}
            {board.reports.length > 0 && <ul>{board.reports.map((report) => <li key={report.id}><strong>{report.note}</strong>
              <span>{bengaluruTime(report.createdAt)}</span>
              {showOnMap && <button type="button" className="live-board-map-button" onClick={() => showOnMap([report.lat, report.lng])}><MapPin size={13} /> Show on map</button>}</li>)}</ul>}
          </section>
        </div>}
      </>}
      {field.error && <div className="notice notice-error" role="alert">{field.error}</div>}
      {field.message && <div className="notice notice-success" role="status">{field.message}</div>}
    </div>
  </section>
}
