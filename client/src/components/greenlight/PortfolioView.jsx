/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowRight, Bot, CheckCircle, MessageCircle, SlidersHorizontal, X } from 'lucide-react'
import IntakeChat from './IntakeChat'
import PortfolioEditor from './PortfolioEditor'
import { postPortfolio } from '../../api/greenlightClient'
import { CountUpNumber, PortfolioRevealStyles, RevealItem, usePrefersReducedMotion } from './PortfolioReveal'
import RebalancePanel from './RebalancePanel'
import { useTour } from '../tour/TourProvider'
import {
  SLEEVE_ORDER,
  formatMoney,
  formatPercent,
  getCapital,
  getMonthlyContribution,
  getPortfolio,
  getProfile,
  getSleeveWeights,
  inferRiskDialFromWeights,
  sleeveColor,
  sleeveLabel,
  tickerSleeveMap,
  weightsToAllocation,
} from './engineData'

function formatMetricPct(decimalValue, pctValue, digits = 1) {
  if (decimalValue != null && Number.isFinite(Number(decimalValue))) return formatPercent(decimalValue, digits)
  if (pctValue != null && Number.isFinite(Number(pctValue))) return `${Number(pctValue).toFixed(digits)}%`
  return 'N/A'
}

function numberOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function metricCountConfig(decimalValue, pctValue, digits = 1) {
  const decimalNumber = numberOrNull(decimalValue)
  if (decimalNumber != null) {
    return {
      value: decimalNumber,
      format: v => formatPercent(v, digits),
    }
  }

  const pctNumber = numberOrNull(pctValue)
  if (pctNumber != null) {
    return {
      value: pctNumber,
      format: v => `${Number(v).toFixed(digits)}%`,
    }
  }

  return null
}

function portfolioFromResponse(response) {
  return response?.portfolio ?? response ?? null
}

const CustomTooltipAlloc = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.label}</div>
      <div className="font-mono mt-0.5" style={{ color: d.color }}>
        {d.pct.toFixed(1)}%{d.amount != null ? ` · ${formatMoney(d.amount)}` : ''}
      </div>
    </div>
  )
}

function RiskMetric({ label, value, color, countConfig, reducedMotion, delay = 0 }) {
  return (
    <div className="text-center">
      <div
        className="font-display font-semibold"
        style={{ fontSize: 28, lineHeight: 1, color: color || 'var(--text-primary)' }}
      >
        {countConfig ? (
          <CountUpNumber
            value={countConfig.value}
            format={countConfig.format}
            delay={delay}
            reducedMotion={reducedMotion}
          />
        ) : value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function GuideOverlay({ onClose, onComplete, userEmail }) {
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
        <IntakeChat onComplete={onComplete} userEmail={userEmail} />
      </div>
    </div>
  )
}

export default function PortfolioView({ onRebalance, onboardResult, onApplied, userEmail }) {
  const reducedMotion = usePrefersReducedMotion()
  const { isActive: tourActive } = useTour()
  const [showRebalance, setShowRebalance] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [localResult, setLocalResult] = useState(onboardResult)
  const [fetchedPortfolio, setFetchedPortfolio] = useState(null)
  const [loadingPortfolio, setLoadingPortfolio] = useState(false)
  const [portfolioError, setPortfolioError] = useState(null)

  useEffect(() => {
    setLocalResult(onboardResult)
  }, [onboardResult])

  useEffect(() => {
    if (tourActive) setShowEditor(true)
  }, [tourActive])

  const baseResult = localResult ?? onboardResult
  const profile = useMemo(() => getProfile(baseResult), [baseResult])
  const resultPortfolio = getPortfolio(baseResult)
  const portfolio = resultPortfolio ?? fetchedPortfolio
  const activeResult = useMemo(() => (
    portfolio && portfolio !== resultPortfolio
      ? { ...(baseResult ?? {}), portfolio }
      : baseResult
  ), [baseResult, portfolio, resultPortfolio])
  const optimizerInput = activeResult?.optimizer_input ?? {}
  const snapshot = activeResult?.financial_analysis?.snapshot ?? {}
  const risk = activeResult?.financial_analysis?.risk ?? activeResult?.risk_profile ?? {}
  const clientName = profile?.name ?? profile?.first_name ?? 'You'
  const capitalOnHand = getCapital(activeResult)
  const capital = Number.isFinite(capitalOnHand) && capitalOnHand > 0
    ? capitalOnHand
    : numberOrNull(profile?.capital_on_hand ?? optimizerInput.capital_on_hand)
  const monthlyContrib = getMonthlyContribution(activeResult)
    || numberOrNull(snapshot.monthly_surplus ?? optimizerInput.monthly_surplus ?? profile?.monthly_contribution)
  const horizonYears = Number.isFinite(Number(profile?.horizon_years)) ? Number(profile.horizon_years) : null
  const weights = useMemo(() => getSleeveWeights(activeResult), [activeResult])
  const riskDial = inferRiskDialFromWeights(weights)
  const metrics = portfolio?.metrics ?? null
  const allocation = useMemo(() => (
    portfolio ? weightsToAllocation(weights, portfolio, capital) : []
  ), [capital, portfolio, weights])
  const realPortfolioPresent = Boolean(resultPortfolio)
  const fetchedPortfolioPresent = Boolean(!resultPortfolio && fetchedPortfolio)
  const method = portfolio?.method ?? portfolio?.weights?.method
  const blendAlpha = portfolio?.blend_alpha ?? portfolio?.weights?.blend_alpha
  const methodLabel = method ?? (blendAlpha != null ? 'blend' : realPortfolioPresent ? 'engine' : 'optimizer')
  const growthPct = allocation
    .filter(a => ['us_equity', 'intl_equity', 'reits'].includes(a.key))
    .reduce((sum, a) => sum + a.pct, 0)
  const revealSignature = useMemo(() => {
    if (!portfolio) return 'no-portfolio'
    const bySleeve = portfolio?.weights?.by_sleeve ?? weights
    const byTicker = portfolio?.weights?.by_ticker ?? {}
    return JSON.stringify({
      method: methodLabel,
      blendAlpha,
      bySleeve,
      byTicker,
    })
  }, [blendAlpha, methodLabel, portfolio, weights])

  useEffect(() => {
    let cancelled = false

    if (resultPortfolio) {
      setFetchedPortfolio(null)
      setPortfolioError(null)
      setLoadingPortfolio(false)
      return () => { cancelled = true }
    }

    setLoadingPortfolio(true)
    setPortfolioError(null)
    postPortfolio(profile)
      .then((response) => {
        if (!cancelled) setFetchedPortfolio(portfolioFromResponse(response))
      })
      .catch((error) => {
        if (!cancelled) setPortfolioError(error?.message ?? 'Portfolio could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setLoadingPortfolio(false)
      })

    return () => { cancelled = true }
  }, [profile, resultPortfolio])

  const tickerRows = useMemo(() => {
    const sleeveMap = tickerSleeveMap(portfolio?.universe)
    return Object.entries(portfolio?.weights?.by_ticker ?? {})
      .map(([ticker, weight]) => {
        const numWeight = Number(weight)
        if (!Number.isFinite(numWeight) || numWeight <= 0) return null
        const sleeve = sleeveMap[ticker]
        return {
          ticker,
          sleeve,
          label: sleeveLabel(sleeve),
          pct: numWeight * 100,
          amount: capital != null ? Math.round(capital * numWeight) : null,
          color: sleeveColor(sleeve),
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const sleeveOrder = SLEEVE_ORDER.indexOf(a.sleeve) - SLEEVE_ORDER.indexOf(b.sleeve)
        return sleeveOrder || a.ticker.localeCompare(b.ticker)
      })
  }, [capital, portfolio])

  const targetRows = tickerRows.length > 0 ? tickerRows : allocation.map(row => ({
    ticker: row.ticker ?? row.key,
    sleeve: row.sleeve,
    label: row.label,
    pct: row.pct,
    amount: row.amount,
    color: row.color,
  }))

  const riskContributions = useMemo(() => (
    SLEEVE_ORDER
      .map((sleeve) => {
        const contribution = Number(metrics?.risk_contributions?.[sleeve])
        if (!Number.isFinite(contribution)) return null
        return {
          sleeve,
          label: sleeveLabel(sleeve),
          value: contribution,
          color: sleeveColor(sleeve),
        }
      })
      .filter(Boolean)
  ), [metrics?.risk_contributions])

  const volatilityCount = metricCountConfig(metrics?.expected_vol, risk.target_volatility_pct)
  const lossCount = metricCountConfig(metrics?.expected_shortfall_95, risk.estimated_max_loss_1yr_pct)

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

  if (showRebalance) return <RebalancePanel onboardResult={activeResult} userEmail={userEmail} />

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <PortfolioRevealStyles />
      {showGuide && (
        <GuideOverlay
          onClose={() => setShowGuide(false)}
          onComplete={handleGuideComplete}
          userEmail={userEmail}
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
                  : fetchedPortfolioPresent
                  ? 'Live optimizer allocation from engine data'
                  : 'Portfolio target ready for Greenlight'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-tour="greenlight-editor-toggle"
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

        {!portfolio && (
          <div
            className="card-premium p-6 anim-fade-up d100"
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
          <div key={revealSignature} className="space-y-5">
            <div
              data-tour="greenlight-portfolio"
              className="card-premium p-5 anim-fade-up d100 portfolio-reveal-card"
              style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))' }}
            >
              <RiskMetric
                label="Expected Volatility"
                value={formatMetricPct(metrics?.expected_vol, risk.target_volatility_pct)}
                countConfig={volatilityCount}
                reducedMotion={reducedMotion}
                delay={120}
                color="var(--green-bright, var(--green))"
              />
              <RiskMetric
                label="Est. 1Y Max Loss"
                value={formatMetricPct(metrics?.expected_shortfall_95, risk.estimated_max_loss_1yr_pct)}
                countConfig={lossCount}
                reducedMotion={reducedMotion}
                delay={190}
                color="var(--ruby)"
              />
              <RiskMetric
                label="Growth Weight"
                value={`${Math.round(riskDial * 100)}%`}
                countConfig={{ value: riskDial * 100, format: v => `${Math.round(v)}%` }}
                reducedMotion={reducedMotion}
                delay={260}
                color="var(--green, var(--emerald))"
              />
              <RiskMetric
                label={blendAlpha != null ? 'Blend α' : 'Method'}
                value={blendAlpha != null ? Number(blendAlpha).toFixed(2) : methodLabel}
                countConfig={blendAlpha != null ? { value: Number(blendAlpha), format: v => Number(v).toFixed(2) } : null}
                reducedMotion={reducedMotion}
                delay={330}
                color="var(--blue)"
              />
              <RiskMetric
                label="Capital Available"
                value={capital != null ? formatMoney(capital) : 'N/A'}
                countConfig={capital != null ? { value: capital, format: v => formatMoney(v) } : null}
                reducedMotion={reducedMotion}
                delay={400}
                color="var(--green, var(--emerald))"
              />
            </div>

            {showEditor && (
              <PortfolioEditor
                onboardResult={activeResult}
                userEmail={userEmail}
                onApplied={handleEditorApplied}
              />
            )}

            <div className="grid gap-5 anim-fade-up d150" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
              <div className="card-premium p-5 portfolio-reveal-card">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Target Sleeve Allocation
                  </div>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: realPortfolioPresent ? 'var(--green)' : 'var(--gold-light)' }}>
                    <CheckCircle size={13} />
                    {realPortfolioPresent ? 'engine' : 'live fetch'}
                  </div>
                </div>
                <div className="portfolio-reveal-donut" style={{ position: 'relative', height: 210 }}>
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
                        isAnimationActive={!reducedMotion}
                        animationBegin={120}
                        animationDuration={850}
                      >
                        {allocation.map((a) => (
                          <Cell key={a.key} fill={a.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltipAlloc />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="portfolio-reveal-center" style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center', pointerEvents: 'none',
                  }}>
                    <div className="font-display font-semibold" style={{ fontSize: 22, color: 'var(--text-primary)' }}>
                      <CountUpNumber
                        value={growthPct}
                        format={v => `${Number(v).toFixed(0)}%`}
                        delay={360}
                        reducedMotion={reducedMotion}
                      />
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>growth</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {allocation.map((a, index) => (
                    <RevealItem key={a.key} className="flex items-center gap-2 text-xs" index={index} reducedMotion={reducedMotion}>
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
                      <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{a.label}</span>
                      <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{a.pct.toFixed(1)}%</span>
                    </RevealItem>
                  ))}
                </div>
              </div>

              <div className="card-premium p-5 portfolio-reveal-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Ticker Breakdown
                  </div>
                  <div
                    className="text-xs px-2 py-1 rounded-lg font-mono"
                    style={{ background: 'var(--green-soft)', color: 'var(--green-bright, var(--green))', border: '1px solid var(--green, var(--emerald))' }}
                  >
                    {methodLabel}
                  </div>
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Ticker', 'Sleeve', 'Weight', 'Amount', 'Source'].map(h => (
                          <th key={h} className="text-left pb-2 font-semibold uppercase"
                            style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {targetRows.map((a, index) => (
                        <RevealItem
                          as="tr"
                          key={`${a.ticker}-${a.sleeve}`}
                          index={index}
                          reducedMotion={reducedMotion}
                          style={{ borderBottom: '1px solid var(--border)' }}
                        >
                          <td className="py-2.5 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{a.ticker}</td>
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
                              {realPortfolioPresent ? 'engine' : 'live fetch'}
                            </span>
                          </td>
                        </RevealItem>
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
                </div>
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

            {riskContributions.length > 0 && (
              <div className="card-premium p-5 anim-fade-up d200 portfolio-reveal-card">
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
                  {riskContributions.map((item, index) => (
                    <RevealItem key={item.sleeve} index={index} reducedMotion={reducedMotion}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                        <span className="font-mono" style={{ color: item.color }}>{formatPercent(item.value)}</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                        <div className="h-full rounded-full portfolio-risk-fill" style={{ width: `${Math.min(100, Math.max(0, item.value * 100))}%`, background: item.color }} />
                      </div>
                    </RevealItem>
                  ))}
                </div>
              </div>
            )}

            <div className="card-premium p-5 anim-fade-up d250">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                    Goal Horizon
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {horizonYears != null
                      ? `The backend profile returned a ${horizonYears}-year horizon for this portfolio.`
                      : 'No horizon value was returned by the backend profile.'}
                  </div>
                </div>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Horizon</div>
                  <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {horizonYears != null ? `${horizonYears} years` : 'N/A'}
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Method</div>
                  <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {methodLabel}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center gap-3 anim-fade-up d300">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Bot size={14} style={{ color: 'var(--green)' }} />
            Greenlight can re-interview you, rebuild the target, then open the slider editor.
          </div>
          <button
            data-tour="greenlight-rebalance"
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
            Rebalance from live positions
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
