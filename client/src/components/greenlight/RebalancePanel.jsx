import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Info, Loader2, TrendingDown, RefreshCw, CheckCircle, Zap } from 'lucide-react'
import { Positions, costBasis } from '../../data/seedPositions'
import { postTaxAnalyze } from '../../api/greenlightClient'

const SLEEVE_COLORS = ['#ddb84a', '#4a72e8', '#6b7280', '#22c27e', '#f0c060', '#8b5cf6', '#e64545', '#14b8a6']

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => (
      item && typeof item === 'object' ? { ticker: key, ...item } : { ticker: key, drift: item }
    ))
  }
  return []
}

function pickNumber(...values) {
  for (const value of values) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return 0
}

function toPercent(value) {
  const numeric = pickNumber(value)
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric
}

function normalizeResponse(response) {
  return response?.data ?? response ?? {}
}

function DriftBar({ sleeve }) {
  const drift = Number((sleeve.drift_pp ?? sleeve.current - sleeve.target).toFixed(1))
  const breached = Math.abs(drift) > 5
  const currentWidth = Math.max(0, Math.min(100, sleeve.current))
  const targetLeft = Math.max(0, Math.min(100, sleeve.target))

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

      <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        {/* Target marker */}
        <div
          style={{
            position: 'absolute',
            left: `${targetLeft}%`,
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
            width: `${currentWidth}%`,
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
            ? 'Breached band: corrective trade required'
            : Math.abs(drift) > 2
            ? `Within band: steer next contribution to ${drift < 0 ? 'increase' : 'reduce'}`
            : `On target`
        }
      </div>
    </div>
  )
}

function RebalancePlan({ monthlyContrib, rebalance }) {
  const actions = [
    ...(rebalance.action ? [`Action: ${rebalance.action}`] : []),
    ...asArray(rebalance.actions ?? rebalance.recommendations),
  ]
  const steerTargets = rebalance.steer?.next_contribution_to ?? rebalance.steers ?? rebalance.contribution_steer ?? []
  const steers = Array.isArray(steerTargets) ? steerTargets : asArray(steerTargets)
  const trades = asArray(rebalance.trades ?? rebalance.trade_list ?? rebalance.orders)

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
        Rebalance Decision
      </div>
      <div className="space-y-3">
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(230,69,69,0.06)', border: '1px solid rgba(230,69,69,0.2)' }}>
          <div className="shrink-0 flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: 'rgba(230,69,69,0.15)', color: 'var(--ruby)' }}>
            <ArrowRight size={13} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--ruby)' }}>
              Corrective Trade
            </div>
            {trades.length > 0 ? (
              <div className="space-y-1">
                {trades.map((trade, index) => (
                  <div key={`${trade.ticker ?? trade.symbol ?? 'trade'}-${index}`} className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    <span className="font-mono">{trade.action ?? trade.side ?? 'Trade'}</span>
                    {' '}
                    <span className="font-mono">{trade.ticker ?? trade.symbol ?? trade.asset ?? ''}</span>
                    {trade.shares != null ? <span className="font-mono"> {Number(trade.shares).toFixed(2)} sh</span> : null}
                    {trade.amount != null || trade.value != null ? <span className="font-mono"> ${Number(trade.amount ?? trade.value).toLocaleString()}</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No corrective trades returned by the rebalance engine.
              </div>
            )}
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Trades are generated from seeded holdings and onboarding target weights.
            </div>
          </div>
        </div>

        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(74,114,232,0.06)', border: '1px solid rgba(74,114,232,0.2)' }}>
          <div className="shrink-0 flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: 'rgba(74,114,232,0.15)', color: 'var(--blue)' }}>
            <ArrowRight size={13} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--blue)' }}>
              Contribution Steer: Within Band
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {steers.length > 0
                ? steers.map((steer, index) => (
                  <div key={`${steer.ticker ?? steer.symbol ?? 'steer'}-${index}`}>
                    Steer toward <span className="font-mono">{steer.ticker ?? steer.symbol ?? steer.asset ?? steer.label ?? steer}</span>
                    {steer.amount != null || steer.value != null ? <span className="font-mono"> ${Number(steer.amount ?? steer.value).toLocaleString()}</span> : null}
                  </div>
                ))
                : monthlyContrib != null && monthlyContrib > 0
                ? <>Next <span className="font-mono">${monthlyContrib.toLocaleString()}/mo</span> can be steered toward underweight target sleeves.</>
                : 'No positive monthly contribution was returned by the analysis.'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {actions.length > 0
                ? actions.map((action, index) => (
                  <div key={`action-${index}`}>{typeof action === 'string' ? action : action.message ?? action.label ?? JSON.stringify(action)}</div>
                ))
                : 'Target sleeves come from optimizer output when available.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Insight severity styling ───────────────────────────────────────────────────

const SEVERITY_STYLES = {
  positive: {
    bg: 'rgba(30,184,122,0.06)',
    border: 'rgba(30,184,122,0.25)',
    iconColor: 'var(--emerald)',
    Icon: CheckCircle,
  },
  info: {
    bg: 'rgba(74,114,232,0.06)',
    border: 'rgba(74,114,232,0.2)',
    iconColor: 'var(--blue)',
    Icon: Info,
  },
  warning: {
    bg: 'rgba(196,154,44,0.08)',
    border: 'rgba(196,154,44,0.2)',
    iconColor: 'var(--gold-light)',
    Icon: AlertTriangle,
  },
  error: {
    bg: 'rgba(230,69,69,0.06)',
    border: 'rgba(230,69,69,0.2)',
    iconColor: 'var(--ruby)',
    Icon: AlertTriangle,
  },
}

function InsightCard({ insight }) {
  const style = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info
  const { Icon } = style
  return (
    <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
      <Icon size={14} style={{ color: style.iconColor, marginTop: 2, flexShrink: 0 }} />
      <div className="flex-1">
        <div className="text-xs font-semibold mb-1" style={{ color: style.iconColor }}>{insight.title}</div>
        <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{insight.message}</div>
      </div>
    </div>
  )
}

// ── Roth conversion scenarios ─────────────────────────────────────────────────

function RothPanel({ roth }) {
  if (!roth) return null
  const { current_marginal_rate, next_bracket_rate, scenarios, recommended_reason, legal_notices } = roth
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Zap size={13} style={{ color: 'var(--gold-light)' }} />
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Roth Conversion Analysis · {new Date().getFullYear()}
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Marginal Rate</div>
          <div className="text-xl font-mono font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
            {(current_marginal_rate * 100).toFixed(0)}%
          </div>
        </div>
        <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Next Bracket</div>
          <div className="text-xl font-mono font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>
            {(next_bracket_rate * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
        {recommended_reason}
      </div>

      {scenarios?.length > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg font-medium w-full"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-bright)' }}
        >
          {expanded ? '▲ Hide scenarios' : `▼ Show ${scenarios.length} conversion scenario${scenarios.length > 1 ? 's' : ''}`}
        </button>
      )}

      {expanded && scenarios?.map((s, i) => (
        <div key={i} className="mt-3 rounded-xl p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: s.worth_converting ? 'var(--emerald)' : 'var(--text-muted)' }}>
            {s.label}
          </div>
          <div className="grid gap-1 text-xs" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Convert: </span><span className="font-mono" style={{ color: 'var(--text-primary)' }}>${s.conversion_amount?.toLocaleString()}</span></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Tax cost: </span><span className="font-mono" style={{ color: 'var(--ruby)' }}>${s.tax_cost_this_year?.toLocaleString()}</span></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Rate paid: </span><span className="font-mono">{(s.marginal_rate_on_conversion * 100).toFixed(0)}%</span></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Future value: </span><span className="font-mono" style={{ color: 'var(--emerald)' }}>${s.projected_future_value?.toLocaleString()}</span></div>
          </div>
          {s.bracket_warning && (
            <div className="mt-2 text-xs" style={{ color: 'var(--gold-light)' }}>⚠ {s.bracket_warning}</div>
          )}
        </div>
      ))}

      <div className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {legal_notices?.[0]}
      </div>
    </div>
  )
}

// ── Capital gains timing ──────────────────────────────────────────────────────

function GainsTimingPanel({ gains }) {
  if (!gains) return null
  const { current_ltcg_rate, zero_rate_opportunity, zero_rate_room_remaining, zero_rate_explanation, room_until_next_ltcg_bracket } = gains

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown size={13} style={{ color: zero_rate_opportunity ? 'var(--emerald)' : 'var(--text-muted)' }} />
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Capital Gains Timing · IRC §1(h)
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 rounded-xl p-3 text-center" style={{
          background: zero_rate_opportunity ? 'rgba(30,184,122,0.08)' : 'var(--bg-elevated)',
          border: `1px solid ${zero_rate_opportunity ? 'rgba(30,184,122,0.25)' : 'var(--border)'}`,
        }}>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Your LTCG Rate</div>
          <div className="text-xl font-mono font-semibold mt-1" style={{ color: zero_rate_opportunity ? 'var(--emerald)' : 'var(--text-primary)' }}>
            {(current_ltcg_rate * 100).toFixed(0)}%
          </div>
        </div>
        {zero_rate_opportunity && (
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(30,184,122,0.08)', border: '1px solid rgba(30,184,122,0.25)' }}>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>0% Headroom</div>
            <div className="text-xl font-mono font-semibold mt-1" style={{ color: 'var(--emerald)' }}>
              ${zero_rate_room_remaining?.toLocaleString()}
            </div>
          </div>
        )}
        {!zero_rate_opportunity && room_until_next_ltcg_bracket < 1_000_000 && (
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Until Next Bracket</div>
            <div className="text-xl font-mono font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
              ${room_until_next_ltcg_bracket?.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {zero_rate_explanation}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RebalancePanel({ onboardResult }) {
  const [loading, setLoading] = useState(false)
  const [serviceUnavailable, setServiceUnavailable] = useState(false)
  const [error, setError] = useState(null)
  const [rebalanceResponse, setRebalanceResponse] = useState(null)
  const [taxReportResponse, setTaxReportResponse] = useState(null)
  const [taxData, setTaxData] = useState(null)
  const [taxLoading, setTaxLoading] = useState(false)
  const [taxError, setTaxError] = useState(null)

  const snapshot = onboardResult?.financial_analysis?.snapshot ?? {}
  const optimizerInput = onboardResult?.optimizer_input ?? {}
  const monthly = Number(snapshot.monthly_surplus ?? optimizerInput.monthly_surplus)
  const monthlyContrib = Number.isFinite(monthly) && monthly > 0 ? monthly : null
  const weights = useMemo(() => onboardResult?.portfolio?.weights ?? {}, [onboardResult?.portfolio?.weights])
  const hasWeights = Object.keys(weights).length > 0
  const profile = onboardResult?.validated_profile ?? onboardResult?.profile
  const rebalance = normalizeResponse(rebalanceResponse)
  const drifts = asArray(rebalance.drifts).map((drift, index) => ({
    label: drift.label ?? drift.name ?? drift.asset_class ?? drift.ticker ?? drift.symbol ?? `Sleeve ${index + 1}`,
    ticker: drift.ticker ?? drift.symbol ?? drift.asset ?? drift.label ?? `S${index + 1}`,
    target: toPercent(drift.target ?? drift.target_weight ?? drift.target_pct),
    current: toPercent(drift.current ?? drift.current_weight ?? drift.current_pct ?? drift.actual),
    drift_pp: pickNumber(drift.drift_pp),
    color: drift.color ?? SLEEVE_COLORS[index % SLEEVE_COLORS.length],
  }))

  useEffect(() => {
    let cancelled = false

    if (!hasWeights) {
      setLoading(false)
      setServiceUnavailable(false)
      setError(null)
      setRebalanceResponse(null)
      setTaxReportResponse(null)
      return
    }

    async function fetchAnalysis() {
      setLoading(true)
      setServiceUnavailable(false)
      setError(null)

      try {
        const client = await import('../../api/greenlightClient')
        const postRebalance = client.postRebalance
        const postTaxReport = client.postTaxReport

        if (typeof postRebalance !== 'function' || typeof postTaxReport !== 'function') {
          throw new Error('Service unavailable')
        }

        const [rebalanceResult, taxResult] = await Promise.all([
          postRebalance({ positions: Positions, weights }),
          postTaxReport({ positions: Positions, cost_basis: costBasis, filing_status: 'single' }),
        ])

        if (!cancelled) {
          setRebalanceResponse(rebalanceResult)
          setTaxReportResponse(taxResult)
        }
      } catch (err) {
        if (!cancelled) {
          if (err?.message === 'Service unavailable') setServiceUnavailable(true)
          else setError(err?.message ?? 'Unable to fetch rebalance analysis')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAnalysis()

    return () => { cancelled = true }
  }, [hasWeights, weights])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setTaxLoading(true)
    setTaxError(null)
    postTaxAnalyze({ profile })
      .then(data => { if (!cancelled) { setTaxData(data); setTaxLoading(false) } })
      .catch(err => { if (!cancelled) { setTaxError(err.message); setTaxLoading(false) } })
    return () => { cancelled = true }
  }, [profile])

  if (!hasWeights) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="p-7">
          <div
            className="rounded-2xl p-6 flex gap-3 items-start"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <Info size={16} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} />
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Complete onboarding to see rebalance analysis
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="p-7 flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading rebalance and tax analysis...</span>
        </div>
      </div>
    )
  }

  if (serviceUnavailable) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="p-7">
          <div
            className="rounded-2xl p-6 flex gap-3 items-start"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <AlertTriangle size={16} style={{ color: 'var(--ruby)', marginTop: 2, flexShrink: 0 }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Service unavailable</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Rebalance and tax endpoints are not exported by the Greenlight API client.
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="p-7 space-y-5">

        {/* Header */}
        <div className="anim-fade-up">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Drift-Band Rebalance · Tax Strategy
          </div>
          <div className="font-display font-semibold" style={{ fontSize: 28, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            {profile
              ? 'Personalized tax analysis based on your profile'
              : 'Live holdings are not connected — drift and tax lots below are examples'}
          </div>
          {error && (
            <div className="mt-3 text-xs" style={{ color: 'var(--ruby)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Tax insights — real data from Gilbert's strategies */}
        {taxLoading && (
          <div className="rounded-2xl p-5 flex items-center gap-3 anim-fade-up" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <RefreshCw size={14} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Running tax analysis…</span>
          </div>
        )}

        {taxError && (
          <div className="rounded-2xl p-4 flex gap-3 items-start anim-fade-up" style={{ background: 'rgba(230,69,69,0.06)', border: '1px solid rgba(230,69,69,0.2)' }}>
            <AlertTriangle size={14} style={{ color: 'var(--ruby)', marginTop: 1 }} />
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tax analysis unavailable: {taxError}</div>
          </div>
        )}

        {taxData && (
          <>
            {/* Insights strip */}
            {taxData.insights?.length > 0 && (
              <div className="space-y-3 anim-fade-up">
                <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Tax Strategy Insights · {taxData.tax_year}
                </div>
                {taxData.insights.map((ins, i) => (
                  <InsightCard key={i} insight={ins} />
                ))}
              </div>
            )}

            {/* Roth + Gains timing two-column */}
            <div className="grid gap-5 anim-fade-up d100" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <RothPanel roth={taxData.roth_conversion} />
              <GainsTimingPanel gains={taxData.capital_gains_timing} />
            </div>
          </>
        )}

        {/* Drift bars */}
        <div className="anim-fade-up d200">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Sleeve Drift Example · Current vs Target (±5pp band) · Illustrative
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {drifts.length > 0
              ? drifts.map(s => <DriftBar key={s.ticker} sleeve={s} />)
              : (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  No drift data returned.
                </div>
              )}
          </div>
        </div>

        {/* Rebalance plan */}
        <div className="anim-fade-up d300">
          <RebalancePlan monthlyContrib={monthlyContrib} rebalance={rebalance} />
        </div>

        {/* Harvesting notice */}
        <div className="rounded-2xl p-4 flex gap-3 items-start anim-fade-up d300" style={{ background: 'rgba(230,69,69,0.05)', border: '1px solid rgba(230,69,69,0.2)' }}>
          <TrendingDown size={14} style={{ color: 'var(--ruby)', marginTop: 1, flexShrink: 0 }} />
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Tax-Loss Harvesting:</strong> Realized losses offset capital gains and up to $3,000 of ordinary income annually (IRC §1091; §1212). Per-lot harvesting analysis requires connecting your brokerage holdings. Wash-sale rule applies: do not repurchase a substantially identical security within 30 days before or after the sale.
          </div>
        </div>

        {/* Bottom note */}
        <div className="rounded-2xl p-4 flex gap-3 items-start anim-fade-up d400" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <Info size={14} style={{ color: 'var(--text-muted)', marginTop: 1, flexShrink: 0 }} />
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Rebalancing policy:</strong> Drift-band (±5pp), not calendar-forced.
            Positions within band are corrected by steering the next contribution toward underweight sleeves. No trade, no transaction cost, no taxable event.
            Only band breaches would trigger an order after live holdings are connected. The displayed positions come from seeded Module C data.
          </div>
        </div>
      </div>
    </div>
  )
}
