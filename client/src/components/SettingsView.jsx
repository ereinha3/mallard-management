import { useEffect, useState } from 'react'
import { User, Sun, Moon, LogOut, RotateCcw } from 'lucide-react'
import { useTheme } from '../theme/ThemeProvider'
import { useTour } from './tour/TourProvider'

const AUTH_STORAGE_KEY = 'mallard.auth'

function formatValue(value) {
  if (value == null || value === '') return 'Not provided'
  if (typeof value === 'number') return value.toLocaleString()
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None'
  return String(value).replace(/_/g, ' ')
}

function ReadOnlyField({ label, value }) {
  return (
    <label className="block py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="block text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input
        type="text"
        disabled
        value={formatValue(value)}
        className="w-full bg-transparent text-sm font-mono disabled:opacity-100"
        style={{ color: 'var(--text-primary)' }}
      />
    </label>
  )
}

function EditableField({ label, value, onChange, type = 'text', autoComplete, maxLength }) {
  return (
    <label className="block py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="block text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className="w-full bg-transparent text-sm font-mono"
        style={{
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      />
    </label>
  )
}

function accountFormFromUser(user) {
  return {
    name: user.name ?? '',
    phone: user.phone ?? '',
    address: user.address ?? '',
    zip_code: user.zip_code ?? user.zip ?? '',
  }
}

function readStoredUser() {
  try {
    const stored = window.localStorage.getItem(AUTH_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export default function SettingsView({ user: signedInUser, onLogout, onNavigate, onUserUpdated }) {
  const user = signedInUser ?? {}
  const userName = user.name ?? ''
  const userPhone = user.phone ?? ''
  const userAddress = user.address ?? ''
  const userZip = user.zip_code ?? user.zip ?? ''
  const [accountForm, setAccountForm] = useState(() => accountFormFromUser(user))
  const { theme, setTheme } = useTheme()
  const { startTour } = useTour()

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (!cancelled) {
        setAccountForm({
          name: userName,
          phone: userPhone,
          address: userAddress,
          zip_code: userZip,
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [userName, userPhone, userAddress, userZip])

  function handleReplayTour() {
    startTour({ onNavigate })
  }

  function updateAccountField(field) {
    return (event) => {
      setAccountForm(current => ({ ...current, [field]: event.target.value }))
    }
  }

  function updatePhone(event) {
    const digits = event.target.value.replace(/\D/g, '')
    const nationalDigits = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
    let phone = nationalDigits
    if (nationalDigits.length > 6) phone = `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3, 6)}-${nationalDigits.slice(6)}`
    else if (nationalDigits.length > 3) phone = `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3)}`
    else if (nationalDigits.length > 0) phone = `(${nationalDigits}`
    if (digits.length === 11 && digits[0] === '1') phone = `1 ${phone}`
    setAccountForm(current => ({ ...current, phone }))
  }

  function handleSaveAccount() {
    const storedUser = readStoredUser()

    const updatedUser = {
      ...user,
      ...storedUser,
      name: accountForm.name.trim(),
      phone: accountForm.phone.trim(),
      address: accountForm.address.trim(),
      zip: accountForm.zip_code.trim(),
      zip_code: accountForm.zip_code.trim(),
    }

    try {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser))
    } catch {
      // localStorage unavailable (private mode / SSR) - keep UI update local.
    }

    onUserUpdated?.(updatedUser)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <header className="px-8 py-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <p className="text-xs text-muted mt-2 uppercase tracking-wide font-semibold">
          Account, appearance, and session controls
        </p>
      </header>

      <div className="p-8 grid gap-5 max-w-6xl" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Account
            </div>
          </div>
          <EditableField label="Name" value={accountForm.name} onChange={updateAccountField('name')} autoComplete="name" />
          <ReadOnlyField label="Email" value={user.email} />
          <EditableField label="Phone" type="tel" value={accountForm.phone} onChange={updatePhone} autoComplete="tel" />
          <EditableField label="Street Address" value={accountForm.address} onChange={updateAccountField('address')} autoComplete="street-address" />
          <EditableField label="ZIP Code" value={accountForm.zip_code} onChange={updateAccountField('zip_code')} autoComplete="postal-code" maxLength={5} />
          <button
            type="button"
            onClick={handleSaveAccount}
            className="mt-5 inline-flex items-center justify-center h-10 px-4 text-sm font-semibold transition-colors"
            style={{
              border: '1px solid var(--border-gold)',
              borderRadius: 8,
              background: 'var(--gold)',
              color: '#070604',
              cursor: 'pointer',
            }}
          >
            Save Changes
          </button>
        </section>

        <section className="card-premium p-5" data-tour="settings-appearance">
          <div className="flex items-center gap-2 mb-4">
            <Sun size={14} style={{ color: 'var(--green-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Appearance
            </div>
          </div>
          <div
            className="grid gap-1 p-1"
            style={{
              gridTemplateColumns: '1fr 1fr',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}
          >
            {[
              { value: 'light', label: 'Light', Icon: Sun },
              { value: 'dark', label: 'Dark', Icon: Moon },
            ].map(({ value, label, Icon }) => {
              const active = theme === value

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className="h-10 inline-flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
                  style={{
                    border: '1px solid',
                    borderColor: active ? 'var(--border-gold)' : 'transparent',
                    borderRadius: 8,
                    background: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                  aria-pressed={active}
                >
                  <Icon size={15} style={{ color: active ? 'var(--green)' : 'var(--text-muted)' }} />
                  {label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="card-premium p-5" data-tour="settings-session" style={{ gridColumn: '1 / -1' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Session
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Sign out of this Mallard Management session.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-tour="tour-replay"
                onClick={handleReplayTour}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-semibold transition-colors"
                style={{
                  border: '1px solid var(--border-bright)',
                  borderRadius: 8,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={15} />
                Replay Tutorial
              </button>
              <button
                type="button"
                data-tour="settings-logout"
                onClick={onLogout}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-semibold transition-colors"
                style={{
                  border: '1px solid rgba(217, 64, 64, 0.75)',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--ruby)',
                  cursor: 'pointer',
                }}
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
