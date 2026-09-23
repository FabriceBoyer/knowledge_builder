import { ArrowRight, Cloud, Github, HardDrive, LockKeyhole, MailCheck, Network, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { confirmEmailVerification, confirmPasswordReset, requestPasswordReset } from '../lib/pocketbase'

function readableError(error: unknown, mode: 'login' | 'register') {
  const fallback = mode === 'login' ? 'Invalid credentials or email not verified.' : 'The account could not be created. Check the fields and try again.'
  if (!(error instanceof Error)) return fallback
  if (/failed to fetch|network|load failed/i.test(error.message)) return 'PocketBase is unreachable. Check your connection and try again.'
  if (/verif/i.test(error.message)) return 'Verify your email before signing in.'
  return fallback
}

export function AuthPage() {
  const { githubAvailable, login, loginWithGitHub, register, resendVerification, useLocalWorkspace } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const passwordToken = params.get('passwordReset')
    if (passwordToken) {
      setResetToken(passwordToken)
      setResetMode(true)
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
      return
    }
    const token = params.get('verification')
    if (!token) return
    setSubmitting(true)
    confirmEmailVerification(token)
      .then(() => { setMode('login'); setNotice('Email verified. You can now sign in.') })
      .catch(() => setError('This verification link is invalid or has expired. Request a new email below.'))
      .finally(() => {
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
        setSubmitting(false)
      })
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (password.length < 8) return setError('Use at least 8 characters for your password.')
    setSubmitting(true)
    try {
      if (mode === 'login') await login(email, password)
      else {
        await register(name, email, password)
        setMode('login')
        setPassword('')
        setNotice(`Verification email sent to ${email.trim().toLowerCase()}.`)
      }
    } catch (reason) {
      setError(readableError(reason, mode))
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next); setResetMode(false); setResetToken(''); setError(''); setNotice(''); setPassword(''); setPasswordConfirm('')
  }

  function startGitHubLogin() {
    setError('')
    setNotice('')
    setSubmitting(true)
    loginWithGitHub()
      .catch((reason) => setError(reason instanceof Error && /verified email/i.test(reason.message) ? reason.message : 'GitHub sign-in could not be completed.'))
      .finally(() => setSubmitting(false))
  }

  function resend() {
    if (!email.trim()) return setError('Enter your email address first.')
    setError('')
    setSubmitting(true)
    resendVerification(email)
      .then(() => setNotice(`A new verification email was sent to ${email.trim().toLowerCase()}.`))
      .catch(() => setError('The verification email could not be sent. Try again shortly.'))
      .finally(() => setSubmitting(false))
  }

  function sendPasswordReset(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    requestPasswordReset(email)
      .then(() => setNotice(`If an account exists for ${email.trim().toLowerCase()}, a password reset email has been sent.`))
      .catch(() => setError('The reset email could not be sent. Try again shortly.'))
      .finally(() => setSubmitting(false))
  }

  function saveNewPassword(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (password.length < 8) return setError('Use at least 8 characters for your password.')
    if (password !== passwordConfirm) return setError('The passwords do not match.')
    setSubmitting(true)
    confirmPasswordReset(resetToken, password, passwordConfirm)
      .then(() => {
        setResetMode(false)
        setResetToken('')
        setPassword('')
        setPasswordConfirm('')
        setNotice('Password updated. You can now sign in.')
      })
      .catch(() => setError('This password reset link is invalid or has expired. Request a new one.'))
      .finally(() => setSubmitting(false))
  }

  function openPasswordReset() {
    setResetMode(true); setResetToken(''); setError(''); setNotice(''); setPassword(''); setPasswordConfirm('')
  }

  function closePasswordReset() {
    setResetMode(false); setResetToken(''); setError(''); setNotice(''); setPassword(''); setPasswordConfirm('')
  }

  return <main className="auth-page">
    <section className="auth-story">
      <div className="brand auth-brand"><span className="brand-mark"><span /><span /><span /></span><span>lexi<strong>graph</strong></span></div>
      <div className="auth-story-copy"><div className="eyebrow"><Network size={14} /> A workspace for precise thought</div><h1>Your ideas,<br /><span>connected.</span></h1><p>Disambiguate language, compose meaning, and turn scientific reading into durable knowledge graphs.</p></div>
      <div className="auth-assurances"><span><Cloud /> PocketBase cloud sync</span><span><ShieldCheck /> Owner-only workspace</span></div>
      <div className="auth-network" aria-hidden="true"><i /><i /><i /><i /><svg viewBox="0 0 500 300"><path d="M50 210 C140 150 160 80 250 120S390 220 455 90"/><path d="M50 210 C170 270 290 260 455 90"/></svg></div>
    </section>
    <section className="auth-form-side">
      <div className="auth-card">
        <div className="auth-lock"><LockKeyhole /></div>
        {resetMode ? <>
          <div className="auth-heading"><h2>{resetToken ? 'Choose a new password' : 'Reset your password'}</h2><p>{resetToken ? 'Use at least eight characters.' : 'We will send a secure reset link to your verified email.'}</p></div>
          <form onSubmit={resetToken ? saveNewPassword : sendPasswordReset}>
            {!resetToken && <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" /></label>}
            {resetToken && <><label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></label><label>Confirm password<input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Repeat your password" /></label></>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            {notice && <div className="auth-success" role="status"><MailCheck size={17} /> {notice}</div>}
            <button className="primary-button auth-submit" disabled={submitting}>{submitting ? 'Please wait…' : resetToken ? 'Update password' : 'Send reset email'} <ArrowRight size={17} /></button>
          </form>
          <button type="button" className="auth-back-button" onClick={closePasswordReset} disabled={submitting}>Back to sign in</button>
        </> : <>
          <div className="auth-tabs" role="tablist"><button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button><button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Create account</button></div>
          <div className="auth-heading"><h2>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2><p>{mode === 'login' ? 'Continue building your semantic maps.' : 'Your private graph workspace will sync automatically.'}</p></div>
          <button type="button" className="github-auth-button" onClick={startGitHubLogin} disabled={submitting || !githubAvailable}><Github size={18} /> Continue with GitHub</button>
          {!githubAvailable && <p className="oauth-unavailable">GitHub sign-in is not enabled on this server yet.</p>}
          <div className="auth-divider"><span>or use email</span></div>
          <form onSubmit={submit}>
            {mode === 'register' && <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" placeholder="Ada Lovelace" /></label>}
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" /></label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            {notice && <div className="auth-success" role="status"><MailCheck size={17} /> {notice}</div>}
            <button className="primary-button auth-submit" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></button>
          </form>
          {mode === 'login' && <div className="auth-secondary-actions"><button type="button" onClick={openPasswordReset} disabled={submitting}>Forgot password?</button><button type="button" onClick={resend} disabled={submitting}>Resend verification email</button></div>}
          <p className="auth-note">Email verification is required. Passwords are handled by PocketBase and never stored in the Lexigraph workspace.</p>
          <div className="local-workspace-option">
            <div><HardDrive size={17} /><span><strong>Use this device only</strong><small>No login, no cloud backup. Your work stays in this browser’s local storage.</small></span></div>
            <button type="button" className="secondary-button" onClick={useLocalWorkspace} disabled={submitting}>Continue locally</button>
          </div>
        </>}
      </div>
    </section>
  </main>
}
