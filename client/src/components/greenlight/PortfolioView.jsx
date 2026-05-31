import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import RebalancePanel from './RebalancePanel'

const ILLUSTRATIVE_ALLOCATION = [
  { label: 'US Equity',   pct: 38, color: '#ddb84a', ticker: 'VTI',  esg: true },
  { label: 'Intl Equity', pct: 20, color: '#4a72e8', ticker: 'VXUS', esg: true },
  { label: 'Bonds',       pct: 18, color: '#6b7280', ticker: 'BND',  esg: false },
  { label: 'TIPS',        pct: 8,  color: '#22c27e', ticker: 'SCHP', esg: false },
  { label: 'Gold',        pct: 8,  color: '#f0c060', ticker: 'GLDM', esg: true },
  { label: 'REITs',       pct: 8,  color: '#8b5cf6', ticker: 'USRT', esg: false },
]

const GLIDEPATH = Array.from({ length: 38 }, (_, i) => {
  const age = 28 + i
  const yearsToRetire = 65 - age
  // U-shape near retirement (bond tent)
  let equity
  if (yearsToRetire > 15) equity = 80 - (i * 0.3)
  else if (yearsToRetire > 5) equity = 75 - ((15 - yearsToRetire) * 3.5)
  else equity = 55 + (5 - yearsToRetire) * 2
  return { age, equity: Math.round(Math.max(40, Math.min(80, equity))), bonds: 100 - Math.round(Math.max(40, Math.min(80, equity))) }
})

const CustomTooltipAlloc = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.label}</div>
      <div className="font-mono mt-0.5" style={{ color: d.color }}>{d.pct}%{d.amount != null ? ` · $${d.amount.toLocaleString()}` : ''}</div>
    </div>
  )
}

const CustomTooltipGlide = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)' }}>
      <div className="font-mono mb-1" style={{ color: 'var(--text-muted)' }}>Age {label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="font-mono" style={{ color: p.color }}>{p.dataKey}: {p.value}%</div>
      ))}
    </div>
  )
}

function RiskMetric({ label, value, color }) {
  return (
    <div className="text-center">
      <div
        className="font-display font-semibold"
        style={{ fontSize: 28, lineHeight: 1, letterSpacing: '-0.03em', color: color || 'var(--text-primary)' }}
      >
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

export default function PortfolioView({ onRebalance, onboardResult }) {
  const [showRebalance, setShowRebalance] = useState(false)
  const profile = onboardResult?.validated_profile ?? onboardResult?.profile ?? onboardResult ?? {}
  const risk = onboardResult?.financial_analysis?.risk ?? onboardResult?.risk_profile ?? {}
  const snapshot = onboardResult?.financial_analysis?.snapshot ?? {}
  const clientName = profile?.name ?? profile?.first_name ?? 'You'
  const capitalOnHand = Number.isFinite(Number(profile?.capital_on_hand)) ? Number(profile.capital_on_hand) : null
  const monthlyContrib = Number.isFinite(Number(snapshot.monthly_surplus ?? onboardResult?.optimizer_input?.monthly_surplus))
    ? Number(snapshot.monthly_surplus ?? onboardResult?.optimizer_input?.monthly_surplus)
    : null
  const userAge = Number.isFinite(Number(profile?.age)) ? Number(profile.age) : null
  const horizonYears = Number.isFinite(Number(profile?.horizon_years)) ? Number(profile.horizon_years) : null

  const allocation = ILLUSTRATIVE_ALLOCATION.map(a => ({
    ...a,
    amount: capitalOnHand != null ? Math.round(capitalOnHand * (a.pct / 100)) : null,
  }))

  const total = capitalOnHand

  const chartStartAge = userAge ?? 28
  const glidepathData = GLIDEPATH.map(p => ({
    ...p,
    age: p.age - 28 + chartStartAge,
  }))

  if (showRebalance) return <RebalancePanel onboardResult={onboardResult} />

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="p-7 space-y-5">

        {/* Header */}
        <div className="anim-fade-up">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Portfolio · {clientName} · ESG-screened
          </div>
          <div
            className="font-display font-semibold"
            style={{ fontSize: 28, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
          >
            Illustrative allocation view · optimizer target weights not returned
          </div>
        </div>

        {/* Risk metrics row */}
        <div
          className="rounded-2xl p-5 grid gap-6 anim-fade-up d100"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            gridTemplateColumns: 'repeat(5, 1fr)',
          }}
        >
          <RiskMetric label="Target Volatility" value={risk.target_volatility_pct != null ? `${Number(risk.target_volatility_pct).toFixed(1)}%` : 'N/A'} color="var(--gold-light)" />
          <RiskMetric label="Est. 1Y Max Loss" value={risk.estimated_max_loss_1yr_pct != null ? `${Number(risk.estimated_max_loss_1yr_pct).toFixed(1)}%` : 'N/A'} color="var(--ruby)" />
          <RiskMetric label="Risk Aversion γ" value={risk.gamma_mid != null ? Number(risk.gamma_mid).toFixed(2) : 'N/A'} />
          <RiskMetric label="Binding Axis" value={risk.binding_axis ?? 'N/A'} color="var(--blue)" />
          <RiskMetric label="Capital Available" value={total != null ? `$${total.toLocaleString()}` : 'N/A'} color="var(--emerald)" />
        </div>

        {/* Allocation + Order plan */}
        <div className="grid gap-5 anim-fade-up d150" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
          {/* Donut */}
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Illustrative Allocation Example
            </div>
            <div style={{ position: 'relative', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="pct"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {allocation.map((a) => (
                      <Cell key={a.label} fill={a.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltipAlloc />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center', pointerEvents: 'none',
              }}>
                <div className="font-display font-semibold" style={{ fontSize: 22, color: 'var(--text-primary)' }}>
                  {allocation.filter(a => a.label.includes('Equity') || a.label === 'REITs').reduce((s, a) => s + a.pct, 0)}%
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>equity</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {allocation.map(a => (
                <div key={a.label} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{a.label}</span>
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{a.pct}%</span>
                  {a.esg && <span style={{ color: 'var(--emerald)', fontSize: 10 }}>ESG</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Order plan */}
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Illustrative Order Plan
              </div>
              <div
                className="text-xs px-2 py-1 rounded-lg font-mono"
                style={{ background: 'rgba(30,184,122,0.1)', color: 'var(--emerald)', border: '1px solid rgba(30,184,122,0.2)' }}
              >
                Lump-sum + DCA
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Ticker', 'Sleeve', 'Weight', 'Amount', 'Status'].map(h => (
                    <th key={h} className="text-left pb-2 font-semibold uppercase"
                      style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocation.map(a => (
                  <tr key={a.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2.5 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{a.ticker}</td>
                    <td className="py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{a.label}</td>
                    <td className="py-2.5 font-mono" style={{ color: a.color }}>{a.pct}%</td>
                    <td className="py-2.5 font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                      {a.amount != null ? `$${a.amount.toLocaleString()}` : 'N/A'}
                    </td>
                    <td className="py-2.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(30,184,122,0.1)', color: 'var(--emerald)' }}
                      >
                        example
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Capital available</td>
                  <td className="pt-3 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{total != null ? `$${total.toLocaleString()}` : 'N/A'}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <div
              className="mt-4 rounded-xl p-3 text-xs"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              <strong style={{ color: 'var(--text-secondary)' }}>Contribution capacity:</strong>{' '}
              {monthlyContrib != null && monthlyContrib > 0
                ? `+$${monthlyContrib.toLocaleString()}/mo from analyzed monthly surplus.`
                : 'No positive monthly surplus was returned for DCA sizing.'}
            </div>
          </div>
        </div>

        {/* Glidepath chart */}
        <div
          className="rounded-2xl p-5 anim-fade-up d200"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                Age Glidepath · U-Shaped Bond Tent
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Illustrative equity glidepath starting from {userAge != null ? `age ${userAge}` : 'the default chart age'}{horizonYears != null ? ` with a ${horizonYears}-year horizon` : ''}.
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-px" style={{ background: 'var(--gold-light)', display: 'inline-block' }} /> Equity
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-px" style={{ background: '#4a72e8', display: 'inline-block' }} /> Bonds + Defensive
              </div>
            </div>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={glidepathData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="age"
                  tick={{ fill: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v % 5 === 0 ? v : ''}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  domain={[30, 85]}
                  tickFormatter={v => `${v}%`}
                  width={40}
                />
                <Tooltip content={<CustomTooltipGlide />} />
                <ReferenceLine
                  x={chartStartAge} stroke="rgba(196,154,44,0.5)" strokeDasharray="4 4"
                  label={{ value: 'Now', position: 'top', fill: 'var(--gold-light)', fontSize: 10, fontFamily: 'DM Mono' }}
                />
                <ReferenceLine
                  x={chartStartAge + (horizonYears ?? 37)} stroke="rgba(30,184,122,0.5)" strokeDasharray="4 4"
                  label={{ value: 'Retire', position: 'top', fill: 'var(--emerald)', fontSize: 10, fontFamily: 'DM Mono' }}
                />
                <Line type="monotone" dataKey="equity" stroke="var(--gold-light)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="bonds" stroke="#4a72e8" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Next step */}
        <div className="flex justify-end anim-fade-up d300">
          <button
            onClick={onRebalance ?? (() => setShowRebalance(true))}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-light)'; e.currentTarget.style.color = 'var(--gold-light)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          >
            Fast-forward a quarter → rebalance
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
