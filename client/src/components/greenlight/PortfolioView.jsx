import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import RebalancePanel from './RebalancePanel'
import { SLEEVE_ORDER, sleeveColor, sleeveLabel, tickerSleeveMap } from './engineData'

const formatCurrency = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 'N/A'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num)
}

const formatPercent = (value, digits = 1) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 'N/A'
  return `${(num * 100).toFixed(digits)}%`
}

const CustomTooltipAlloc = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.label}</div>
      <div className="font-mono mt-0.5" style={{ color: d.color }}>
        {d.pct.toFixed(1)}%{d.amount != null ? ` · ${formatCurrency(d.amount)}` : ''}
      </div>
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

function portfolioFromResult(onboardResult) {
  return onboardResult?.portfolio ?? null
}

function profileFromResult(onboardResult) {
  return onboardResult?.validated_profile ?? onboardResult?.profile ?? onboardResult ?? {}
}

function numberOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export default function PortfolioView({ onRebalance, onboardResult }) {
  const [showRebalance, setShowRebalance] = useState(false)
  const [fetchedPortfolio, setFetchedPortfolio] = useState(null)
  const [loadingPortfolio, setLoadingPortfolio] = useState(false)
  const [portfolioError, setPortfolioError] = useState(null)

  const profile = profileFromResult(onboardResult)
  const optimizerInput = onboardResult?.optimizer_input ?? {}
  const snapshot = onboardResult?.financial_analysis?.snapshot ?? {}
  const clientName = profile?.name ?? profile?.first_name ?? 'You'
  const capitalOnHand = numberOrNull(profile?.capital_on_hand ?? optimizerInput.capital_on_hand)
  const monthlyContrib = numberOrNull(snapshot.monthly_surplus ?? optimizerInput.monthly_surplus ?? profile?.monthly_contribution)
  const portfolio = portfolioFromResult(onboardResult) ?? fetchedPortfolio
  const weights = portfolio?.weights ?? {}
  const metrics = portfolio?.metrics ?? {}

  useEffect(() => {
    let cancelled = false

    if (portfolioFromResult(onboardResult)) {
      setFetchedPortfolio(null)
      setPortfolioError(null)
      setLoadingPortfolio(false)
      return () => { cancelled = true }
    }

    setLoadingPortfolio(true)
    setPortfolioError(null)
    import('../../api/greenlightClient')
      .then((client) => {
        const postPortfolio = client.postPortfolio
        if (typeof postPortfolio !== 'function') {
          throw new Error('Portfolio endpoint wrapper is not available.')
        }
        return postPortfolio(profile)
      })
      .then((response) => {
        if (!cancelled) setFetchedPortfolio(response)
      })
      .catch((error) => {
        if (!cancelled) setPortfolioError(error?.message ?? 'Portfolio could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setLoadingPortfolio(false)
      })

    return () => { cancelled = true }
  }, [onboardResult])

  const sleeveAllocation = useMemo(() => (
    SLEEVE_ORDER
      .map((sleeve) => {
        const weight = Number(weights.by_sleeve?.[sleeve])
        if (!Number.isFinite(weight) || weight <= 0) return null
        return {
          sleeve,
          label: sleeveLabel(sleeve),
          pct: weight * 100,
          amount: capitalOnHand != null ? Math.round(capitalOnHand * weight) : null,
          color: sleeveColor(sleeve),
        }
      })
      .filter(Boolean)
  ), [weights.by_sleeve, capitalOnHand])

  const tickerRows = useMemo(() => {
    const sleeveMap = tickerSleeveMap(portfolio?.universe)
    return Object.entries(weights.by_ticker ?? {})
      .map(([ticker, weight]) => {
        const numWeight = Number(weight)
        if (!Number.isFinite(numWeight) || numWeight <= 0) return null
        const sleeve = sleeveMap[ticker]
        return {
          ticker,
          sleeve,
          label: sleeveLabel(sleeve),
          pct: numWeight * 100,
          amount: capitalOnHand != null ? Math.round(capitalOnHand * numWeight) : null,
          color: sleeveColor(sleeve),
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const sleeveOrder = SLEEVE_ORDER.indexOf(a.sleeve) - SLEEVE_ORDER.indexOf(b.sleeve)
        return sleeveOrder || a.ticker.localeCompare(b.ticker)
      })
  }, [portfolio?.universe, weights.by_ticker, capitalOnHand])

  const riskContributions = useMemo(() => (
    SLEEVE_ORDER
      .map((sleeve) => {
        const contribution = Number(metrics.risk_contributions?.[sleeve])
        if (!Number.isFinite(contribution)) return null
        return {
          sleeve,
          label: sleeveLabel(sleeve),
          value: contribution,
          color: sleeveColor(sleeve),
        }
      })
      .filter(Boolean)
  ), [metrics.risk_contributions])

  const method = portfolio?.method ?? weights.method
  const blendAlpha = portfolio?.blend_alpha ?? weights.blend_alpha
  const equityPct = sleeveAllocation
    .filter(a => a.sleeve === 'us_equity' || a.sleeve === 'intl_equity' || a.sleeve === 'reits')
    .reduce((sum, a) => sum + a.pct, 0)

  if (showRebalance) return <RebalancePanel onboardResult={{ ...onboardResult, portfolio }} />

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="p-7 space-y-5">
        <div className="anim-fade-up">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Portfolio · {clientName} · ESG-screened
          </div>
          <div
            className="font-display font-semibold"
            style={{ fontSize: 28, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
          >
            Target allocation from optimizer weights
          </div>
        </div>

        {!portfolio && (
          <div
            className="rounded-2xl p-6 anim-fade-up d100"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {loadingPortfolio ? 'Building portfolio...' : 'Portfolio unavailable'}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              {portfolioError ?? 'The portfolio will appear here after the greenlight gate returns target weights.'}
            </p>
          </div>
        )}

        {portfolio && (
          <>
            <div
              className="rounded-2xl p-5 grid gap-6 anim-fade-up d100"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                gridTemplateColumns: 'repeat(5, 1fr)',
              }}
            >
              <RiskMetric label="Expected Volatility" value={formatPercent(metrics.expected_vol)} color="var(--gold-light)" />
              <RiskMetric label="Expected Shortfall 95" value={formatPercent(metrics.expected_shortfall_95)} color="var(--ruby)" />
              <RiskMetric label="Method" value={method ?? 'N/A'} />
              <RiskMetric label="Blend α" value={blendAlpha != null ? Number(blendAlpha).toFixed(2) : 'N/A'} color="var(--blue)" />
              <RiskMetric label="Capital Available" value={capitalOnHand != null ? formatCurrency(capitalOnHand) : 'N/A'} color="var(--emerald)" />
            </div>

            <div className="grid gap-5 anim-fade-up d150" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
              <div
                className="rounded-2xl p-5"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              >
                <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                  Allocation By Sleeve
                </div>
                <div style={{ position: 'relative', height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sleeveAllocation}
                        dataKey="pct"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {sleeveAllocation.map((a) => (
                          <Cell key={a.sleeve} fill={a.color} />
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
                      {equityPct.toFixed(0)}%
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>equity</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {sleeveAllocation.map(a => (
                    <div key={a.sleeve} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
                      <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{a.label}</span>
                      <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{a.pct.toFixed(1)}%</span>
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
                    Ticker Breakdown
                  </div>
                  <div
                    className="text-xs px-2 py-1 rounded-lg font-mono"
                    style={{ background: 'rgba(30,184,122,0.1)', color: 'var(--emerald)', border: '1px solid rgba(30,184,122,0.2)' }}
                  >
                    {method ?? 'optimizer'}
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Ticker', 'Sleeve', 'Weight', 'Amount'].map(h => (
                        <th key={h} className="text-left pb-2 font-semibold uppercase"
                          style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tickerRows.map(a => (
                      <tr key={a.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="py-2.5 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{a.ticker}</td>
                        <td className="py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{a.label}</td>
                        <td className="py-2.5 font-mono" style={{ color: a.color }}>{a.pct.toFixed(1)}%</td>
                        <td className="py-2.5 font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                          {a.amount != null ? formatCurrency(a.amount) : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="pt-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Capital available</td>
                      <td className="pt-3 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{capitalOnHand != null ? formatCurrency(capitalOnHand) : 'N/A'}</td>
                    </tr>
                  </tfoot>
                </table>
                <div
                  className="mt-4 rounded-xl p-3 text-xs"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                >
                  <strong style={{ color: 'var(--text-secondary)' }}>Contribution capacity:</strong>{' '}
                  {monthlyContrib != null && monthlyContrib > 0
                    ? `+${formatCurrency(monthlyContrib)}/mo from analyzed monthly surplus.`
                    : 'No positive monthly surplus was returned for DCA sizing.'}
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
                    Risk Contributions
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Sleeve contribution to portfolio risk from the optimizer metrics.
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {riskContributions.map((item) => (
                  <div key={item.sleeve}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span className="font-mono" style={{ color: item.color }}>{formatPercent(item.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, item.value * 100))}%`, background: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end anim-fade-up d300">
          <button
            onClick={onRebalance ?? (() => setShowRebalance(true))}
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
              if (!portfolio) return
              e.currentTarget.style.borderColor = 'var(--border-bright)'
              e.currentTarget.style.color = 'var(--text-primary)'
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
