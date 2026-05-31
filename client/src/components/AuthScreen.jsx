import { useState } from 'react'
import { Feather, Eye, EyeOff, ArrowRight, AlertCircle, FastForward } from 'lucide-react'
import { login, register } from '../api/greenlightClient'

const VALUE_PROPS = [
  { num: '01', text: 'Tells you not to invest when that is the right answer.' },
  { num: '02', text: 'Shows the math, not just the verdict.' },
  { num: '03', text: 'Builds a portfolio sized to what you can actually afford.' },
  { num: '04', text: 'Rebalances on drift, not a calendar. No needless fees.' },
]

let _uid = 0
function Field({ label, type = 'text', value, onChange, error, placeholder, rightEl, autoComplete }) {
  const [id] = useState(() => `f-${++_uid}`)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor={id} style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
        color: 'var(--text-muted)', textTransform: 'uppercase',
      }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          style={{
            width: '100%', boxSizing: 'border-box',
            minHeight: 62,
            padding: '19px 22px',
            paddingRight: rightEl ? 58 : 22,
            background: 'var(--bg-elevated)',
            border: `1px solid ${error ? 'rgba(200,60,60,0.65)' : 'var(--border-bright)'}`,
            borderRadius: 7,
            color: 'var(--text-primary)',
            fontSize: 17,
            fontFamily: 'DM Sans, sans-serif',
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onFocus={e => {
            e.target.style.borderColor = error ? 'var(--ruby)' : 'var(--gold-light)'
            e.target.style.boxShadow = '0 0 0 3px var(--focus-ring)'
          }}
          onBlur={e => {
            e.target.style.borderColor = error ? 'rgba(200,60,60,0.65)' : 'var(--border-bright)'
            e.target.style.boxShadow = 'none'
          }}
        />
        {rightEl && (
          <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }}>
            {rightEl}
          </div>
        )}
      </div>
      {error && (
        <div id={`${id}-err`} role="alert" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ruby)' }}>
          <AlertCircle size={10} aria-hidden="true" /> {error}
        </div>
      )}
    </div>
  )
}

function PwField({ label, value, onChange, error, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <Field
      label={label}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      error={error}
      placeholder={placeholder}
      autoComplete={autoComplete}
      rightEl={
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
        >
          {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      }
    />
  )
}

function SubmitBtn({ loading, label }) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      style={{
        width: '100%', minHeight: 58, padding: '17px 20px',
        borderRadius: 8, border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
        color: loading ? 'var(--text-muted)' : '#070604',
        fontSize: 15.5, fontWeight: 700,
        fontFamily: 'DM Sans, sans-serif',
        letterSpacing: '0.03em',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 4,
        transition: 'opacity 0.2s',
      }}
    >
      {loading
        ? <><Spinner /> Verifying...</>
        : <>{label} <ArrowRight size={16} /></>
      }
    </button>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="20 14" />
    </svg>
  )
}

// ── Sign In ──────────────────────────────────────────────────────────────────

function SignInForm({ onAuth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const e = {}
    if (!email.trim()) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email'
    if (!password) e.password = 'Password is required'
    return e
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setLoading(true)
    try {
      const user = await login({ email, password })
      onAuth({ ...user, isNewUser: false })
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {errors.form && (
        <div role="alert" style={{ padding: '10px 12px', background: 'rgba(217,64,64,0.1)', border: '1px solid var(--ruby)', borderRadius: 8, color: 'var(--ruby)', fontSize: 13 }}>
          {errors.form}
        </div>
      )}
      <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com" error={errors.email} autoComplete="email" />
      <PwField label="Password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="••••••••" error={errors.password} autoComplete="current-password" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8 }}>
        <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--gold-light)', padding: 0, fontFamily: 'DM Sans, sans-serif' }}>
          Forgot password?
        </button>
      </div>
      <SubmitBtn loading={loading} label="Sign In" />
    </form>
  )
}

// ── Sign Up ──────────────────────────────────────────────────────────────────

function SignUpForm({ onAuth }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', zip: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setPhone = (e) => {
    const digits = e.target.value.replace(/\D/g, '')
    const nationalDigits = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
    let phone = nationalDigits
    if (nationalDigits.length > 6) phone = `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3, 6)}-${nationalDigits.slice(6)}`
    else if (nationalDigits.length > 3) phone = `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3)}`
    else if (nationalDigits.length > 0) phone = `(${nationalDigits}`
    if (digits.length === 11 && digits[0] === '1') phone = `1 ${phone}`
    setForm(f => ({ ...f, phone }))
  }

  function validate() {
    const e = {}
    const phoneDigits = form.phone.replace(/\D/g, '')
    if (!form.name.trim())    e.name    = 'Full name is required'
    if (!form.email.trim())   e.email   = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.phone.trim())   e.phone   = 'Phone number is required'
    else if (!(phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits[0] === '1'))) e.phone = 'Please enter a valid 10-digit US phone number'
    if (!form.zip.trim())     e.zip     = 'ZIP code is required'
    else if (!/^\d{5}(-\d{4})?$/.test(form.zip.trim())) e.zip = 'Enter a valid ZIP code'
    if (!form.password)       e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Minimum 8 characters'
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match'
    return e
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setLoading(true)
    try {
      const user = await register({
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone.trim(),
        zip: form.zip.trim(),
      })
      onAuth({ ...user, isNewUser: true })
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {errors.form && (
        <div role="alert" style={{ padding: '10px 12px', background: 'rgba(217,64,64,0.1)', border: '1px solid var(--ruby)', borderRadius: 8, color: 'var(--ruby)', fontSize: 13 }}>
          {errors.form}
        </div>
      )}
      <Field label="Full Name" value={form.name} onChange={set('name')}
        placeholder="Jane Smith" error={errors.name} autoComplete="name" />

      <Field label="Email" type="email" value={form.email} onChange={set('email')}
        placeholder="you@example.com" error={errors.email} autoComplete="email" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Phone Number" type="tel" value={form.phone} onChange={setPhone}
          placeholder="(555) 123-4567" error={errors.phone} autoComplete="tel" />
        <Field label="ZIP Code" value={form.zip} onChange={set('zip')}
          placeholder="94105" error={errors.zip} autoComplete="postal-code" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <PwField label="Password" value={form.password} onChange={set('password')}
          placeholder="Min. 8 chars" error={errors.password} autoComplete="new-password" />
        <PwField label="Confirm Password" value={form.confirm} onChange={set('confirm')}
          placeholder="Repeat password" error={errors.confirm} autoComplete="new-password" />
      </div>

      <SubmitBtn loading={loading} label="Create Account" />
    </form>
  )
}

// ── Main AuthScreen ──────────────────────────────────────────────────────────

export default function AuthScreen({ onAuth, onDevSkip }) {
  const [mode, setMode] = useState('signin')

  return (
    <div className="mallard-auth-screen" style={{ minHeight: '100vh', width: '100vw', background: 'transparent', overflow: 'hidden auto' }}>

      {/* Dev-only: skip login + onboarding, load demo data */}
      {onDevSkip && (
        <button
          type="button"
          onClick={onDevSkip}
          title="Developer shortcut: skip login and onboarding, load demo data"
          style={{
            position: 'absolute', top: 20, right: 24, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
            background: 'var(--green-soft, rgba(26,107,66,0.12))',
            border: '1px solid var(--green, var(--emerald))',
            color: 'var(--green-bright, var(--emerald))',
            fontSize: 11.5, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.04em', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--green, var(--emerald))'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--green-soft, rgba(26,107,66,0.12))'; e.currentTarget.style.color = 'var(--green-bright, var(--emerald))' }}
        >
          <FastForward size={13} />
          DEV: SKIP LOGIN
        </button>
      )}

      <div className="mallard-auth-split">
        <section className="mallard-landing-panel" aria-label="Mallard Management">
          <div className="mallard-landing-content">
            <div className="landing-reveal mallard-logo-row">
              <div className="mallard-logo-mark">
                <Feather size={30} color="#070604" strokeWidth={2.5} />
              </div>
              <div>
                <div className="mallard-logo-name">Mallard</div>
                <div className="mallard-logo-subtitle">MANAGEMENT</div>
              </div>
            </div>

            <div className="landing-reveal d2 mallard-hero-copy">
              <h1>
                Fly to<br />
                financial<br />
                <span>
                  freedom!
                  <svg viewBox="0 0 220 34" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M4 23C43 8 87 5 131 11C162 15 190 18 216 9" />
                  </svg>
                </span>
              </h1>
            </div>

            <div className="landing-reveal d3 mallard-value-list">
              {VALUE_PROPS.map((item) => (
                <div className="mallard-value-row" key={item.num}>
                  <div className="mallard-value-num">{item.num}</div>
                  <div>{item.text}</div>
                </div>
              ))}
            </div>

          </div>
        </section>

        <section className="mallard-auth-form-half" aria-label="Account access">
          <div className="landing-reveal d2 mallard-auth-card">
            <div className="mallard-form-panel">
              <div style={{ marginBottom: 28 }}>
                <h2 className="mallard-form-heading">
                  {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
                </h2>
                <p className="mallard-form-subcopy">
                  {mode === 'signin'
                    ? 'Sign in to access your financial dashboard.'
                    : 'Get started. It takes less than a minute.'}
                </p>
              </div>

              <div className="mallard-mode-toggle">
                {[{ id: 'signin', label: 'Sign In' }, { id: 'signup', label: 'Create Account' }].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setMode(id)}
                    type="button"
                    aria-pressed={mode === id}
                    style={{
                      flex: 1, padding: '11px 14px', borderRadius: 6, border: 'none',
                      cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
                      fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                      background: mode === id ? 'linear-gradient(135deg, var(--gold), var(--gold-bright))' : 'transparent',
                      color: mode === id ? '#070604' : 'var(--text-muted)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div key={mode} style={{ animation: 'fadeUp 0.25s ease both' }}>
                {mode === 'signin'
                  ? <SignInForm onAuth={onAuth} />
                  : <SignUpForm onAuth={onAuth} />
                }
              </div>

              <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)', marginTop: 24 }}>
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-light)', fontSize: 12.5, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', padding: 0 }}
                >
                  {mode === 'signin' ? 'Create one' : 'Sign in'}
                </button>
              </p>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes landingContentReveal {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .mallard-auth-screen {
          --landing-panel-bg: #faf8f3;
          --auth-card-bg: rgba(255, 255, 255, 0.94);
          --auth-card-border: rgba(0, 0, 0, 0.12);
          --auth-card-shadow: 0 28px 80px rgba(32, 27, 18, 0.18);
          --landing-reveal-duration: 0.58s;
          position: relative;
          z-index: 1;
        }

        .mallard-auth-screen::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          z-index: 20;
          background: #17130d;
          pointer-events: none;
        }

        [data-theme="dark"] .mallard-auth-screen {
          --landing-panel-bg: #050403;
          --auth-card-bg: rgba(8, 7, 5, 0.92);
          --auth-card-border: rgba(255, 255, 255, 0.12);
          --auth-card-shadow: 0 30px 90px rgba(0, 0, 0, 0.58);
        }

        .mallard-auth-screen .landing-reveal {
          opacity: 0;
          animation: landingContentReveal var(--landing-reveal-duration) cubic-bezier(0.2, 0.78, 0.2, 1) both;
          animation-delay: var(--landing-stagger, 80ms);
          will-change: opacity, transform;
        }

        .mallard-auth-screen .landing-reveal.d2 { --landing-stagger: 140ms; }
        .mallard-auth-screen .landing-reveal.d3 { --landing-stagger: 220ms; }
        .mallard-auth-screen .landing-reveal.d4 { --landing-stagger: 300ms; }

        .mallard-auth-split {
          min-height: 100vh;
          width: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          background: transparent;
        }

        .mallard-landing-panel {
          min-width: 0;
          min-height: 100vh;
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: clamp(52px, 5.2vw, 76px) clamp(44px, 5.8vw, 78px);
          background: var(--landing-panel-bg);
          border-right: 1px solid var(--border);
          box-shadow: 16px 0 54px rgba(24, 20, 14, 0.10);
        }

        [data-theme="dark"] .mallard-landing-panel {
          box-shadow: 18px 0 68px rgba(0, 0, 0, 0.62);
        }

        .mallard-landing-content {
          width: min(100%, 620px);
          min-height: calc(100vh - clamp(104px, 10.4vw, 152px));
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .mallard-auth-form-half {
          min-width: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(42px, 5vw, 72px);
          background: transparent;
        }

        .mallard-auth-card {
          width: min(100%, 620px);
          min-height: min(720px, calc(100vh - clamp(84px, 10vw, 144px)));
          padding: clamp(36px, 4.2vw, 52px);
          border: 1px solid var(--auth-card-border);
          border-top-color: var(--border-gold);
          border-radius: 8px;
          background: var(--auth-card-bg);
          box-shadow: var(--auth-card-shadow);
          backdrop-filter: blur(18px) saturate(1.04);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mallard-logo-row {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .mallard-logo-mark {
          width: 60px;
          height: 60px;
          border-radius: 16px;
          background: linear-gradient(135deg, var(--gold-bright) 0%, var(--gold) 52%, #8c640d 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 28px rgba(176, 128, 16, 0.26), inset 0 1px 1px rgba(255, 255, 255, 0.42);
          flex-shrink: 0;
        }

        .mallard-logo-name {
          font-family: 'Playfair Display', serif;
          font-size: 28px;
          font-weight: 700;
          line-height: 1.05;
          color: var(--text-primary);
        }

        .mallard-logo-subtitle {
          margin-top: 3px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.28em;
          color: var(--gold-light);
        }

        .mallard-hero-copy {
          margin-top: clamp(54px, 8vh, 92px);
        }

        .mallard-hero-copy h1 {
          margin: 0;
          font-family: 'Playfair Display', serif;
          font-size: clamp(64px, 7vw, 92px);
          font-weight: 600;
          line-height: 1.02;
          letter-spacing: -0.045em;
          color: var(--text-primary);
        }

        .mallard-hero-copy h1 span {
          position: relative;
          display: inline-block;
          color: var(--gold-light);
        }

        .mallard-hero-copy h1 svg {
          position: absolute;
          left: 0;
          right: 0;
          bottom: -19px;
          width: 100%;
          height: 20px;
          overflow: visible;
        }

        .mallard-hero-copy h1 path {
          fill: none;
          stroke: var(--gold);
          stroke-width: 5;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: 0.82;
        }

        .mallard-value-list {
          display: flex;
          flex-direction: column;
          gap: clamp(20px, 2.5vh, 28px);
          margin-top: clamp(56px, 7vh, 78px);
          max-width: 560px;
        }

        .mallard-value-row {
          display: flex;
          align-items: center;
          gap: 20px;
          color: var(--text-secondary);
          font-size: 16px;
          line-height: 1.5;
          font-weight: 500;
        }

        .mallard-value-num {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid rgba(176, 128, 16, 0.28);
          background: rgba(176, 128, 16, 0.08);
          color: var(--gold);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 500;
        }

        .mallard-form-panel {
          width: 100%;
          max-width: 520px;
        }

        .mallard-form-heading {
          margin: 0 0 8px;
          font-family: 'Playfair Display', serif;
          font-size: 40px;
          font-weight: 600;
          letter-spacing: -0.03em;
          line-height: 1;
          color: var(--text-primary);
        }

        .mallard-form-subcopy {
          margin: 0;
          color: var(--text-muted);
          font-size: 14.5px;
        }

        .mallard-mode-toggle {
          display: flex;
          margin-bottom: 26px;
          padding: 4px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--bg-elevated);
        }

        @media (max-width: 1120px) {
          .mallard-auth-split {
            grid-template-columns: 1fr;
          }

          .mallard-landing-panel {
            min-height: auto;
            padding-top: 88px;
            border-bottom: 1px solid var(--border);
            border-right: 0;
            box-shadow: 0 18px 54px rgba(0, 0, 0, 0.08);
          }

          .mallard-landing-content {
            min-height: auto;
            justify-content: flex-start;
          }

          .mallard-auth-form-half {
            min-height: auto;
            padding: 42px 28px 64px;
          }
        }

        @media (max-width: 620px) {
          .mallard-landing-panel {
            padding: 82px 20px 34px;
          }

          .mallard-auth-form-half {
            padding: 28px 16px 52px;
          }

          .mallard-auth-card {
            min-height: auto;
            padding: 28px 20px;
            width: min(100%, 620px);
          }

          .mallard-hero-copy {
            margin-top: 52px;
          }

          .mallard-hero-copy h1 {
            font-size: clamp(52px, 16vw, 70px);
          }

          .mallard-value-list {
            margin-top: 52px;
          }

          .mallard-value-row {
            align-items: flex-start;
            font-size: 15px;
          }

          .mallard-form-heading {
            font-size: 34px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mallard-auth-screen .landing-reveal {
            opacity: 1;
            transform: none;
            animation: none;
          }
        }

        input::placeholder { color: var(--text-muted); opacity: 1; }
        
        /* Prevent browser autofill from turning fields white/blue */
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 100px var(--bg-elevated) inset !important;
          -webkit-text-fill-color: var(--text-primary) !important;
          transition: background-color 5000s ease-in-out 0s;
          caret-color: var(--text-primary);
        }

        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 100px var(--bg-elevated) inset !important;
          -webkit-text-fill-color: var(--text-primary) !important;
        }
      `}</style>
    </div>
  )
}
