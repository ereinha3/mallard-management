import { useState } from 'react'
import { Feather, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react'

const VALUE_PROPS = [
  { num: '01', text: 'Tells you not to invest — when that\'s the right answer.' },
  { num: '02', text: 'Shows the math, not just the verdict.' },
  { num: '03', text: 'Builds a portfolio sized to what you can actually afford.' },
  { num: '04', text: 'Rebalances on drift, not a calendar — no needless fees.' },
]

function Input({ label, type = 'text', value, onChange, error, placeholder, rightEl }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '12px 16px',
            paddingRight: rightEl ? 44 : 16,
            background: 'var(--bg-elevated)',
            border: `1px solid ${error ? 'rgba(230,69,69,0.6)' : 'var(--border-bright)'}`,
            borderRadius: 10,
            color: 'var(--text-primary)',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            outline: 'none',
            transition: 'border-color 0.2s',
            boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = error ? 'var(--ruby)' : 'var(--gold)' }}
          onBlur={e => { e.target.style.borderColor = error ? 'rgba(230,69,69,0.6)' : 'var(--border-bright)' }}
        />
        {rightEl && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
            {rightEl}
          </div>
        )}
      </div>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ruby)' }}>
          <AlertCircle size={11} />
          {error}
        </div>
      )}
    </div>
  )
}

function SignInForm({ onAuth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
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
    await new Promise(r => setTimeout(r, 800))
    onAuth({ email })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        error={errors.email}
      />
      <Input
        label="Password"
        type={showPw ? 'text' : 'password'}
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="••••••••"
        error={errors.password}
        rightEl={
          <button type="button" onClick={() => setShowPw(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        }
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--gold-light)', padding: 0 }}>
          Forgot password?
        </button>
      </div>
      <SubmitButton loading={loading} label="Sign In" />
    </form>
  )
}

function CreateForm({ onAuth }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const e = {}
    if (!name.trim()) e.name = 'Name is required'
    if (!email.trim()) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email'
    if (!password) e.password = 'Password is required'
    else if (password.length < 8) e.password = 'At least 8 characters'
    if (!confirm) e.confirm = 'Please confirm your password'
    else if (confirm !== password) e.confirm = 'Passwords do not match'
    return e
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setLoading(true)
    await new Promise(r => setTimeout(r, 900))
    onAuth({ email, name })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" error={errors.name} />
      <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" error={errors.email} />
      <Input
        label="Password"
        type={showPw ? 'text' : 'password'}
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Min. 8 characters"
        error={errors.password}
        rightEl={
          <button type="button" onClick={() => setShowPw(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        }
      />
      <Input
        label="Confirm Password"
        type={showPw ? 'text' : 'password'}
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        placeholder="Repeat password"
        error={errors.confirm}
      />
      <SubmitButton loading={loading} label="Create Account" />
    </form>
  )
}

function SubmitButton({ loading, label }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        padding: '13px 24px',
        borderRadius: 10,
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        background: loading
          ? 'var(--bg-elevated)'
          : 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
        color: loading ? 'var(--text-muted)' : '#070910',
        fontSize: 14,
        fontWeight: 700,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        letterSpacing: '0.02em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'opacity 0.2s',
        marginTop: 4,
      }}
    >
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="20 14" />
          </svg>
          Verifying…
        </span>
      ) : (
        <>
          {label}
          <ArrowRight size={15} />
        </>
      )}
    </button>
  )
}

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('signin')

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>
      {/* ── Left panel ─────────────────────────────────────────── */}
      <div style={{
        width: '42%',
        minWidth: 420,
        position: 'relative',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        overflow: 'hidden',
      }}>
        {/* Geometric background pattern */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04, pointerEvents: 'none' }}
          viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 12 }, (_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 70} x2="400" y2={i * 70} stroke="var(--gold)" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line key={`v${i}`} x1={i * 60} y1="0" x2={i * 60} y2="800" stroke="var(--gold)" strokeWidth="0.5" />
          ))}
          <circle cx="200" cy="400" r="180" fill="none" stroke="var(--gold)" strokeWidth="0.5" />
          <circle cx="200" cy="400" r="120" fill="none" stroke="var(--gold)" strokeWidth="0.5" />
          <circle cx="200" cy="400" r="60" fill="none" stroke="var(--gold)" strokeWidth="0.5" />
        </svg>

        {/* Atmospheric gold glow */}
        <div style={{
          position: 'absolute', bottom: '-80px', left: '-80px',
          width: 360, height: 360, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196,154,44,0.09) 0%, transparent 70%)',
          filter: 'blur(40px)', pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather size={20} color="#070910" />
          </div>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontWeight: 600, fontSize: 18, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              Mallard
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--gold-light)', fontFamily: 'DM Mono, monospace' }}>
              WEALTH
            </div>
          </div>
        </div>

        {/* Hero copy */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 52,
            fontWeight: 600,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            marginBottom: 40,
          }}>
            The advisor<br />
            with the spine<br />
            to tell you<br />
            <span style={{ color: 'var(--gold-light)', fontStyle: 'italic' }}>not yet.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {VALUE_PROPS.map(vp => (
              <div key={vp.num} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{
                  fontFamily: 'DM Mono, monospace', fontSize: 10,
                  color: 'var(--gold)', letterSpacing: '0.06em',
                  marginTop: 3, flexShrink: 0,
                }}>
                  {vp.num}
                </span>
                <div style={{
                  width: 1, alignSelf: 'stretch', background: 'var(--border-bright)',
                  flexShrink: 0, minHeight: 16,
                }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {vp.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 20 }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Demonstration only — not financial advice.<br />
            Not a registered investment adviser.
          </div>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 64px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle top-right glow */}
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196,154,44,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
          {/* Mode header */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1,
              marginBottom: 8,
            }}>
              {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {mode === 'signin'
                ? 'Sign in to access your financial dashboard.'
                : 'Get started — it takes less than a minute.'}
            </p>
          </div>

          {/* Mode toggle pills */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-elevated)',
            borderRadius: 10,
            padding: 4,
            marginBottom: 32,
            border: '1px solid var(--border)',
          }}>
            {[
              { id: 'signin', label: 'Sign In' },
              { id: 'signup', label: 'Create Account' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                style={{
                  flex: 1,
                  padding: '9px 16px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  transition: 'all 0.18s',
                  background: mode === id
                    ? 'linear-gradient(135deg, var(--gold), var(--gold-bright))'
                    : 'transparent',
                  color: mode === id ? '#070910' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Form */}
          <div style={{ animation: 'fadeUp 0.3s ease both' }} key={mode}>
            {mode === 'signin'
              ? <SignInForm onAuth={onAuth} />
              : <CreateForm onAuth={onAuth} />
            }
          </div>

          {/* Switch mode link */}
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 28 }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--gold-light)', fontSize: 13, fontWeight: 600,
                fontFamily: 'Plus Jakarta Sans, sans-serif', padding: 0,
              }}
            >
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: var(--text-muted); }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 100px var(--bg-elevated) inset;
          -webkit-text-fill-color: var(--text-primary);
        }
      `}</style>
    </div>
  )
}
