import {
  ArrowUpRight, Building2, Check, ClipboardList, Droplets, LockKeyhole, LogOut,
  Phone, RefreshCw, Route, ShieldCheck, Timer,
} from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { ApiError, uuid } from '../api'
import { Button, cn, ErrorNotice, Loading, PageTitle, PanelTitle } from '../components/ui'
import { bengaluruTime } from '../deviceLocation'
import {
  type Handoff, type HandoffState, type Observation, type ObservationKind,
  type OpsScope, type SiteState, type TrafficFeed, useOperationsWorkspace,
} from '../opsWorkspace'
import '../operations.css'

const sources = {
  FLOOD: {
    title: 'Flood depth',
    agency: 'Karnataka State Natural Disaster Monitoring Centre',
    description: 'Find city rainfall and flood advisories in the official app. Street depth requires a surface measurement.',
    href: 'https://revenue.karnataka.gov.in/uploads/media_to_upload1712739726.pdf',
    linkText: 'Karnataka flood monitoring program',
    Icon: Droplets,
  },
  TRAFFIC: {
    title: 'Road closures',
    agency: 'Bengaluru Traffic Police',
    description: 'Check the traffic police’s official advisories for current closures and diversions.',
    href: 'https://play.google.com/store/apps/details?id=com.BTPASTraM',
    linkText: 'BTP ASTraM',
    Icon: Route,
  },
  SHELTER: {
    title: 'Shelter occupancy',
    agency: 'Bengaluru Urban disaster management',
    description: 'Ask district disaster management about open relief locations and confirm space with the shelter operator.',
    href: 'https://bengaluruurban.nic.in/en/departments/disaster-management/',
    linkText: 'District disaster management',
    Icon: Building2,
  },
}
const observationKinds: ObservationKind[] = ['FLOOD', 'TRAFFIC', 'SHELTER']
const scopeLabels: Record<OpsScope, string> = {
  FLOOD: 'Flood monitor', TRAFFIC: 'Traffic operator', SHELTER: 'Shelter operator',
  DISPATCH: 'Handoff operator', COORDINATOR: 'Coordinator', TRAFFIC_VIEWER: 'Enrolled viewer',
}
const handoffLabels: Record<HandoffState, string> = {
  RELAYED: 'Relay recorded', ACKNOWLEDGED: 'Acknowledgement recorded', CLOSED: 'Closure recorded',
}
const handoffReferencePattern = /^[A-Za-z0-9][A-Za-z0-9 /._:-]{0,79}$/
const siteIdPattern = /^[A-Za-z0-9._:-]{1,64}$/
type Workspace = ReturnType<typeof useOperationsWorkspace>

function OfficialChannels() {
  return <>
    <section className="ops-emergency" aria-labelledby="ops-emergency-title">
      <div className="ops-emergency-icon" aria-hidden="true"><Phone size={23} /></div>
      <div className="ops-emergency-copy">
        <h2 id="ops-emergency-title">Emergency help</h2>
        <p>For a police, fire, medical or disaster emergency in India, call the official 112 service.</p>
        <a className="ops-source-link" href="https://www.mha.gov.in/emergency-response-support-system-erss" target="_blank" rel="noreferrer">
          Emergency Response Support System <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      <a className="button button-normal ops-emergency-call" href="tel:112"><Phone size={16} aria-hidden="true" /> Call 112</a>
    </section>
    <section className="ops-source-section" aria-labelledby="ops-source-title">
      <div>
        <h2 id="ops-source-title">Official information channels</h2>
        <p className="ops-muted">HydroGrid has no public feed for these records. Check with the source for current conditions.</p>
      </div>
      <div className="ops-source-grid">
        {observationKinds.map((kind) => {
          const { title, agency, description, href, linkText, Icon } = sources[kind]
          return <article className="panel ops-source-card" key={kind}>
            <div className="ops-source-heading">
              <span className="panel-title-icon" aria-hidden="true"><Icon size={18} /></span>
              <div><h3>{title}</h3><p className="ops-muted">{agency}</p></div>
            </div>
            <p>{description}</p>
            <div className="ops-source-links">
              {kind === 'FLOOD' && <a className="ops-source-link" href="https://play.google.com/store/apps/details?id=com.moserptech.meghasandesha" target="_blank" rel="noreferrer">
                Bengaluru Megha Sandesha <ArrowUpRight size={13} aria-hidden="true" />
              </a>}
              <a className="ops-source-link" href={href} target="_blank" rel="noreferrer">{linkText} <ArrowUpRight size={13} aria-hidden="true" /></a>
            </div>
          </article>
        })}
      </div>
    </section>
  </>
}

function OperatorSignIn({ workspace }: { workspace: Workspace }) {
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState('')
  const { availability, sessionIssue, signIn } = workspace

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setIssue('')
    try {
      await signIn(String(values.get('operator')).trim().toLowerCase(), String(values.get('code')).trim())
    } catch (error) {
      setIssue(error instanceof ApiError && error.status === 401
        ? 'The operator ID or access code was rejected.' : 'Operator sign-in failed. Try again when the service is available.')
    } finally {
      setBusy(false)
    }
  }

  if (availability.isPending && !availability.isPaused) return <Loading label="Checking operator access…" />
  if (availability.isError || availability.isPaused) return <div className="panel-body ops-prelogin">
    <p role="status">Operator access could not be checked.</p>
    <Button variant="outline" size="sm" onClick={() => void availability.refetch()}><RefreshCw size={14} /> Check again</Button>
  </div>
  if (!availability.data?.available) return <div className="panel-body ops-prelogin">
    <p role="status">Operator access is disabled on this deployment.</p>
    <p className="ops-muted">Access requires an enrolled account.</p>
  </div>

  return <div className="panel-body ops-prelogin">
    <p className="ops-muted">Use the credentials provided when you were enrolled.</p>
    <form className="ops-sign-in" aria-label="Operator sign-in" onSubmit={(event) => void submit(event)}>
      <label className="field-label">Operator ID<input name="operator" autoComplete="username" autoCapitalize="none" maxLength={48} required /></label>
      <label className="field-label">Operator access code<input name="code" type="password" autoComplete="current-password" minLength={32} maxLength={256} required /></label>
      <Button type="submit" size="sm" disabled={busy}><LockKeyhole size={15} /> {busy ? 'Signing in…' : 'Sign in as operator'}</Button>
    </form>
    <ErrorNotice error={issue || sessionIssue} />
  </div>
}

function ObservationForm({ workspace, scope }: { workspace: Workspace; scope: ObservationKind | 'COORDINATOR' }) {
  const [kind, setKind] = useState<ObservationKind>(scope === 'COORDINATOR' ? 'FLOOD' : scope)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const read = (name: string) => String(fields.get(name) ?? '').trim()
    const observedAt = new Date(read('observedAt') + '+05:30')
    const input = {
      kind,
      siteId: read('siteId'),
      label: read('label'),
      lat: Number(read('lat')),
      lng: Number(read('lng')),
      sourceRef: read('sourceRef'),
      observedAt: '',
    }
    const now = Date.now()
    setIssue('')
    setMessage('')
    if (!siteIdPattern.test(input.siteId)) {
      setIssue('Use letters, numbers, dots, underscores, colons or hyphens in the site ID.')
      return
    }
    if (!input.label || !input.sourceRef) {
      setIssue('Enter the site name and an agency source reference.')
      return
    }
    if (Number.isNaN(+observedAt) || +observedAt > now + 120_000 || +observedAt < now - 86_400_000) {
      setIssue('Use the observation time in IST from the last 24 hours.')
      return
    }
    input.observedAt = observedAt.toISOString()
    const capacity = Number(read('capacity'))
    const occupancy = Number(read('occupancy'))
    const state = read('state') as SiteState
    if (kind === 'SHELTER' && (occupancy > capacity || (state === 'OPEN' && capacity === 0))) {
      setIssue('Occupancy must fit the recorded capacity. An open shelter requires a capacity above zero.')
      return
    }
    const values = kind === 'FLOOD' ? { value: Number(read('value')) }
      : kind === 'TRAFFIC' ? { state } : { state, capacity, occupancy }

    setBusy(true)
    try {
      const saved = await workspace.recordObservation({ ...input, ...values })
      setMessage(saved.label + ' was recorded. The source timestamp and expiry appear on the board.')
      form.reset()
    } catch (error) {
      setIssue(error instanceof ApiError && error.status === 409
        ? 'A newer or different observation already exists for this site. Check the board before retrying.'
        : error instanceof ApiError && error.status === 403 ? 'Your operator role cannot record this observation.'
        : error instanceof Error ? error.message : 'The observation could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="ops-entry ops-observation-form" aria-label="Record a site observation" onSubmit={(event) => void submit(event)}>
    <div><h3><ClipboardList size={17} aria-hidden="true" /> {scope === 'COORDINATOR' ? 'Record a site observation' : 'Record ' + sources[scope].title.toLowerCase()}</h3>
      <p className="ops-muted">Enter a measurement or status confirmed by your organization. Use the same site ID for later updates.</p></div>
    <fieldset className="ops-form-grid" disabled={busy || workspace.boardIssue}>
      {scope === 'COORDINATOR' && <label className="field-label ops-form-wide">Observation type
        <select value={kind} onChange={(event) => { setKind(event.target.value as ObservationKind); setIssue(''); setMessage('') }}>
          {observationKinds.map((value) => <option key={value} value={value}>{sources[value].title}</option>)}
        </select>
      </label>}
      <label className="field-label">Site ID<input name="siteId" required maxLength={64} placeholder="Agency site ID" /></label>
      <label className="field-label">Site name<input name="label" required maxLength={100} /></label>
      <label className="field-label">Latitude<input name="lat" type="number" inputMode="decimal" min={12.65} max={13.4} step="any" required /></label>
      <label className="field-label">Longitude<input name="lng" type="number" inputMode="decimal" min={77.25} max={78} step="any" required /></label>
      <label className="field-label">Observed at (IST)<input name="observedAt" type="datetime-local" step={1} required /></label>
      <label className="field-label">Agency source reference<input name="sourceRef" maxLength={160} required placeholder="Sensor, bulletin or log ID" /></label>
      {kind === 'FLOOD' && <div className="ops-form-wide ops-depth-field" key="depth">
        <label className="field-label">Measured surface depth (cm)
          <input name="value" type="number" inputMode="decimal" min={0} max={2000} step="any" required aria-describedby="ops-depth-help" />
        </label>
        <small id="ops-depth-help">Measure from the road surface. Drain water levels use a different datum.</small>
      </div>}
      {kind !== 'FLOOD' && <label className="field-label ops-form-wide" key={kind}>{kind === 'TRAFFIC' ? 'Road status' : 'Shelter status'}
        <select name="state" required defaultValue=""><option value="" disabled>Select a verified status</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select>
      </label>}
      {kind === 'SHELTER' && <>
        <label className="field-label">Capacity<input name="capacity" type="number" inputMode="numeric" min={0} max={100000} step={1} required /></label>
        <label className="field-label">Current occupancy<input name="occupancy" type="number" inputMode="numeric" min={0} max={100000} step={1} required /></label>
      </>}
      <Button type="submit" size="sm" className="ops-form-wide"><Check size={15} aria-hidden="true" /> {busy ? 'Saving…' : 'Record observation'}</Button>
    </fieldset>
    <ErrorNotice error={issue} />
    {message && <div className="notice notice-success" role="status">{message}</div>}
  </form>
}

function observationValue(observation: Observation) {
  if (observation.kind === 'FLOOD') return observation.value + ' cm'
  const state = observation.state === 'OPEN' ? 'Open' : 'Closed'
  if (observation.kind === 'TRAFFIC') return state
  return state + ' · ' + observation.occupancy + ' of ' + observation.capacity + ' occupied'
}

function ObservationList({ observations, boardIssue }: { observations: Observation[]; boardIssue: boolean }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  return <section className="ops-entry" aria-label="Agency observations">
    <div><h3><Timer size={17} aria-hidden="true" /> Agency observations</h3>
      <p className="ops-muted">Conditions at sites without a current observation are unknown.</p></div>
    {observationKinds.map((kind) => {
      const matching = observations.filter((observation) => observation.kind === kind)
      const { title, Icon } = sources[kind]
      return <div className="ops-observation-group" key={kind}>
        <h4><Icon size={15} aria-hidden="true" /> {title}</h4>
        {matching.length === 0 ? <p className="ops-muted">No observations available.</p> : <ul className="ops-records">
          {matching.map((observation) => {
            const expired = !(Date.parse(observation.expiresAt) > now)
            return <li key={observation.siteId} className="ops-record">
              <div className="ops-record-heading">
                <div><strong>{observation.label}</strong><p className="ops-muted">{observation.siteId}</p></div>
                <span className={cn('ops-health', (expired || boardIssue) && 'ops-health-stale')}>{expired ? 'Expired' : boardIssue ? 'Last received' : 'Within validity window'}</span>
              </div>
              <p className="ops-observation-value">{(expired || boardIssue) && 'Last recorded · '}{observationValue(observation)}</p>
              <dl className="ops-metadata">
                <div><dt>Observed</dt><dd><time dateTime={observation.observedAt}>{bengaluruTime(observation.observedAt)}</time></dd></div>
                <div><dt>Expires</dt><dd><time dateTime={observation.expiresAt}>{bengaluruTime(observation.expiresAt)}</time></dd></div>
                <div><dt>Source</dt><dd>{observation.sourceRef}</dd></div>
                <div><dt>Recorded by</dt><dd>{observation.reportedBy}</dd></div>
                <div><dt>Location</dt><dd>{observation.lat.toFixed(5)}, {observation.lng.toFixed(5)}</dd></div>
              </dl>
            </li>
          })}
        </ul>}
      </div>
    })}
  </section>
}

function HandoffTracker({ workspace, handoffs }: { workspace: Workspace; handoffs: Handoff[] }) {
  const draft = useRef<{ id: string; reference: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState('')
  const [message, setMessage] = useState('')

  async function save(id: string, reference: string, expectedState: 'RELAYED' | 'ACKNOWLEDGED' | null, state: HandoffState) {
    setBusy(true)
    setIssue('')
    setMessage('')
    try {
      const saved = await workspace.recordHandoff({ id, reference, expectedState, state })
      setMessage(handoffLabels[saved.state] + ' for ' + saved.reference + '.')
      return true
    } catch (error) {
      setIssue(error instanceof ApiError && error.status === 409
        ? 'This handoff has changed or the reference is already recorded. Check the board before trying again.'
        : error instanceof Error ? error.message : 'The handoff could not be recorded.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function relay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const reference = String(new FormData(form).get('reference')).trim()
    if (!handoffReferencePattern.test(reference)) {
      setIssue('Use the external incident ID supplied by the receiving service.')
      return
    }
    if (draft.current?.reference !== reference) draft.current = { id: uuid(), reference }
    if (await save(draft.current.id, reference, null, 'RELAYED')) {
      draft.current = null
      form.reset()
    }
  }

  function advance(handoff: Handoff) {
    if (handoff.state === 'CLOSED') return
    void save(handoff.id, handoff.reference, handoff.state, handoff.state === 'RELAYED' ? 'ACKNOWLEDGED' : 'CLOSED')
  }

  return <section className="ops-entry" aria-label="Manual emergency handoff log">
    <div><h3><Phone size={17} aria-hidden="true" /> Manual emergency handoff log</h3>
      <p className="ops-muted">Record your relay or the receiving agency’s confirmed outcome. Use incident references only and leave out personal details. Entries stay in this operator workspace.</p></div>
    <form aria-label="Record a completed relay" onSubmit={(event) => void relay(event)}>
      <fieldset className="ops-handoff-fields" disabled={busy || workspace.boardIssue}>
        <label className="field-label">External incident reference<input name="reference" required maxLength={80} /></label>
        <label className="ops-confirm"><input type="checkbox" required /> I already relayed this case through an authorized channel.</label>
        <Button type="submit" size="sm"><Check size={15} aria-hidden="true" /> {busy ? 'Saving…' : 'Record handoff'}</Button>
      </fieldset>
    </form>
    <ErrorNotice error={issue} />
    {message && <div className="notice notice-success" role="status">{message}</div>}
    {handoffs.length === 0 ? <p className="ops-muted">No handoffs have been recorded.</p> : <ul className="ops-records">
      {handoffs.map((handoff) => <li className="ops-record ops-handoff" key={handoff.id}>
        <div><strong>{handoff.reference}</strong><p>{handoffLabels[handoff.state]}</p>
          <p className="ops-muted"><time dateTime={handoff.updatedAt}>{bengaluruTime(handoff.updatedAt)}</time> · {handoff.reportedBy}</p></div>
        {handoff.state !== 'CLOSED' && <Button size="sm" variant="outline" disabled={busy || workspace.boardIssue} onClick={() => advance(handoff)}>
          {handoff.state === 'RELAYED' ? 'Record acknowledgement' : 'Record closure'}
        </Button>}
      </li>)}
    </ul>}
  </section>
}

function OfficialTrafficFeed({ load }: { load: Workspace['trafficFeed'] }) {
  const [feed, setFeed] = useState<TrafficFeed>()
  const [issue, setIssue] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let next: number | undefined
    async function update() {
      try {
        const result = await load(controller.signal)
        if (controller.signal.aborted) return
        setFeed(result)
        setIssue(false)
      } catch {
        if (controller.signal.aborted) return
        setIssue(true)
      }
      next = window.setTimeout(update, 60_000)
    }
    void update()
    return () => {
      controller.abort()
      window.clearTimeout(next)
    }
  }, [load, revision])

  const stale = issue || feed?.status === 'stale'
  const events = feed?.events ?? []
  const summary = issue ? (events.length ? 'Refresh failed. Showing last received police reports.' : 'The traffic feed could not be checked.')
    : feed?.status === 'not_configured' ? 'The BTP feed requires IUDX Consumer credentials.'
    : feed?.status === 'unavailable' ? 'The police traffic feed is unavailable.'
    : feed?.status === 'stale' ? 'Showing last received police reports.'
    : feed?.status === 'available' ? events.length ? 'Police feed checked.' : 'No recent police reports returned.'
    : 'Checking police traffic feed…'

  return <section className="ops-entry" aria-label="Bengaluru Traffic Police feed">
    <div className="ops-board-status">
      <div><h3><Route size={17} aria-hidden="true" /> Bengaluru Traffic Police feed</h3>
        <p className="ops-muted" role="status">{summary}
          {feed?.checkedAt && <> Last checked <time dateTime={feed.checkedAt}>{bengaluruTime(feed.checkedAt)}</time>.</>}
        </p></div>
      <Button size="sm" variant="outline" onClick={() => setRevision((current) => current + 1)}><RefreshCw size={14} /> Refresh traffic</Button>
    </div>
    <p className="ops-muted">Recent events reported by Bengaluru Traffic Police via IUDX. Coverage can be incomplete. Check directly with traffic police before travel.</p>
    {feed?.since && <p className="ops-muted">Reports queried since <time dateTime={feed.since}>{bengaluruTime(feed.since)}</time>.</p>}
    {events.length > 0 && <ul className="ops-records">
      {events.map((event) => <li className="ops-record" key={event.id}>
        <div className="ops-record-heading">
          <strong>{event.title}</strong>
          {event.roadClosure && <span className="ops-health ops-health-stale">{stale ? 'Last reported closure' : 'Closure reported'}</span>}
        </div>
        <dl className="ops-metadata">
          <div><dt>Police report time</dt><dd><time dateTime={event.observedAt}>{bengaluruTime(event.observedAt)}</time></dd></div>
          <div><dt>Provider end time</dt><dd>{event.endsAt ? <time dateTime={event.endsAt}>{bengaluruTime(event.endsAt)}</time> : 'Unavailable'}</dd></div>
          {event.resolution && <div><dt>Provider status</dt><dd>{event.resolution}</dd></div>}
        </dl>
      </li>)}
    </ul>}
    {feed?.status === 'available' && events.length === 0 && <p className="ops-muted">No reports were returned for this time range. Road conditions are unknown outside reported events.</p>}
    <a className="ops-source-link" href={sources.TRAFFIC.href} target="_blank" rel="noreferrer">BTP ASTraM <ArrowUpRight size={13} aria-hidden="true" /></a>
  </section>
}

function OperatorWorkspace({ workspace }: { workspace: Workspace }) {
  const { board, boardIssue, checkedAt } = workspace
  const viewer = board?.scope === 'TRAFFIC_VIEWER'
  const canTrack = board?.scope === 'DISPATCH' || board?.scope === 'COORDINATOR'
  const canViewTraffic = viewer || board?.scope === 'TRAFFIC' || board?.scope === 'COORDINATOR'
  const title = viewer ? 'Traffic feed viewer' : board ? 'Agency operator workspace' : 'Operations sign-in'
  const detail = viewer ? 'Read-only access to Bengaluru Traffic Police reports'
    : board ? 'Private records from named operators' : 'Access for enrolled viewers and operators'
  return <section className="panel ops-workspace" aria-label={title}>
    <PanelTitle icon={<ShieldCheck size={20} />} title={title} detail={detail}
      actions={workspace.authenticated && <Button size="sm" variant="ghost" onClick={() => workspace.signOut()}><LogOut size={15} /> Sign out</Button>} />
    {!workspace.authenticated ? <OperatorSignIn workspace={workspace} /> : <>
      {!board && !boardIssue && <Loading label="Loading the operator board…" />}
      {boardIssue && !board && <div className="panel-body ops-prelogin">
        <ErrorNotice error="The operator board could not be loaded." />
        <Button size="sm" variant="outline" onClick={workspace.refresh}><RefreshCw size={14} /> Refresh board</Button>
      </div>}
      {board && <div className="panel-body ops-workspace-body">
        <div className="ops-board-status">
          <div>
            <strong>{board.operator} · {scopeLabels[board.scope]}</strong>
            <p className="ops-muted" role="status">{boardIssue ? 'Board refresh failed. The last received records are shown below.'
              : checkedAt ? 'Board checked ' + bengaluruTime(checkedAt) : 'Board connected'}</p>
          </div>
          <Button size="sm" variant="outline" onClick={workspace.refresh}><RefreshCw size={14} /> Refresh board</Button>
        </div>
        {canViewTraffic && <OfficialTrafficFeed load={workspace.trafficFeed} />}
        {board.scope !== 'TRAFFIC_VIEWER' && <div className="ops-board-grid">
          {board.scope !== 'DISPATCH' && <ObservationForm workspace={workspace} scope={board.scope} />}
          {board.scope === 'DISPATCH' && <HandoffTracker workspace={workspace} handoffs={board.handoffs} />}
          <ObservationList observations={board.observations} boardIssue={boardIssue} />
        </div>}
        {canTrack && board.scope !== 'DISPATCH' && <HandoffTracker workspace={workspace} handoffs={board.handoffs} />}
      </div>}
    </>}
  </section>
}

export function OperationsPage() {
  const workspace = useOperationsWorkspace()
  return <div className="ops-page">
    <PageTitle title="Bengaluru operations" icon={<ShieldCheck />}
      description="Find official response channels and check reported conditions in Bengaluru." />
    <OfficialChannels />
    <OperatorWorkspace workspace={workspace} />
  </div>
}
