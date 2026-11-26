import {
  ArrowRight, ArrowUpRight, Braces, CloudUpload, Crosshair, FlaskConical,
  Github, HousePlus, MapPinned, Radio, ShieldCheck, Siren, Workflow,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const workflow = [
  { title: 'Report an SOS', copy: 'Keep a practice report on the device through a network outage and synchronize it when the connection returns.', icon: CloudUpload, to: '/sos' },
  { title: 'Triage and dispatch', copy: 'Review priority, compare unit fit and pick a route that avoids mapped exercise hazards.', icon: Crosshair, to: '/command' },
  { title: 'Advance the mission', copy: 'Record departure, arrival and completion. Offline progress syncs with the incident timeline.', icon: Radio, to: '/responder' },
  { title: 'Coordinate shelter', copy: 'Reserve capacity and check people in, with separate space counts for both steps.', icon: HousePlus, to: '/shelters' },
]

const capabilities = [
  {
    icon: FlaskConical, title: 'Compare response strategies', to: '/simulation', action: 'Open simulation lab',
    detail: 'Replay identical incidents, roads and constraints with FIFO and HydroGrid dispatch. See the measured tradeoffs for each seed.',
  },
  {
    icon: MapPinned, title: 'Explore Bengaluru', to: '/live', action: 'View live Bengaluru',
    detail: 'Inspect mapped streets, current weather model estimates and official bulletins. Each layer carries its source and update time.',
  },
  {
    icon: Workflow, title: 'Review the exercise record', to: '/analytics', action: 'Open analytics and audit',
    detail: 'Review incident activity, mission outcomes and the operational decisions behind the results.',
  },
]

export function Overview() {
  return <>
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-lead">
        <div className="landing-context"><ShieldCheck size={15} aria-hidden="true" /> Disaster response exercise</div>
        <h1 id="landing-title">Every SOS <em>Counts.</em></h1>
        <p>Coordinate a response when roads close and connections fail. Follow a report from the outbox to dispatch, field updates and shelter admission.</p>
        <div className="landing-actions">
          <Link className="button button-primary button-lg" to="/dashboard">Start interactive demo <ArrowRight size={17} aria-hidden="true" /></Link>
          <Link className="button button-outline button-lg" to="/sos"><Siren size={17} aria-hidden="true" /> Practice SOS</Link>
        </div>
        <span className="landing-instant">Open the exercise without an account.</span>
      </div>
      <figure className="landing-scene">
        <img src="/hydrogrid-aerial.webp" alt="Illustration of a flooded canal and road bridge at dusk" fetchPriority="high" />
        <figcaption><MapPinned size={15} aria-hidden="true" /><span>Bengaluru-inspired exercise illustration</span></figcaption>
      </figure>
    </section>

    <section className="landing-section" aria-labelledby="workflow-title">
      <header><h2 id="workflow-title">Follow one report through the response</h2><p>Choose a stage to try it in the exercise.</p></header>
      <ol className="landing-flow">
        {workflow.map(({ title, copy, icon: Icon, to }) => <li key={title}><Link to={to} className="landing-stage">
          <span className="landing-stage-icon"><Icon size={20} aria-hidden="true" /></span>
          <span><strong>{title}</strong><small>{copy}</small></span>
          <ArrowUpRight className="landing-stage-arrow" size={16} aria-hidden="true" />
        </Link></li>)}
      </ol>
    </section>

    <section className="landing-section" aria-labelledby="capability-title">
      <header><h2 id="capability-title">Run the exercise. Inspect the evidence.</h2></header>
      <div className="landing-capabilities">
        {capabilities.map(({ icon: Icon, title, detail, action, to }) => <article key={title}>
          <span className="landing-stage-icon"><Icon size={21} aria-hidden="true" /></span>
          <h3>{title}</h3><p>{detail}</p>
          <Link to={to}>{action}<ArrowRight size={15} aria-hidden="true" /></Link>
        </article>)}
      </div>
    </section>

    <section className="landing-project" aria-labelledby="project-title">
      <article><Braces size={21} aria-hidden="true" /><div><h2 id="project-title">About HydroGrid</h2>
        <p>HydroGrid uses React, Spring Boot, PostgreSQL and PostGIS to test offline reporting, spatial routing and coordinated response. The simulation lab compares dispatch strategies using repeatable scenario inputs.</p>
        <a href="https://github.com/Manu577228/HydroGrid" target="_blank" rel="noreferrer"><Github size={15} aria-hidden="true" /> View project on GitHub <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div></article>
      <article><ShieldCheck size={21} aria-hidden="true" /><div><h2>Exercise boundaries</h2>
        <p>Practice reports and missions stay in the exercise workspace. Live Bengaluru lists its data sources and their coverage. In India, use the official 112 number for emergencies.</p>
        <Link to="/operations">Official information channels <ArrowRight size={15} aria-hidden="true" /></Link>
      </div></article>
    </section>

    <footer className="landing-footer">
      <strong>HydroGrid</strong>
      <nav aria-label="Account options"><Link to="/login">Sign in</Link><Link to="/register">Create account</Link></nav>
    </footer>
  </>
}
