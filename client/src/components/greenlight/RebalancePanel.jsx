import { AlertTriangle, ArrowRight, Info, TrendingDown } from 'lucide-react'

const SLEEVES = [
  { label: 'US Equity',   ticker: 'VTI',  target: 38, current: 44, color: '#ddb84a' },
  { label: 'Intl Equity', ticker: 'VXUS', target: 20, current: 18, color: '#4a72e8' },
  { label: 'Bonds',       ticker: 'BND',  target: 18, current: 15, color: '#6b7280' },
  { label: 'TIPS',        ticker: 'SCHP', target: 8,  current: 7,  color: '#22c27e' },
  { label: 'Gold',        ticker: 'GLDM', target: 8,  current: 9,  color: '#f0c060' },
  { label: 'REITs',       ticker: 'USRT', target: 8,  current: 7,  color: '#8b5cf6' },
]

const TAX_FLAGS = [
  {
    ticker: 'BND',
    label: 'Bonds (BND)',
    costBasis: 1412,
    currentValue: 1350,
    loss: 62,
    washSaleWindow: '30 days',
    replacement: 'FBND (Fidelity Total Bond)',
  },
]

function DriftBar({ sleeve }) {
  const drift = sleeve.current - sleeve.target
  const breached = Math.abs(drift) > 5
  const driftPct = Math.min(Math.abs(drift) / 10, 1)

  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{
        background: breached ? 'rgba(230,69,69,0.05)' : 'var(--bg-elevated)',
        border: `1px solid ${breached ? 'rgba(230,69,69,0.3)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: sleeve.color }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sleeve.label}</span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{sleeve.ticker}</span>
        </div>
        <div className="flex items-center gap-2">
          {breached && <AlertTriangle size={13} style={{ color: 'var(--ruby)' }} />}
          <span
            className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: breached ? 'rgba(230,69,69,0.12)' : 'rgba(74,114,232,0.1)',
              color: breached ? 'var(--ruby)' : 'var(--blue)',
            }}
          >
            {drift > 0 ? '+' : ''}{drift}pp
          </span>
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        {/* Target marker */}
        <div
          style={{
            position: 'absolute',
            left: `${sleeve.target}%`,
            top: 0, bottom: 0,
            width: 2,
            background: 'var(--text-muted)',
            zIndex: 2,
          }}
        />
        {/* Band (±5pp) */}
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(0, sleeve.target - 5)}%`,
            width: `${Math.min(10, 100 - Math.max(0, sleeve.target - 5))}%`,
            top: 0, bottom: 0,
            background: breached ? 'rgba(230,69,69,0.12)' : 'rgba(74,114,232,0.12)',
            zIndex: 1,
          }}
        />
        {/* Current fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${sleeve.current}%`,
            top: '25%', bottom: '25%',
            background: sleeve.color,
            borderRadius: 4,
            opacity: 0.85,
            zIndex: 3,
            transition: 'width 0.8s ease',
          }}
        />
      </div>

      <div className="flex justify-between mt-1.5 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
        <span>0%</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          Target <span style={{ color: sleeve.color }}>{sleeve.target}%</span> · Current <span style={{ color: breached ? 'var(--ruby)' : 'var(--text-primary)' }}>{sleeve.current}%</span>
        </span>
        <span>50%</span>
      </div>

      <div className="mt-2 text-xs" style={{ color: breached ? 'var(--ruby)' : 'var(--text-muted)' }}>
        {breached
          ? `⚠ Breached band: corrective trade required`
          : Math.abs(drift) > 2
          ? `Within band: steer next contribution to ${drift < 0 ? 'increase' : 'reduce'}`
          : `On target`
        }
      </div>
    </div>
  )
}

function RebalancePlan() {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
        Rebalance Decision
      </div>
      <div className="space-y-3">
        {/* Corrective trade */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(230,69,69,0.06)', border: '1px solid rgba(230,69,69,0.2)' }}
        >
          <div
            className="shrink-0 flex items-center justify-center rounded-lg"
            style={{ width: 28, height: 28, background: 'rgba(230,69,69,0.15)', color: 'var(--ruby)' }}
          >
            <ArrowRight size={13} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--ruby)' }}>
              Corrective Trade: Band Breached
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Sell <span className="font-mono">$450 VTI</span> → Buy <span className="font-mono">$225 BND + $225 VXUS</span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              VTI drifted +6pp above band. Minimal trade to correct. One Alpaca paper order pair.
            </div>
          </div>
        </div>

        {/* Contribution steer */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(74,114,232,0.06)', border: '1px solid rgba(74,114,232,0.2)' }}
        >
          <div
            className="shrink-0 flex items-center justify-center rounded-lg"
            style={{ width: 28, height: 28, background: 'rgba(74,114,232,0.15)', color: 'var(--blue)' }}
          >
            <ArrowRight size={13} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--blue)' }}>
              Contribution Steer: Within Band
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Next <span className="font-mono">${monthlyContrib.toLocaleString()}/mo</span> → <span className="font-mono">BND 50% · SCHP 30% · USRT 20%</span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Bonds, TIPS, REITs are slightly underweight but within the band. Steer contributions toward them. No trade, no fee, no taxable event.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaxPanel() {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown size={13} style={{ color: 'var(--ruby)' }} />
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Tax-Loss Harvest Flags · Read-Only
        </div>
      </div>

      {TAX_FLAGS.map(flag => (
        <div
          key={flag.ticker}
          className="rounded-xl p-4 mb-3"
          style={{ background: 'rgba(230,69,69,0.05)', border: '1px solid rgba(230,69,69,0.2)' }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{flag.ticker}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{flag.label}</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-semibold text-sm" style={{ color: 'var(--ruby)' }}>−${flag.loss}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>harvestable loss</div>
            </div>
          </div>
          <div className="grid gap-2 text-xs" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Cost basis: </span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>${flag.costBasis}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Current value: </span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>${flag.currentValue}</span>
            </div>
          </div>
          <div
            className="mt-3 rounded-lg p-3"
            style={{ background: 'rgba(196,154,44,0.08)', border: '1px solid rgba(196,154,44,0.2)' }}
          >
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--gold-light)' }}>
              ⚠ Wash-Sale Caveat
            </div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              If you harvest this loss, do <strong>not</strong> repurchase a substantially identical security within 30 days (before or after). Consider <span className="font-mono">{flag.replacement}</span> as a non-wash-sale replacement to stay exposed.
            </div>
          </div>
        </div>
      ))}

      <div
        className="rounded-xl p-3 flex gap-2 items-start"
        style={{ background: 'rgba(74,114,232,0.08)', border: '1px solid rgba(74,114,232,0.2)' }}
      >
        <Info size={13} style={{ color: 'var(--blue)', marginTop: 1, flexShrink: 0 }} />
        <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Tax-loss harvesting is <strong>displayed only, never auto-executed</strong>. Realized losses offset capital gains and up to $3,000 of ordinary income annually (IRC §1091; IRS Pub. 550). Verify with a tax professional.
        </div>
      </div>
    </div>
  )
}

export default function RebalancePanel({ onboardResult }) {
  const profile = onboardResult?.profile ?? onboardResult ?? {}
  const monthlyContrib = profile?.monthly_savings ?? profile?.monthly_contribution ?? 600

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="p-7 space-y-5">

        {/* Header */}
        <div className="anim-fade-up">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Q2 2026 → Q3 2026 · Drift-Band Rebalance
          </div>
          <div
            className="font-display font-semibold"
            style={{ fontSize: 28, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
          >
            Fast-forwarded one quarter. Checking drift against ±5pp bands.
          </div>
        </div>

        {/* Drift bars */}
        <div className="anim-fade-up d100">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Sleeve Drift · Current vs Target (±5pp band)
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {SLEEVES.map(s => <DriftBar key={s.ticker} sleeve={s} />)}
          </div>
        </div>

        {/* Two-column: plan + tax */}
        <div className="grid gap-5 anim-fade-up d200" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <RebalancePlan />
          <TaxPanel />
        </div>

        {/* Bottom note */}
        <div
          className="rounded-2xl p-4 flex gap-3 items-start anim-fade-up d300"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <Info size={14} style={{ color: 'var(--text-muted)', marginTop: 1, flexShrink: 0 }} />
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Rebalancing policy:</strong> Drift-band (±5pp), not calendar-forced.
            Positions within band are corrected by steering the next contribution toward underweight sleeves. No trade, no transaction cost, no taxable event.
            Only band breaches trigger an actual order. This minimizes fees and tax drag versus periodic forced rebalancing.
          </div>
        </div>
      </div>
    </div>
  )
}
