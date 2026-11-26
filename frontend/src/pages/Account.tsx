import { ArrowLeft, ArrowRight, CircleUserRound, Droplets, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent, type PropsWithChildren } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAccount } from '../account'
import { Button, ErrorNotice, Loading } from '../components/ui'
import './account.css'

function AccountLayout({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  return <main className="account-layout">
    <aside className="account-intro">
      <Link to="/" className="account-brand"><Droplets size={27} aria-hidden="true" /> HydroGrid</Link>
      <div className="account-intro-copy">
        <span className="account-emblem" aria-hidden="true"><ShieldCheck size={42} /></span>
        <strong>Every SOS Counts.</strong>
        <p>Practice response coordination in the Bengaluru exercise or create a citizen profile.</p>
        <Link to="/sos" className="account-practice">Practice SOS <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </aside>
    <section className="account-panel" aria-labelledby="account-heading">
      <Link to="/" className="account-back"><ArrowLeft size={15} aria-hidden="true" /> Back to HydroGrid</Link>
      <header><h1 id="account-heading">{title}</h1><p>{description}</p></header>
      {children}
    </section>
  </main>
}

function AccountForm({ registering }: { registering: boolean }) {
  const account = useAccount()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<unknown>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const email = String(values.get('email')).trim()
    const password = String(values.get('password'))
    setIssue(null)
    if (registering && password !== values.get('passwordConfirmation')) {
      setIssue('The passwords do not match.')
      return
    }
    if (registering && ([...password].length < 12 || new TextEncoder().encode(password).length > 72)) {
      setIssue('Choose a password with at least 12 characters and at most 72 UTF-8 bytes.')
      return
    }

    setBusy(true)
    try {
      if (registering) await account.register({ email, password, displayName: String(values.get('displayName')).trim() })
      else await account.signIn({ email, password })
      navigate('/profile', { replace: true })
    } catch (error) {
      setIssue(error)
    } finally {
      setBusy(false)
    }
  }

  if (account.status === 'signedIn') return <Navigate replace to="/profile" />
  return <AccountLayout title={registering ? 'Create your account' : 'Sign in to HydroGrid'}
    description={registering ? 'Create a citizen profile for HydroGrid.' : 'Open your citizen profile and account settings.'}>
    <form className="account-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      {registering && <label className="field-label">Display name<input name="displayName" autoComplete="name" maxLength={80} required /></label>}
      <label className="field-label">Email<input name="email" type="email" autoComplete="username" autoCapitalize="none" maxLength={254} required /></label>
      <label className="field-label">Password<input name="password" type="password" maxLength={144} required
        autoComplete={registering ? 'new-password' : 'current-password'} aria-describedby={registering ? 'account-password-help' : undefined} /></label>
      {registering && <>
        <p id="account-password-help" className="account-hint">Use at least 12 characters. The password may contain up to 72 UTF-8 bytes.</p>
        <label className="field-label">Confirm password<input name="passwordConfirmation" type="password" maxLength={144} autoComplete="new-password" required /></label>
      </>}
      <ErrorNotice error={issue} />
      <Button type="submit" disabled={busy}><LockKeyhole size={16} aria-hidden="true" />
        {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
      </Button>
    </form>
    <p className="account-alternate">{registering ? 'Have an account?' : 'New to HydroGrid?'}{' '}
      <Link to={registering ? '/login' : '/register'}>{registering ? 'Sign in' : 'Create an account'}</Link>
    </p>
  </AccountLayout>
}

export function LoginPage() { return <AccountForm key="login" registering={false} /> }
export function RegisterPage() { return <AccountForm key="register" registering /> }

function ProfileForm() {
  const account = useAccount()
  const profile = account.profile!
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zones = [...new Set([...Intl.supportedValuesOf('timeZone'), profile.timeZone, systemZone, 'UTC'])].filter(Boolean).sort()

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setSaved(false)
    setIssue(null)
    try {
      await account.updateSettings({
        displayName: String(values.get('displayName')).trim(),
        timeZone: String(values.get('timeZone')),
      })
      setSaved(true)
    } catch (error) {
      setIssue(error)
    } finally {
      setBusy(false)
    }
  }

  async function exit() {
    setBusy(true)
    setIssue(null)
    try {
      await account.signOut()
      navigate('/', { replace: true })
    } catch (error) {
      setIssue(error)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="account-identity"><CircleUserRound size={21} aria-hidden="true" /><div>
      <strong>{profile.displayName}</strong><p>{profile.email} · Citizen</p>
    </div></div>
    <form className="account-form" aria-label="Account settings" onSubmit={(event) => void save(event)} aria-busy={busy}>
      <label className="field-label">Display name<input name="displayName" defaultValue={profile.displayName} required maxLength={80} autoComplete="name" /></label>
      <label className="field-label">Time zone<select name="timeZone" defaultValue={profile.timeZone} required>
        {zones.map((zone) => <option value={zone} key={zone}>{zone.replaceAll('_', ' ')}</option>)}
      </select></label>
      <ErrorNotice error={issue} />
      {saved && <div className="notice notice-success" role="status">Account settings saved.</div>}
      <div className="account-actions">
        <Button type="submit" disabled={busy}>Save settings</Button>
        <Button variant="outline" disabled={busy} onClick={() => void exit()}><LogOut size={16} aria-hidden="true" /> Sign out</Button>
      </div>
    </form>
  </>
}

export function ProfilePage() {
  const account = useAccount()
  if (account.status === 'signedOut') return <Navigate replace to="/login" />
  return <AccountLayout title="Your profile" description="Manage your citizen account and preferences.">
    {account.status === 'loading' && <Loading label="Checking your account session" />}
    {account.status === 'unavailable' && <div className="account-form">
      <ErrorNotice error="The account service could not be reached." />
      <Button onClick={() => void account.restore()}>Try again</Button>
    </div>}
    {account.status === 'signedIn' && account.profile && <ProfileForm key={account.profile.id} />}
  </AccountLayout>
}
