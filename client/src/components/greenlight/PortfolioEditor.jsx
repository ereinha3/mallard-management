/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle, Loader, RotateCcw, SlidersHorizontal, Zap } from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { postAnalyzeWeights, postReoptimize, postSavePortfolio } from '../../api/greenlightClient'
import {
  RISKY_SLEEVES,
  SAFE_SLEEVES,
  SLEEVE_ORDER,
  allocationFromRiskDial,
  combineGroupWeights,
  estimatePortfolioMetrics,
  getCapital,
  getPortfolio,
  getProfile,
  getSleeveWeights,
  groupWeights,
  inferRiskDialFromWeights,
  normalizeSleeveWeights,
  portfolioSplit,
  renormalizeSleeveChange,
  riskSummaryFromMetrics,
  sleeveColor,
  sleeveLabel,
  weightsToAllocation,
} from './engineData'

const DIAL_LABELS = ['Conservative', 'Balanced', 'Aggressive']

function formatPct(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A'
  const numeric = Number(value)
  const pct = numeric > 1 ? numeric : numeric * 100
  return `${pct.toFixed(digits)}%`
}

function summaryFromResult(onboardResult, metrics) {
  const risk = onboardResult?.financial_analysis?.risk ?? {}
  const fromMetrics = riskSummaryFromMetrics(metrics)
  return {
    target_volatility_pct: risk.target_volatility_pct ?? fromMetrics.target_volatility_pct,
    estimated_max_loss_1yr_pct: risk.estimated_max_loss_1yr_pct ?? fromMetrics.estimated_max_loss_1yr_pct,
  }
}

function mergePortfolioResult(baseResult, portfolio, riskSummary = null) {
  const currentAnalysis = baseResult?.financial_analysis ?? {}
  const currentRisk = currentAnalysis.risk ?? {}

  return {
    ...(baseResult ?? {}),
    portfolio,
    financial_analysis: {
      ...currentAnalysis,
      risk: {
        ...currentRisk,
        ...(riskSummary ?? {}),
      },
    },
  }
}

function getUserEmail(result, propEmail) {
  return propEmail
    ?? result?.validated_profile?.email
    ?? result?.profile?.email
    ?? result?.user?.email
    ?? result?.email
    ?? null
}

function buildPortfolio(basePortfolio, weights, metrics) {
  const normalized = normalizeSleeveWeights(weights)
  const byTicker = basePortfolio?.weights?.by_ticker ?? {}
  const sleeves = basePortfolio?.universe?.sleeves ?? {}
  const nextByTicker = Object.keys(byTicker).length
    ? Object.entries(byTicker).reduce((acc, [ticker, weight]) => {
        const sleeve = Object.entries(sleeves).find(([, tickers]) => tickers?.includes(ticker))?.[0]
        const sleeveWeight = normalized[sleeve]
        const originalSleeveWeight = Number(basePortfolio?.weights?.by_sleeve?.[sleeve] ?? 0)
        acc[ticker] = originalSleeveWeight > 0
          ? sleeveWeight * (Number(weight) / originalSleeveWeight)
          : sleeveWeight / Math.max(1, sleeves[sleeve]?.length ?? 1)
        return acc
      }, {})
    : {
        VTI: normalized.us_equity,
        VXUS: normalized.intl_equity,
        BND: normalized.bonds,
        SCHP: normalized.tips,
        GLDM: normalized.gold,
        USRT: normalized.reits,
      }

  return {
    universe: {
      tickers: ['VTI', 'VXUS', 'BND', 'SCHP', 'GLDM', 'USRT'],
      sleeves: {
        us_equity: ['VTI'],
        intl_equity: ['VXUS'],
        bonds: ['BND'],
        tips: ['SCHP'],
        gold: ['GLDM'],
        reits: ['USRT'],
      },
      ...(basePortfolio?.universe ?? {}),
    },
    weights: {
      ...(basePortfolio?.weights ?? {}),
      by_sleeve: normalized,
      by_ticker: nextByTicker,
    },
    metrics,
  }
}

function AllocationTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{row.label}</div>
      <div className="font-mono" style={{ color: row.color }}>{row.pct.toFixed(1)}%</div>
    </div>
  )
}

function riskLabel(riskDial) {
  if (riskDial < 0.34) return DIAL_LABELS[0]
  if (riskDial < 0.67) return DIAL_LABELS[1]
  return DIAL_LABELS[2]
}

export default function PortfolioEditor({ onboardResult, onApplied, userEmail }) {
  const basePortfolio = useMemo(() => getPortfolio(onboardResult), [onboardResult])
  const baselineWeights = useMemo(() => getSleeveWeights(onboardResult), [onboardResult])
  const baselineDial = useMemo(() => inferRiskDialFromWeights(baselineWeights), [baselineWeights])
  const baselineMetrics = useMemo(() => (
    basePortfolio?.metrics ?? estimatePortfolioMetrics(baselineWeights, baselineDial)
  ), [basePortfolio, baselineDial, baselineWeights])
  const profile = useMemo(() => getProfile(onboardResult), [onboardResult])
  const capital = getCapital(onboardResult)

  const [weights, setWeights] = useState(baselineWeights)
  const [riskDial, setRiskDial] = useState(baselineDial)
  const [serverMetrics, setServerMetrics] = useState(baselineMetrics)
  const [riskSummary, setRiskSummary] = useState(() => summaryFromResult(onboardResult, baselineMetrics))
  const [editMode, setEditMode] = useState('weights')
  const [networkState, setNetworkState] = useState('idle')
  const [applyState, setApplyState] = useState('idle')
  const [persistenceState, setPersistenceState] = useState('idle')
  const [validation, setValidation] = useState(null)
  const analyzeSeq = useRef(0)
  const dialSeq = useRef(0)
  const latestWeights = useRef(weights)

  useEffect(() => {
    latestWeights.current = weights
  }, [weights])

  useEffect(() => {
    setWeights(baselineWeights)
    setRiskDial(baselineDial)
    setServerMetrics(baselineMetrics)
    setRiskSummary(summaryFromResult(onboardResult, baselineMetrics))
    setValidation(null)
    setNetworkState('idle')
    setPersistenceState('idle')
  }, [baselineDial, baselineMetrics, baselineWeights, onboardResult])

  const estimatedMetrics = useMemo(() => estimatePortfolioMetrics(weights, riskDial), [weights, riskDial])
  const displayMetrics = serverMetrics ?? estimatedMetrics
  const displaySummary = riskSummary ?? riskSummaryFromMetrics(displayMetrics)
  const allocation = useMemo(() => weightsToAllocation(weights, basePortfolio, capital), [basePortfolio, capital, weights])
  const barData = allocation.map(row => ({ ...row, value: row.pct }))
  const split = useMemo(() => portfolioSplit(weights), [weights])
  const mixes = useMemo(() => groupWeights(weights), [weights])
  const validationWarnings = validation?.warnings ?? []
  const resolvedUserEmail = getUserEmail(onboardResult, userEmail)

  useEffect(() => {
    if (editMode === 'dial') return undefined
    const seq = analyzeSeq.current + 1
    analyzeSeq.current = seq
    setServerMetrics(null)
    setRiskSummary(riskSummaryFromMetrics(estimatedMetrics))
    setNetworkState('pending')

    const timer = window.setTimeout(async () => {
      try {
        const result = await postAnalyzeWeights({ profile, weights: { by_sleeve: weights } })
        if (analyzeSeq.current !== seq) return
        const nextWeights = result?.weights?.by_sleeve ?? result?.weights ?? weights
        const nextMetrics = result?.metrics ?? estimatePortfolioMetrics(nextWeights, riskDial)
        setServerMetrics(nextMetrics)
        setRiskSummary(riskSummaryFromMetrics(nextMetrics))
        setValidation(result?.validation ?? null)
        setNetworkState('ok')
      } catch {
        if (analyzeSeq.current !== seq) return
        setServerMetrics(null)
        setRiskSummary(riskSummaryFromMetrics(estimatedMetrics))
        setValidation(null)
        setNetworkState('demo')
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [editMode, estimatedMetrics, profile, riskDial, weights])

  useEffect(() => {
    if (editMode !== 'dial') return undefined
    const seq = dialSeq.current + 1
    dialSeq.current = seq
    setNetworkState('pending')

    const timer = window.setTimeout(async () => {
      try {
        const result = await postReoptimize({
          profile,
          risk_dial: riskDial,
          weights: { by_sleeve: latestWeights.current },
        })
        if (dialSeq.current !== seq) return
        const nextPortfolio = result?.portfolio
        if (nextPortfolio?.weights?.by_sleeve) {
          setWeights(normalizeSleeveWeights(nextPortfolio.weights.by_sleeve))
        }
        const nextMetrics = nextPortfolio?.metrics ?? estimatePortfolioMetrics(nextPortfolio?.weights?.by_sleeve ?? allocationFromRiskDial(riskDial), riskDial)
        setServerMetrics(nextMetrics)
        setRiskSummary(result?.risk_summary ?? riskSummaryFromMetrics(nextMetrics))
        setValidation(null)
        setNetworkState('ok')
      } catch {
        if (dialSeq.current !== seq) return
        setServerMetrics(null)
        setRiskSummary(riskSummaryFromMetrics(estimatePortfolioMetrics(allocationFromRiskDial(riskDial), riskDial)))
        setNetworkState('demo')
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [editMode, profile, riskDial])

  function handleRiskDialChange(event) {
    const nextDial = Number(event.target.value) / 100
    const currentMixes = groupWeights(weights)
    const nextWeights = combineGroupWeights(nextDial, currentMixes.risky, currentMixes.safe)
    const nextMetrics = estimatePortfolioMetrics(nextWeights, nextDial)
    setEditMode('dial')
    setRiskDial(nextDial)
    setWeights(nextWeights)
    setServerMetrics(null)
    setRiskSummary(riskSummaryFromMetrics(nextMetrics))
  }

  function handleSleeveChange(sleeve, value) {
    const nextWeights = renormalizeSleeveChange(weights, sleeve, value)
    const nextRiskShare = portfolioSplit(nextWeights).risky
    const nextMetrics = estimatePortfolioMetrics(nextWeights, nextRiskShare)
    setEditMode('weights')
    setWeights(nextWeights)
    setRiskDial(nextRiskShare)
    setServerMetrics(null)
    setRiskSummary(riskSummaryFromMetrics(nextMetrics))
  }

  function handleReset() {
    setEditMode('weights')
    setWeights(baselineWeights)
    setRiskDial(baselineDial)
    setServerMetrics(baselineMetrics)
    setRiskSummary(summaryFromResult(onboardResult, baselineMetrics))
    setValidation(null)
    setApplyState('idle')
    setPersistenceState('idle')
  }

  async function handleApply() {
    setApplyState('pending')
    setPersistenceState('pending')
    const localMetrics = displayMetrics ?? estimatedMetrics
    let nextPortfolio = buildPortfolio(basePortfolio, weights, localMetrics)
    let nextSummary = displaySummary

    try {
      if (editMode === 'dial') {
        const result = await postReoptimize({
          profile,
          risk_dial: riskDial,
          weights: { by_sleeve: weights },
        })
        nextPortfolio = result?.portfolio ?? nextPortfolio
        nextSummary = result?.risk_summary ?? riskSummaryFromMetrics(nextPortfolio?.metrics ?? localMetrics)
      } else {
        const result = await postAnalyzeWeights({ profile, weights: { by_sleeve: weights } })
        const nextWeights = result?.weights?.by_sleeve ?? result?.weights ?? weights
        const nextMetrics = result?.metrics ?? localMetrics
        nextPortfolio = buildPortfolio(basePortfolio, nextWeights, nextMetrics)
        nextSummary = riskSummaryFromMetrics(nextMetrics)
        setValidation(result?.validation ?? null)
      }
      setNetworkState('ok')
    } catch {
      setNetworkState('demo')
    }

    let updatedResult = mergePortfolioResult(onboardResult, nextPortfolio, nextSummary)
    try {
      if (resolvedUserEmail) {
        updatedResult = await postSavePortfolio({
          user_email: resolvedUserEmail,
          portfolio: nextPortfolio,
          risk_summary: nextSummary,
        })
        setNetworkState('ok')
        setPersistenceState('saved')
      } else {
        setPersistenceState('local')
      }
    } catch {
      setNetworkState('demo')
      setPersistenceState('local')
    }

    setApplyState('ok')
    onApplied?.(updatedResult)
  }

  const validationMessage = validation?.message ?? validation?.detail ?? null
  const isApplying = applyState === 'pending'
  const growthPct = split.risky * 100
  const safePct = split.safe * 100

  function renderSleeveGroup(title, sleeves, mix) {
    const share = sleeves === RISKY_SLEEVES ? split.risky : split.safe
    return (
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {title}
          </div>
          <div className="font-mono text-xs" style={{ color: 'var(--green-bright, var(--green))' }}>
            Mix 100% · Portfolio {(share * 100).toFixed(1)}%
          </div>
        </div>
        <div className="space-y-3">
          {sleeves.map((sleeve) => {
            const withinPct = Number(mix[sleeve] ?? 0) * 100
            const finalPct = Number(weights[sleeve] ?? 0) * 100
            return (
              <div key={sleeve}>
                <label htmlFor={`sleeve-${sleeve}`} className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sleeveColor(sleeve) }} />
                    {sleeveLabel(sleeve)}
                  </span>
                  <span className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {withinPct.toFixed(1)}% mix · {finalPct.toFixed(1)}% final
                  </span>
                </label>
                <input
                  id={`sleeve-${sleeve}`}
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={withinPct}
                  onChange={event => handleSleeveChange(sleeve, event.target.value)}
                  aria-label={`${sleeveLabel(sleeve)} within ${title} mix`}
                  style={{ width: '100%', accentColor: sleeveColor(sleeve) }}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <section className="card-premium p-5 anim-fade-up" aria-label="Portfolio allocation editor">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--green, var(--emerald))' }}>
            <SlidersHorizontal size={14} />
            Allocation Editor
          </div>
          <h2 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)', letterSpacing: 0 }}>
            Tune risk, preview instantly, apply when ready
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {networkState === 'pending' && <Loader size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--green)' }} />}
          {networkState === 'ok' && <CheckCircle size={13} style={{ color: 'var(--green)' }} />}
          {networkState === 'demo' && <AlertTriangle size={13} style={{ color: 'var(--gold-light)' }} />}
          <span>
            {networkState === 'pending' ? 'Refreshing engine risk'
              : networkState === 'ok' ? 'Engine preview current'
              : networkState === 'demo' ? 'Demo estimate active'
              : 'Client preview ready'}
          </span>
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(360px, 1.3fr)' }}>
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <label htmlFor="risk-dial" className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Growth vs Safe Split</span>
              <span className="font-mono text-sm font-semibold" style={{ color: 'var(--green-bright, var(--green))' }}>
                Growth {growthPct.toFixed(0)}% / Safe {safePct.toFixed(0)}%
              </span>
            </label>
            <input
              id="risk-dial"
              type="range"
              min="0"
              max="100"
              value={Math.round(riskDial * 100)}
              aria-valuetext={`${riskLabel(riskDial)}, ${growthPct.toFixed(0)} percent growth and ${safePct.toFixed(0)} percent safe`}
              onChange={handleRiskDialChange}
              style={{ width: '100%', accentColor: 'var(--green)' }}
            />
            <div className="flex justify-between text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              <span>More safe assets</span>
              <span>More growth assets</span>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg" style={{ height: 10, background: 'var(--bg-surface)' }}>
              <div
                style={{
                  width: `${growthPct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--green, var(--emerald)), var(--green-bright))',
                }}
              />
            </div>
            <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Expected volatility</div>
                <div className="font-display font-semibold text-2xl" style={{ color: 'var(--green-bright, var(--green))' }}>
                  {formatPct(displaySummary.target_volatility_pct, 1)}
                </div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Est. max 1Y loss</div>
                <div className="font-display font-semibold text-2xl" style={{ color: 'var(--ruby)' }}>
                  {formatPct(displaySummary.estimated_max_loss_1yr_pct, 1)}
                </div>
              </div>
            </div>
          </div>

          {renderSleeveGroup('Growth Assets (Risky)', RISKY_SLEEVES, mixes.risky)}
          {renderSleeveGroup('Safe Assets', SAFE_SLEEVES, mixes.safe)}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
              Instant Preview
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: '220px 1fr' }}>
              <div style={{ height: 210, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocation} dataKey="pct" innerRadius={58} outerRadius={88} paddingAngle={2} startAngle={90} endAngle={-270}>
                      {allocation.map(row => <Cell key={row.key} fill={row.color} />)}
                    </Pie>
                    <Tooltip content={<AllocationTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div className="text-center">
                <div className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)' }}>
                      {Math.round(growthPct)}%
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>growth</div>
                  </div>
                </div>
              </div>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis type="category" dataKey="label" width={84} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<AllocationTooltip />} />
                    <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                      {barData.map(row => <Cell key={row.key} fill={row.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
              Risk Contribution
            </div>
            <div className="grid gap-2">
              {SLEEVE_ORDER.map((sleeve) => {
                const contribution = Number(displayMetrics?.risk_contributions?.[sleeve] ?? 0) * 100
                return (
                  <div key={sleeve} className="flex items-center gap-3 text-xs">
                    <div style={{ width: 86, color: 'var(--text-secondary)' }}>{sleeveLabel(sleeve)}</div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ flex: 1, background: 'var(--bg-surface)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, contribution))}%`, background: sleeveColor(sleeve) }} />
                    </div>
                    <div className="font-mono text-right" style={{ width: 48, color: 'var(--text-muted)' }}>{contribution.toFixed(1)}%</div>
                  </div>
                )
              })}
            </div>
            {validationMessage && (
              <div className="mt-3 rounded-lg p-2 text-xs" style={{ background: 'rgba(217,64,64,0.08)', border: '1px solid rgba(217,64,64,0.25)', color: 'var(--ruby)' }}>
                {validationMessage}
              </div>
            )}
            {validationWarnings.length > 0 && (
              <div className="mt-3 rounded-lg p-2 text-xs" style={{ background: 'rgba(240,192,96,0.10)', border: '1px solid rgba(240,192,96,0.30)', color: 'var(--gold-light)' }}>
                {validationWarnings.join(' ')}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {applyState === 'ok' && (
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: persistenceState === 'local' ? 'var(--gold-light)' : 'var(--green)' }}>
                {persistenceState === 'local' ? <AlertTriangle size={13} /> : <CheckCircle size={13} />}
                {persistenceState === 'local' ? 'Applied locally' : 'Saved'}
              </div>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', color: 'var(--text-primary)' }}
            >
              <RotateCcw size={15} />
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: isApplying ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--green, var(--emerald)), var(--green-bright))',
                border: '1px solid var(--green-light, var(--green))',
                color: isApplying ? 'var(--text-muted)' : '#07120d',
                cursor: isApplying ? 'wait' : 'pointer',
                boxShadow: isApplying ? 'none' : '0 14px 34px rgba(30,184,122,0.22)',
              }}
            >
              {isApplying ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={16} />}
              Apply Allocation
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </section>
  )
}
