import { Shield, Activity, Gauge, AlertTriangle } from 'lucide-react'
import { formatPercent, numberOrNull } from '../lib/utils'

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

function getRiskValues(onboardResult) {
  const summary = onboardResult?.financial_analysis?.risk ?? {}
  const profileRisk = onboardResult?.risk_profile ?? {}
  const fallbackTargetVol = numberOrNull(profileRisk.target_vol_band?.mid)

  return {
    capacity: numberOrNull(summary.capacity_score ?? profileRisk.capacity_score),
    tolerance: numberOrNull(summary.tolerance_score ?? profileRisk.tolerance_score),
    gamma: numberOrNull(summary.gamma_mid ?? profileRisk.gamma_band?.mid),
    label: typeof summary.label === 'string' && summary.label.trim() ? summary.label : null,
    targetVol: numberOrNull(summary.target_volatility_pct) ?? (fallbackTargetVol == null ? null : fallbackTargetVol * 100),
    maxLoss: numberOrNull(summary.estimated_max_loss_1yr_pct),
    bindingAxis: summary.binding_axis ?? profileRisk.binding_axis ?? null,
    lossAversionFlag: summary.loss_aversion_flag ?? profileRisk.loss_aversion_flag ?? null,
    contradictionNote: summary.contradiction_note ?? profileRisk.contradiction_note ?? null,
  }
}

export default function RiskView({ onboardResult }) {
  const risk = getRiskValues(onboardResult)
  const capacity = risk.capacity
  const tolerance = risk.tolerance
  const gamma = risk.gamma
  const gammaLabel = risk.label
  const targetVol = risk.targetVol
  const maxLoss = risk.maxLoss

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
          <Metric label="Risk Label" value={gammaLabel} icon={Shield} />
          <Metric label="Risk Aversion Gamma" value={gamma != null ? gamma.toFixed(2) : null} icon={Gauge} />
          <Metric label="Target Volatility" value={targetVol != null ? formatPercent(targetVol) : null} icon={Activity} color="var(--emerald)" />
          <Metric label="Estimated 1Y Max Loss" value={maxLoss != null ? formatPercent(maxLoss) : null} icon={AlertTriangle} color="var(--ruby)" />
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div data-tour="risk-capacity-tolerance" className="card-premium p-6">
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Capacity vs Tolerance
            </div>
            <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
              Capacity is how much investment risk your finances can absorb; tolerance is your willingness to take risk.
            </p>
            {[
              { label: 'Capacity', value: capacity, color: 'var(--blue)' },
              { label: 'Tolerance', value: tolerance, color: 'var(--gold-light)' },
            ].map(item => (
              <div key={item.label} className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{item.value != null ? Math.round(item.value) : 'Not available'}</span>
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
              Binding axis: <span style={{ color: 'var(--text-secondary)' }}>{risk.bindingAxis ?? 'Not available'}</span>
            </div>
          </div>

          <div className="card-premium p-6">
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Flags and Notes
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span style={{ color: 'var(--text-secondary)' }}>Loss aversion flag</span>
                <span style={{ color: risk.lossAversionFlag ? 'var(--ruby)' : 'var(--emerald)' }}>
                  {risk.lossAversionFlag == null ? 'Not available' : risk.lossAversionFlag ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Contradiction note</div>
                <div style={{ color: 'var(--text-secondary)' }}>{risk.contradictionNote || 'None returned'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
