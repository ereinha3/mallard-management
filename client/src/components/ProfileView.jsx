import { Settings, SlidersHorizontal } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

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

export default function ProfileView({ onboardResult }) {
  const profile = onboardResult?.validated_profile ?? onboardResult?.profile ?? {}

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <header className="px-8 py-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)' }}>Your Profile</h1>
        <p className="text-xs text-muted mt-2 uppercase tracking-wide font-semibold">
          Financial profile and investing preferences from your onboarding
        </p>
      </header>

      <div className="p-8 grid gap-5 max-w-6xl" style={{ gridTemplateColumns: '1fr 1fr' }}>
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

        <section className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Investing Preferences
            </div>
          </div>
          <ReadOnlyField label="Goals" value={profile.goals} />
          <ReadOnlyField label="Goal target" value={profile.goal_target} currency />
          <ReadOnlyField label="Universe preference" value={profile.universe_pref} />
          <ReadOnlyField label="ESG exclusions" value={profile.esg_exclusions} />
          <ReadOnlyField label="Sector/theme tilts" value={profile.sector_theme_tilts} />
        </section>

        <div className="card-premium p-4 text-sm font-semibold" style={{ gridColumn: '1 / -1', color: 'var(--gold-light)' }}>
          To update these, complete a new Greenlight session.
        </div>
      </div>
    </div>
  )
}
