import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Info, Loader2, TrendingDown } from 'lucide-react'

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

function costBasisFromPositions(positions) {
  const costBasis = {}
  asArray(positions?.items).forEach(position => {
    const ticker = position.ticker ?? position.symbol
    if (!ticker) return
    const shares = pickNumber(position.shares)
    const avgCost = pickNumber(position.avg_cost, position.avgCost, position.cost_basis_per_share)
    const explicitBasis = Number(position.cost_basis ?? position.costBasis)
    costBasis[ticker] = Number.isFinite(explicitBasis) && explicitBasis > 0
      ? explicitBasis
      : shares * avgCost
  })
  return costBasis
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

      {/* Bar */}
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
              Trades are generated from backend positions and onboarding target weights.
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

function TaxPanel({ taxReport }) {
  const tax = normalizeResponse(taxReport)
  const tlhFlags = asArray(tax.harvestable ?? tax.tlh_flags ?? tax.tax_loss_harvesting ?? tax.harvestable_losses ?? tax.losses)
  const washSales = asArray(tax.wash_sale_warnings ?? tax.wash_sales ?? tax.warnings)

  if (!taxReport) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={13} style={{ color: 'var(--text-muted)' }} />
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Tax-Loss Harvest Flags
          </div>
        </div>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No backend cost-basis data is available, so tax-loss harvesting numbers are not displayed.
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown size={13} style={{ color: 'var(--ruby)' }} />
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Tax-Loss Harvest Flags
        </div>
      </div>

      {tlhFlags.length > 0 ? tlhFlags.map((flag, index) => (
        <div
          key={`${flag.ticker ?? flag.symbol ?? 'tlh'}-${index}`}
          className="rounded-xl p-4 mb-3"
          style={{ background: 'rgba(230,69,69,0.05)', border: '1px solid rgba(230,69,69,0.2)' }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{flag.ticker ?? flag.symbol ?? 'Position'}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{flag.label ?? flag.reason ?? 'Harvestable unrealized loss'}</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-semibold text-sm" style={{ color: 'var(--ruby)' }}>-${Math.abs(pickNumber(flag.loss, flag.harvestable_loss, flag.unrealized_loss)).toLocaleString()}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>harvestable loss</div>
            </div>
          </div>
          <div className="grid gap-2 text-xs" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Cost basis: </span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>${pickNumber(flag.costBasis, flag.cost_basis, flag.basis).toLocaleString()}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Current value: </span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>${pickNumber(flag.currentValue, flag.current_value, flag.market_value).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )) : (
        <div
          className="rounded-xl p-4 mb-3 text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          No tax-loss harvesting flags returned.
        </div>
      )}

      {washSales.map((warning, index) => (
        <div
          key={`${warning.ticker ?? warning.symbol ?? 'wash'}-${index}`}
          className="rounded-xl p-4 mb-3"
          style={{ background: 'rgba(196,154,44,0.08)', border: '1px solid rgba(196,154,44,0.2)' }}
        >
          <div
            className="text-xs font-semibold mb-1"
            style={{ color: 'var(--gold-light)' }}
          >
            Wash-Sale Warning
          </div>
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {warning.message ?? warning.reason ?? (
              <>
                Selling <span className="font-mono">{warning.sold_ticker ?? warning.source ?? warning.ticker ?? 'the loss position'}</span> may conflict with recent
                {' '}<span className="font-mono">{warning.suggested_replacement ?? warning.replacement ?? warning.replacement_ticker ?? warning.security ?? 'replacement'}</span> activity inside the {warning.window_days ?? 30}-day window.
              </>
            )}
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

export default function RebalancePanel({ onboardResult, userEmail }) {
  const [loading, setLoading] = useState(false)
  const [serviceUnavailable, setServiceUnavailable] = useState(false)
  const [error, setError] = useState(null)
  const [rebalanceResponse, setRebalanceResponse] = useState(null)
  const [taxReportResponse, setTaxReportResponse] = useState(null)
  const snapshot = onboardResult?.financial_analysis?.snapshot ?? {}
  const optimizerInput = onboardResult?.optimizer_input ?? {}
  const filingStatus = onboardResult?.validated_profile?.filing_status ?? 'single'
  const monthly = Number(snapshot.monthly_surplus ?? optimizerInput.monthly_surplus)
  const monthlyContrib = Number.isFinite(monthly) && monthly > 0 ? monthly : null
  const weights = useMemo(() => onboardResult?.portfolio?.weights ?? {}, [onboardResult?.portfolio?.weights])
  const hasWeights = Object.keys(weights).length > 0
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

    async function fetchAnalysis() {
      if (!hasWeights || !userEmail) {
        setLoading(false)
        setServiceUnavailable(false)
        setError(null)
        setRebalanceResponse(null)
        setTaxReportResponse(null)
        return
      }

      setLoading(true)
      setServiceUnavailable(false)
      setError(null)

      try {
        const client = await import('../../api/greenlightClient')
        const getPositions = client.getPositions
        const postRebalance = client.postRebalance
        const postTaxReport = client.postTaxReport

        if (typeof getPositions !== 'function' || typeof postRebalance !== 'function') {
          throw new Error('Service unavailable')
        }

        const positions = await getPositions(userEmail)
        const rebalanceResult = await postRebalance({ positions, weights })
        const taxReportResult = typeof postTaxReport === 'function'
          ? await postTaxReport({
            positions,
            cost_basis: costBasisFromPositions(positions),
            filing_status: filingStatus,
          })
          : null

        if (!cancelled) {
          setRebalanceResponse(rebalanceResult)
          setTaxReportResponse(taxReportResult)
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

    return () => {
      cancelled = true
    }
  }, [filingStatus, hasWeights, userEmail, weights])

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

  if (!userEmail) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="p-7">
          <div
            className="rounded-2xl p-6 flex gap-3 items-start"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <Info size={16} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Positions unavailable</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                A signed-in user email is required before backend positions can be loaded.
              </div>
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
            Drift-Band Rebalance
          </div>
          <div
            className="font-display font-semibold"
            style={{ fontSize: 28, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
          >
            Review backend positions against your onboarding target weights before taking action.
          </div>
          {error && (
            <div className="mt-3 text-xs" style={{ color: 'var(--ruby)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Drift bars */}
        <div className="anim-fade-up d100">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Sleeve Drift · Current vs Target (±5pp band)
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

        {/* Two-column: plan + tax */}
        <div className="grid gap-5 anim-fade-up d200" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <RebalancePlan monthlyContrib={monthlyContrib} rebalance={rebalance} />
          <TaxPanel taxReport={taxReportResponse} />
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
            Only band breaches would trigger an order after backend positions are connected.
          </div>
        </div>
      </div>
    </div>
  )
}
