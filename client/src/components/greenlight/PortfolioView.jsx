import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { ArrowRight } from 'lucide-react'
import { postQuarterlyReport } from '../../api/greenlightClient'
import {
  allocationRows,
  formatMoney,
  formatPercent,
  getCapital,
  getMonthlyContribution,
  getProfile,
  projectionRows,
} from './engineData'

const PERCENTILE_LINES = [
  { key: 'p95', label: '95th', color: '#1eb87a', width: 1.5 },
  { key: 'p75', label: '75th', color: '#22c27e', width: 1.5 },
  { key: 'p50', label: 'Median', color: '#ddb84a', width: 2.5 },
  { key: 'p25', label: '25th', color: '#4a72e8', width: 1.5 },
  { key: 'p5', label: '5th', color: '#e64545', width: 1.5 },
]

const CustomTooltipAlloc = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.label}</div>
      <div className="font-mono mt-0.5" style={{ color: d.color }}>{d.pct.toFixed(1)}% · {formatMoney(d.amount)}</div>
      <div className="font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{d.ticker}</div>
    </div>
  )
}

const CustomTooltipProjection = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)' }}>
      <div className="font-mono mb-1" style={{ color: 'var(--text-muted)' }}>{label === 0 ? 'Now' : `Year ${label}`}</div>
      {payload
        .filter(p => p.value != null)
        .map(p => (
          <div key={p.dataKey} className="font-mono" style={{ color: p.color }}>
            {PERCENTILE_LINES.find(line => line.key === p.dataKey)?.label}: {formatMoney(p.value)}
          </div>
        ))}
    </div>
  )
}

function RiskMetric({ label, value, color }) {
  return (
    <div className="text-center">
      <div
        className="font-display font-semibold"
        style={{ fontSize: 28, lineHeight: 1, letterSpacing: 0, color: color || 'var(--text-primary)' }}
      >
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

export default function PortfolioView({ onRebalance, onboardResult }) {
  const [report, setReport] = useState(() => (
    onboardResult?.portfolio ? { portfolio: onboardResult.portfolio, projection: null } : null
  ))
  const [loading, setLoading] = useState(Boolean(onboardResult))
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!onboardResult) return undefined

    let cancelled = false
    setLoading(true)
    setError(null)

    postQuarterlyReport(onboardResult)
      .then((nextReport) => {
        if (!cancelled) setReport(nextReport)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message ?? 'Portfolio data unavailable')
          if (onboardResult?.portfolio) {
            setReport({ portfolio: onboardResult.portfolio, projection: null })
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [onboardResult])

  const profile = getProfile(onboardResult)
  const clientName = profile?.name ?? profile?.first_name ?? 'You'
  const capitalOnHand = getCapital(onboardResult)
  const monthlyContrib = getMonthlyContribution(onboardResult)
  const portfolio = report?.portfolio ?? onboardResult?.portfolio
  const projection = report?.projection
  const metrics = portfolio?.metrics
  const weights = portfolio?.weights
  const riskProfile = onboardResult?.risk_profile ?? onboardResult?.optimizer_input?.risk_profile

  const allocation = useMemo(
    () => allocationRows(portfolio, capitalOnHand),
    [portfolio, capitalOnHand],
  )
  const projectionData = useMemo(() => projectionRows(projection), [projection])
  const total = allocation.reduce((sum, row) => sum + row.amount, 0)
  const riskyPct = weights?.blend_alpha != null ? weights.blend_alpha * 100 : 0
  const method = weights?.method?.replace(/_/g, '-').toUpperCase() ?? 'ENGINE'
  const gammaMid = riskProfile?.gamma_band?.mid
  const goalTarget = profile?.goal_target ?? onboardResult?.optimizer_input?.goal_target ?? 0

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="p-7 space-y-5">

        <div className="anim-fade-up">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Portfolio · {clientName} · {method}
          </div>
          <div
            className="font-display font-semibold"
            style={{ fontSize: 28, letterSpacing: 0, color: 'var(--text-primary)' }}
          >
            Engine target weights, risk metrics, and Monte Carlo projection
          </div>
          {(loading || error) && (
            <div className="text-xs mt-2" style={{ color: error ? 'var(--ruby)' : 'var(--text-muted)' }}>
              {error ?? 'Refreshing engine projection...'}
            </div>
          )}
        </div>

        <div
          className="rounded-2xl p-5 grid gap-6 anim-fade-up d100"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            gridTemplateColumns: 'repeat(5, 1fr)',
          }}
        >
          <RiskMetric label="Target Volatility" value={metrics ? formatPercent(metrics.expected_vol) : '--'} color="var(--gold-light)" />
          <RiskMetric label="Expected Shortfall (95%)" value={metrics ? `-${formatPercent(metrics.expected_shortfall_95)}` : '--'} color="var(--ruby)" />
          <RiskMetric label="Success Probability" value={projection ? formatPercent(projection.p_success) : '--'} color="var(--emerald)" />
          <RiskMetric label="Risk Aversion γ" value={gammaMid != null ? gammaMid.toFixed(1) : '--'} />
          <RiskMetric label="Capital Deployed" value={formatMoney(total)} color="var(--emerald)" />
        </div>

        <div className="grid gap-5 anim-fade-up d150" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Target Allocation
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
                      <Cell key={a.ticker} fill={a.color} />
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
                  {riskyPct.toFixed(0)}%
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>risky sleeve</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {allocation.map(a => (
                <div key={a.ticker} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{a.label}</span>
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{a.pct.toFixed(1)}%</span>
                  <span className="font-mono" style={{ color: 'var(--emerald)', fontSize: 10 }}>{a.ticker}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Order Plan · Paper Portfolio
              </div>
              <div
                className="text-xs px-2 py-1 rounded-lg font-mono"
                style={{ background: 'rgba(30,184,122,0.1)', color: 'var(--emerald)', border: '1px solid rgba(30,184,122,0.2)' }}
              >
                {weights?.method ?? 'pending'}
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
                    <td className="py-2.5 font-mono" style={{ color: a.color }}>{a.pct.toFixed(1)}%</td>
                    <td className="py-2.5 font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatMoney(a.amount)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(30,184,122,0.1)', color: 'var(--emerald)' }}
                      >
                        ready
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Total deployed</td>
                  <td className="pt-3 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoney(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <div
              className="mt-4 rounded-xl p-3 text-xs"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              <strong style={{ color: 'var(--text-secondary)' }}>Contribution schedule:</strong>{' '}
              {monthlyContrib > 0
                ? `+${formatMoney(monthlyContrib)}/mo steered toward underweight sleeves.`
                : 'Future contributions will be steered toward underweight sleeves.'}
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl p-5 anim-fade-up d200"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                Monte Carlo Projection · {projection?.generator?.replace(/_/g, ' ') ?? 'pending'}
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Median terminal wealth {projection ? formatMoney(projection.median_terminal) : '--'} · Bad-case terminal {projection ? formatMoney(projection.bad_case_terminal) : '--'}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
              {PERCENTILE_LINES.filter(line => ['p50', 'p5', 'p95'].includes(line.key)).map(line => (
                <div key={line.key} className="flex items-center gap-1.5">
                  <div className="w-3 h-px" style={{ background: line.color, display: 'inline-block' }} /> {line.label}
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 220 }}>
            {projectionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projectionData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => v === 0 ? 'Now' : `Y${v}`}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontFamily: 'DM Mono', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => formatMoney(v, true)}
                    width={52}
                  />
                  <Tooltip content={<CustomTooltipProjection />} />
                  {goalTarget > 0 && (
                    <ReferenceLine
                      y={goalTarget} stroke="rgba(30,184,122,0.5)" strokeDasharray="4 4"
                      label={{ value: 'Goal', position: 'top', fill: 'var(--emerald)', fontSize: 10, fontFamily: 'DM Mono' }}
                    />
                  )}
                  {PERCENTILE_LINES.map(line => (
                    <Line
                      key={line.key}
                      type="monotone"
                      dataKey={line.key}
                      stroke={line.color}
                      strokeWidth={line.width}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Projection will appear after the engine returns percentile paths.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end anim-fade-up d300">
          <button
            onClick={onRebalance}
            disabled={!portfolio}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-bright)',
              color: portfolio ? 'var(--text-primary)' : 'var(--text-muted)',
              opacity: portfolio ? 1 : 0.6,
            }}
            onMouseEnter={e => {
              if (!portfolio) return
              e.currentTarget.style.borderColor = 'var(--gold-light)'
              e.currentTarget.style.color = 'var(--gold-light)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-bright)'
              e.currentTarget.style.color = portfolio ? 'var(--text-primary)' : 'var(--text-muted)'
            }}
          >
            Fast-forward a quarter → rebalance
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
