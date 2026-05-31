import { Shield, Activity, Gauge, AlertTriangle } from 'lucide-react'
import { formatPercent } from '../lib/utils'

function numberOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function Metric({ label, value, icon: Icon, color = 'var(--gold-light)' }) {
  return (
    <div className="card-premium p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="font-display font-semibold" style={{ fontSize: 30, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value ?? 'Not available'}
      </div>
    </div>
  )
}

export default function RiskView({ onboardResult }) {
  const riskProfile = onboardResult?.risk_profile ?? {}
  const risk = onboardResult?.financial_analysis?.risk ?? {}
  const capacity = numberOrNull(riskProfile.capacity_score ?? risk.capacity_score)
  const tolerance = numberOrNull(riskProfile.tolerance_score ?? risk.tolerance_score)
  const gamma = numberOrNull(riskProfile.gamma_mid ?? riskProfile.gamma ?? risk.gamma_mid)
  const gammaBand = risk.label ?? riskProfile.gamma_band_label ?? null
  const targetVol = numberOrNull(risk.target_volatility_pct)
  const maxLoss = numberOrNull(risk.estimated_max_loss_1yr_pct)

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <header className="px-8 py-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)' }}>Risk</h1>
        <p className="text-xs text-muted mt-2 uppercase tracking-wide font-semibold">
          From onboarding analysis and risk profile
        </p>
      </header>

      <div className="p-8 space-y-5 max-w-6xl">
        <div data-tour="risk-overview" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Metric label="Gamma Band" value={gammaBand} icon={Shield} />
          <Metric label="Risk Aversion Gamma" value={gamma != null ? gamma.toFixed(2) : null} icon={Gauge} />
          <Metric label="Target Volatility" value={targetVol != null ? formatPercent(targetVol) : null} icon={Activity} color="var(--emerald)" />
          <Metric label="Estimated 1Y Max Loss" value={maxLoss != null ? formatPercent(maxLoss) : null} icon={AlertTriangle} color="var(--ruby)" />
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div data-tour="risk-capacity-tolerance" className="card-premium p-6">
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Capacity vs Tolerance
            </div>
            {[
              { label: 'Capacity', value: capacity, color: 'var(--blue)' },
              { label: 'Tolerance', value: tolerance, color: 'var(--gold-light)' },
            ].map(item => (
              <div key={item.label} className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{item.value ?? 'Not available'}</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, item.value ?? 0))}%`, background: item.color }}
                  />
                </div>
              </div>
            ))}
            <div className="text-xs mt-5" style={{ color: 'var(--text-muted)' }}>
              Binding axis: <span style={{ color: 'var(--text-secondary)' }}>{risk.binding_axis ?? 'Not available'}</span>
            </div>
          </div>

          <div className="card-premium p-6">
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Flags and Notes
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span style={{ color: 'var(--text-secondary)' }}>Loss aversion flag</span>
                <span style={{ color: risk.loss_aversion_flag ? 'var(--ruby)' : 'var(--emerald)' }}>
                  {risk.loss_aversion_flag == null ? 'Not available' : risk.loss_aversion_flag ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Contradiction note</div>
                <div style={{ color: 'var(--text-secondary)' }}>{risk.contradiction_note || 'None returned'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
