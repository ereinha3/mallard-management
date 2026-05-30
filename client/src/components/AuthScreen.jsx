import { useState } from 'react'
import { Feather, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={id} style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
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
            padding: '11px 14px',
            paddingRight: rightEl ? 42 : 14,
            background: 'var(--bg-elevated)',
            border: `1px solid ${error ? 'rgba(200,60,60,0.65)' : 'var(--border-bright)'}`,
            borderRadius: 7,
            color: 'var(--text-primary)',
            fontSize: 13.5,
            fontFamily: 'Inter, sans-serif',
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
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
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
          {show ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
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
        width: '100%', padding: '13px',
        borderRadius: 8, border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
        color: loading ? 'var(--text-muted)' : '#070604',
        fontSize: 13.5, fontWeight: 700,
        fontFamily: 'Inter, sans-serif',
        letterSpacing: '0.03em',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 4,
        transition: 'opacity 0.2s',
      }}
    >
      {loading
        ? <><Spinner /> Verifying...</>
        : <>{label} <ArrowRight size={14} /></>
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
    await new Promise(r => setTimeout(r, 700))
    onAuth({ email, isNewUser: false })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com" error={errors.email} autoComplete="email" />
      <PwField label="Password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="••••••••" error={errors.password} autoComplete="current-password" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8 }}>
        <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--gold-light)', padding: 0, fontFamily: 'Inter, sans-serif' }}>
          Forgot password?
        </button>
      </div>
      <SubmitBtn loading={loading} label="Sign In" />
    </form>
  )
}

// ── Sign Up ──────────────────────────────────────────────────────────────────

function SignUpForm({ onAuth }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', phone: '', address: '', zip: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  function validate() {
    const e = {}
    if (!form.name.trim())    e.name    = 'Full name is required'
    if (!form.email.trim())   e.email   = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.password)       e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Minimum 8 characters'
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match'
    if (!form.phone.trim())   e.phone   = 'Phone number is required'
    if (!form.address.trim()) e.address = 'Street address is required'
    if (!form.zip.trim())     e.zip     = 'ZIP code is required'
    else if (!/^\d{5}(-\d{4})?$/.test(form.zip.trim())) e.zip = 'Enter a valid ZIP'
    return e
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    onAuth({ name: form.name, email: form.email, phone: form.phone, address: form.address, zip: form.zip, isNewUser: true })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      <Field label="Full Name" value={form.name} onChange={set('name')}
        placeholder="Jane Smith" error={errors.name} autoComplete="name" />

      <Field label="Email" type="email" value={form.email} onChange={set('email')}
        placeholder="you@example.com" error={errors.email} autoComplete="email" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <PwField label="Password" value={form.password} onChange={set('password')}
          placeholder="Min. 8 chars" error={errors.password} autoComplete="new-password" />
        <PwField label="Confirm Password" value={form.confirm} onChange={set('confirm')}
          placeholder="Repeat password" error={errors.confirm} autoComplete="new-password" />
      </div>

      <Field label="Phone Number" type="tel" value={form.phone} onChange={set('phone')}
        placeholder="(555) 000-0000" error={errors.phone} autoComplete="tel" />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <Field label="Street Address" value={form.address} onChange={set('address')}
          placeholder="123 Main St" error={errors.address} autoComplete="street-address" />
        <Field label="ZIP Code" value={form.zip} onChange={set('zip')}
          placeholder="94105" error={errors.zip} autoComplete="postal-code" />
      </div>

      <SubmitBtn loading={loading} label="Create Account" />
    </form>
  )
}

// ── Main AuthScreen ──────────────────────────────────────────────────────────

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('signin')

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* Left brand panel */}
      <div style={{
        width: '40%', minWidth: 380,
        position: 'relative',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '44px 52px',
        overflow: 'hidden',
      }}>
        {/* Vertical gold rule */}
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 1, height: '100%',
          background: 'linear-gradient(to bottom, transparent, rgba(180,128,16,0.28) 40%, rgba(180,128,16,0.12) 70%, transparent)',
          pointerEvents: 'none',
        }} />

        {/* Geometric grid */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.038, pointerEvents: 'none' }}
          viewBox="0 0 400 900" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 14 }, (_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 68} x2="400" y2={i * 68} stroke="#b08010" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <line key={`v${i}`} x1={i * 68} y1="0" x2={i * 68} y2="900" stroke="#b08010" strokeWidth="0.5" />
          ))}
          <circle cx="200" cy="450" r="200" fill="none" stroke="#b08010" strokeWidth="0.5" />
          <circle cx="200" cy="450" r="130" fill="none" stroke="#b08010" strokeWidth="0.5" />
        </svg>

        {/* Glow */}
        <div style={{
          position: 'absolute', bottom: '-60px', left: '-60px',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(176,128,16,0.11) 0%, rgba(176,128,16,0.04) 50%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9,
            background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather size={18} color="#070604" />
          </div>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontWeight: 600, fontSize: 17, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              Mallard
            </div>
            <div style={{ fontSize: 9.5, letterSpacing: '0.16em', color: 'var(--gold-light)', fontFamily: 'JetBrains Mono, monospace' }}>
              WEALTH
            </div>
          </div>
        </div>

        {/* Hero copy */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 50, fontWeight: 600,
            lineHeight: 1.09, letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            marginBottom: 36,
          }}>
            The advisor<br />
            with the spine<br />
            to tell you<br />
            <em style={{ color: 'var(--gold-light)', fontStyle: 'italic' }}>not yet.</em>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {VALUE_PROPS.map(vp => (
              <div key={vp.num} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--gold)', letterSpacing: '0.06em', marginTop: 2, flexShrink: 0 }}>
                  {vp.num}
                </span>
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-bright)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{vp.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 18 }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Demonstration only. Not financial advice.<br />Not a registered investment adviser.
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 56px', position: 'relative', overflow: 'hidden auto',
      }}>
        <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontFamily: 'Cormorant Garamond, serif', fontSize: 34,
              fontWeight: 600, letterSpacing: '-0.03em',
              color: 'var(--text-primary)', margin: 0, lineHeight: 1, marginBottom: 8,
            }}>
              {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {mode === 'signin'
                ? 'Sign in to access your financial dashboard.'
                : 'Get started. It takes less than a minute.'}
            </p>
          </div>

          {/* Mode toggle */}
          <div style={{
            display: 'flex', background: 'var(--bg-elevated)',
            borderRadius: 9, padding: 4, marginBottom: 26,
            border: '1px solid var(--border)',
          }}>
            {[{ id: 'signin', label: 'Sign In' }, { id: 'signup', label: 'Create Account' }].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                type="button"
                aria-pressed={mode === id}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
                  background: mode === id ? 'linear-gradient(135deg, var(--gold), var(--gold-bright))' : 'transparent',
                  color: mode === id ? '#070604' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Form */}
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-light)', fontSize: 12.5, fontWeight: 600, fontFamily: 'Inter, sans-serif', padding: 0 }}
            >
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        input::placeholder { color: var(--text-muted); opacity: 1; }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 100px var(--bg-elevated) inset;
          -webkit-text-fill-color: var(--text-primary);
        }
      `}</style>
    </div>
  )
}
