/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { ArrowRight, Bot, CheckCircle, MessageCircle, SlidersHorizontal, X } from 'lucide-react'
import IntakeChat from './IntakeChat'
import PortfolioEditor from './PortfolioEditor'
import RebalancePanel from './RebalancePanel'
import {
  estimatePortfolioMetrics,
  formatMoney,
  formatPercent,
  getCapital,
  getMonthlyContribution,
  getPortfolio,
  getProfile,
  getSleeveWeights,
  inferRiskDialFromWeights,
  weightsToAllocation,
} from './engineData'

const GLIDEPATH = Array.from({ length: 38 }, (_, i) => {
  const age = 28 + i
  const yearsToRetire = 65 - age
  let equity
  if (yearsToRetire > 15) equity = 80 - (i * 0.3)
  else if (yearsToRetire > 5) equity = 75 - ((15 - yearsToRetire) * 3.5)
  else equity = 55 + (5 - yearsToRetire) * 2
  const clipped = Math.round(Math.max(40, Math.min(80, equity)))
  return { age, equity: clipped, bonds: 100 - clipped }
})

function formatMetricPct(decimalValue, pctValue, digits = 1) {
  if (decimalValue != null) return formatPercent(decimalValue, digits)
  if (pctValue != null && Number.isFinite(Number(pctValue))) return `${Number(pctValue).toFixed(digits)}%`
  return 'N/A'
}

const CustomTooltipAlloc = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.label}</div>
      <div className="font-mono mt-0.5" style={{ color: d.color }}>{d.pct.toFixed(1)}%{d.amount != null ? ` · ${formatMoney(d.amount)}` : ''}</div>
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
        style={{ fontSize: 28, lineHeight: 1, color: color || 'var(--text-primary)' }}
      >
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function GuideOverlay({ onClose, onComplete }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Greenlight guided portfolio update"
    >
      <div className="card-premium" style={{ width: 'min(1120px, 100%)', height: 'min(760px, 92vh)', overflow: 'hidden', position: 'relative' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guided update"
          className="flex items-center justify-center rounded-lg"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 2,
            width: 34,
            height: 34,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-bright)',
            color: 'var(--text-secondary)',
          }}
        >
          <X size={16} />
        </button>
        <IntakeChat onComplete={onComplete} />
      </div>
    </div>
  )
}

export default function PortfolioView({ onRebalance, onboardResult, onApplied }) {
  const [showRebalance, setShowRebalance] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [localResult, setLocalResult] = useState(onboardResult)

  useEffect(() => {
    setLocalResult(onboardResult)
  }, [onboardResult])

  const activeResult = localResult ?? onboardResult
  const profile = getProfile(activeResult)
  const portfolio = getPortfolio(activeResult)
  const weights = useMemo(() => getSleeveWeights(activeResult), [activeResult])
  const riskDial = inferRiskDialFromWeights(weights)
  const estimatedMetrics = estimatePortfolioMetrics(weights, riskDial)
  const metrics = portfolio?.metrics ?? estimatedMetrics
  const risk = activeResult?.financial_analysis?.risk ?? activeResult?.risk_profile ?? {}
  const snapshot = activeResult?.financial_analysis?.snapshot ?? {}
  const clientName = profile?.name ?? profile?.first_name ?? 'You'
  const capitalOnHand = getCapital(activeResult)
  const capital = Number.isFinite(capitalOnHand) && capitalOnHand > 0 ? capitalOnHand : null
  const monthlyContrib = getMonthlyContribution(activeResult) || Number(snapshot.monthly_surplus ?? activeResult?.optimizer_input?.monthly_surplus) || null
  const userAge = Number.isFinite(Number(profile?.age)) ? Number(profile.age) : null
  const horizonYears = Number.isFinite(Number(profile?.horizon_years)) ? Number(profile.horizon_years) : null
  const allocation = weightsToAllocation(weights, portfolio, capital)
  const realPortfolioPresent = Boolean(activeResult?.portfolio)
  const fallbackPresent = Boolean(portfolio) && !realPortfolioPresent
  const methodLabel = portfolio?.weights?.method
    ?? (portfolio?.weights?.blend_alpha != null ? 'blend' : realPortfolioPresent ? 'engine' : 'target')
  const growthPct = allocation
    .filter(a => ['us_equity', 'intl_equity', 'reits'].includes(a.key))
    .reduce((sum, a) => sum + a.pct, 0)

  const chartStartAge = userAge ?? 28
  const glidepathData = GLIDEPATH.map(p => ({
    ...p,
    age: p.age - 28 + chartStartAge,
  }))

  function handleGuideComplete(newResult) {
    setShowGuide(false)
    if (newResult) {
      setLocalResult(newResult)
      onApplied?.(newResult)
    }
    setShowEditor(true)
  }

  function handleEditorApplied(updatedResult) {
    setLocalResult(updatedResult)
    onApplied?.(updatedResult)
  }

  if (showRebalance) return <RebalancePanel onboardResult={activeResult} />

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      {showGuide && (
        <GuideOverlay
          onClose={() => setShowGuide(false)}
          onComplete={handleGuideComplete}
        />
      )}

      <div className="p-7 space-y-5">
        <div className="anim-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                Portfolio · {clientName} · Greenlight target
              </div>
              <div
                className="font-display font-semibold"
                style={{ fontSize: 28, color: 'var(--text-primary)' }}
              >
                {realPortfolioPresent
                  ? 'Engine-built allocation from your profile'
                  : fallbackPresent
                  ? 'Saved target allocation from demo data'
                  : 'Preview allocation ready for editing'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowEditor(prev => !prev)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-bright)',
                  color: 'var(--text-primary)',
                }}
              >
                <SlidersHorizontal size={16} />
                Edit allocations
              </button>
              <button
                type="button"
                onClick={() => setShowGuide(true)}
                className="flex items-center gap-3 px-6 py-4 rounded-xl text-base font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, var(--green, var(--emerald)), var(--green-bright))',
                  border: '1px solid var(--green-light, var(--green))',
                  color: '#07120d',
                  boxShadow: '0 18px 42px rgba(30,184,122,0.28)',
                }}
              >
                <MessageCircle size={20} />
                Update with Greenlight
              </button>
            </div>
          </div>
        </div>

        <div
          className="card-premium p-5 anim-fade-up d100"
          style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))' }}
        >
          <RiskMetric label="Expected Volatility" value={formatMetricPct(portfolio?.metrics?.expected_vol, risk.target_volatility_pct ?? metrics?.expected_vol * 100)} color="var(--green-bright, var(--green))" />
          <RiskMetric label="Est. 1Y Max Loss" value={formatMetricPct(portfolio?.metrics?.expected_shortfall_95, risk.estimated_max_loss_1yr_pct ?? metrics?.expected_shortfall_95 * 100)} color="var(--ruby)" />
          <RiskMetric label="Risk Dial" value={`${Math.round(riskDial * 100)}%`} color="var(--green, var(--emerald))" />
          <RiskMetric label="Method" value={methodLabel} color="var(--blue)" />
          <RiskMetric label="Capital Available" value={capital != null ? formatMoney(capital) : 'N/A'} color="var(--green, var(--emerald))" />
        </div>

        {showEditor && (
          <PortfolioEditor
            onboardResult={activeResult}
            onApplied={handleEditorApplied}
          />
        )}

        <div className="grid gap-5 anim-fade-up d150" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
          <div className="card-premium p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Target Sleeve Allocation
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: realPortfolioPresent ? 'var(--green)' : 'var(--gold-light)' }}>
                <CheckCircle size={13} />
                {realPortfolioPresent ? 'engine' : 'fallback'}
              </div>
            </div>
            <div style={{ position: 'relative', height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="pct"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {allocation.map((a) => (
                      <Cell key={a.key} fill={a.color} />
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
                  {growthPct.toFixed(0)}%
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>growth</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {allocation.map(a => (
                <div key={a.key} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{a.label}</span>
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{a.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-premium p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Target Order Plan
              </div>
              <div
                className="text-xs px-2 py-1 rounded-lg font-mono"
                style={{ background: 'var(--green-soft)', color: 'var(--green-bright, var(--green))', border: '1px solid var(--green, var(--emerald))' }}
              >
                Sleeve target
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Ticker', 'Sleeve', 'Weight', 'Amount', 'Source'].map(h => (
                    <th key={h} className="text-left pb-2 font-semibold uppercase"
                      style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocation.map(a => (
                  <tr key={a.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2.5 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{a.ticker ?? a.key}</td>
                    <td className="py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{a.label}</td>
                    <td className="py-2.5 font-mono" style={{ color: a.color }}>{a.pct.toFixed(1)}%</td>
                    <td className="py-2.5 font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                      {a.amount != null ? formatMoney(a.amount) : 'N/A'}
                    </td>
                    <td className="py-2.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--green-soft)', color: 'var(--green-bright, var(--green))' }}
                      >
                        {realPortfolioPresent ? 'engine' : 'preview'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Capital available</td>
                  <td className="pt-3 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{capital != null ? formatMoney(capital) : 'N/A'}</td>
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
                ? `+${formatMoney(monthlyContrib)}/mo from analyzed monthly surplus.`
                : 'No positive monthly surplus was returned for DCA sizing.'}
            </div>
          </div>
        </div>

        <div className="card-premium p-5 anim-fade-up d200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                Age Glidepath · U-Shaped Bond Tent
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Planning path starting from {userAge != null ? `age ${userAge}` : 'the default chart age'}{horizonYears != null ? ` with a ${horizonYears}-year horizon` : ''}.
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-px" style={{ background: 'var(--green-bright, var(--green))', display: 'inline-block' }} /> Growth
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-px" style={{ background: '#4a72e8', display: 'inline-block' }} /> Defensive
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
                  x={chartStartAge} stroke="rgba(30,184,122,0.5)" strokeDasharray="4 4"
                  label={{ value: 'Now', position: 'top', fill: 'var(--green)', fontSize: 10, fontFamily: 'DM Mono' }}
                />
                <ReferenceLine
                  x={chartStartAge + (horizonYears ?? 37)} stroke="rgba(196,154,44,0.5)" strokeDasharray="4 4"
                  label={{ value: 'Goal', position: 'top', fill: 'var(--gold-light)', fontSize: 10, fontFamily: 'DM Mono' }}
                />
                <Line type="monotone" dataKey="equity" stroke="var(--green-bright, var(--green))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="bonds" stroke="#4a72e8" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex justify-between items-center gap-3 anim-fade-up d300">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Bot size={14} style={{ color: 'var(--green)' }} />
            Greenlight can re-interview you, rebuild the target, then open the slider editor.
          </div>
          <button
            onClick={onRebalance ?? (() => setShowRebalance(true))}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)',
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
