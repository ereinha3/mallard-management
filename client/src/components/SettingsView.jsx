import { Settings, User, SlidersHorizontal } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

function formatValue(value) {
  if (value == null || value === '') return 'Not provided'
  if (typeof value === 'number') return value.toLocaleString()
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None'
  return String(value).replace(/_/g, ' ')
}

function Row({ label, value, currency = false }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-sm font-mono text-right" style={{ color: 'var(--text-primary)' }}>
        {currency && typeof value === 'number' ? formatCurrency(value) : formatValue(value)}
      </span>
    </div>
  )
}

export default function SettingsView({ onboardResult, user }) {
  const profile = onboardResult?.validated_profile ?? onboardResult?.profile ?? {}

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <header className="px-8 py-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <p className="text-xs text-muted mt-2 uppercase tracking-wide font-semibold">
          Profile and preferences from your signed-in account and onboarding record
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
          <Row label="Name" value={user?.name} />
          <Row label="Email" value={user?.email} />
          <Row label="Filing status" value={profile.filing_status} />
          <Row label="Dependents" value={profile.dependents} />
        </section>

        <section className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Financial Profile
            </div>
          </div>
          <Row label="Household income" value={profile.household_income} currency />
          <Row label="Monthly expenses" value={profile.monthly_expenses} currency />
          <Row label="Capital on hand" value={profile.capital_on_hand} currency />
          <Row label="Emergency fund" value={profile.emergency_fund} currency />
          <Row label="Age" value={profile.age} />
          <Row label="Horizon years" value={profile.horizon_years} />
        </section>

        <section className="card-premium p-5" style={{ gridColumn: '1 / -1' }}>
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Investing Preferences
            </div>
          </div>
          <div className="grid gap-x-8" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Row label="Goals" value={profile.goals} />
            <Row label="Goal target" value={profile.goal_target} currency />
            <Row label="Universe preference" value={profile.universe_pref} />
            <Row label="ESG exclusions" value={profile.esg_exclusions} />
            <Row label="Sector/theme tilts" value={profile.sector_theme_tilts} />
          </div>
        </section>
      </div>
    </div>
  )
}
