import { User, Sun, Moon, LogOut } from 'lucide-react'
import { useTheme } from '../theme/ThemeProvider'

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

export default function SettingsView({ user: signedInUser, onLogout }) {
  const user = signedInUser ?? {}
  const { theme, setTheme } = useTheme()

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
          <ReadOnlyField label="Name" value={user.name} />
          <ReadOnlyField label="Email" value={user.email} />
          <ReadOnlyField label="Phone" value={user.phone} />
          <ReadOnlyField label="Address" value={user.address} />
          <ReadOnlyField label="ZIP Code" value={user.zip_code} />
        </section>

        <section className="card-premium p-5">
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

        <section className="card-premium p-5" style={{ gridColumn: '1 / -1' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Session
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Sign out of this Mallard Management session.
              </div>
            </div>
            <button
              type="button"
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
        </section>
      </div>
    </div>
  )
}
