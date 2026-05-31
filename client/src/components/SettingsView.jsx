import { Settings, User, SlidersHorizontal, Sun, Moon, LogOut } from 'lucide-react'
import { formatCurrency } from '../lib/utils'
import { useTheme } from '../theme/ThemeProvider'

function formatValue(value) {
  if (value == null || value === '') return 'Not provided'
  if (typeof value === 'number') return value.toLocaleString()
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None'
  return String(value).replace(/_/g, ' ')
}

function ReadOnlyField({ label, value, currency = false }) {
  const displayValue = currency && typeof value === 'number' ? formatCurrency(value) : formatValue(value)

  return (
    <label className="block py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="block text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input
        type="text"
        disabled
        value={displayValue}
        className="w-full bg-transparent text-sm font-mono disabled:opacity-100"
        style={{ color: 'var(--text-primary)' }}
      />
    </label>
  )
}

export default function SettingsView({ onboardResult, user: signedInUser, onLogout }) {
  const profile = onboardResult?.validated_profile ?? {}
  const user = signedInUser ?? onboardResult?.user ?? {}
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <header className="px-8 py-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <p className="text-xs text-muted mt-2 uppercase tracking-wide font-semibold">
          Profile and preferences from your signed-in account and onboarding record
        </p>
      </header>

      <div className="p-8 grid gap-5 max-w-6xl" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card-premium p-4 text-sm font-semibold" style={{ gridColumn: '1 / -1', color: 'var(--gold-light)' }}>
          Save coming soon.
        </div>

        <section className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Account
            </div>
          </div>
          <ReadOnlyField label="Name" value={user.name ?? profile.name} />
          <ReadOnlyField label="Email" value={user.email ?? profile.email} />
          <ReadOnlyField label="Filing status" value={profile.filing_status} />
          <ReadOnlyField label="Dependents" value={profile.dependents} />
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

        <section className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Financial Profile
            </div>
          </div>
          <ReadOnlyField label="Household income" value={profile.household_income} currency />
          <ReadOnlyField label="Monthly expenses" value={profile.monthly_expenses} currency />
          <ReadOnlyField label="Capital on hand" value={profile.capital_on_hand} currency />
          <ReadOnlyField label="Emergency fund" value={profile.emergency_fund} currency />
          <ReadOnlyField label="Age" value={profile.age} />
          <ReadOnlyField label="Horizon years" value={profile.horizon_years} />
        </section>

        <section className="card-premium p-5" style={{ gridColumn: '1 / -1' }}>
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Investing Preferences
            </div>
          </div>
          <div className="grid gap-x-8" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <ReadOnlyField label="Goals" value={profile.goals} />
            <ReadOnlyField label="Goal target" value={profile.goal_target} currency />
            <ReadOnlyField label="Universe preference" value={profile.universe_pref} />
            <ReadOnlyField label="ESG exclusions" value={profile.esg_exclusions} />
            <ReadOnlyField label="Sector/theme tilts" value={profile.sector_theme_tilts} />
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
