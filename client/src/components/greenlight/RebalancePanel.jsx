import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Info, TrendingDown } from 'lucide-react'
import { postHarvestAnalysis, postPortfolio, postRebalanceAnalysis } from '../../api/greenlightClient'
import {
  SLEEVE_ORDER,
  buildCostBasis,
  buildPositionsFromPortfolio,
  formatMoney,
  formatPctPoints,
  getCapital,
  getMonthlyContribution,
  getProfile,
  sleeveColor,
  sleeveLabel,
  tickerSleeveMap,
} from './engineData'

function driftRows(decision) {
  return Object.entries(decision?.drifts ?? {})
    .map(([sleeve, drift]) => ({
      sleeve,
      label: sleeveLabel(sleeve),
      target: Number(drift.target ?? 0) * 100,
      current: Number(drift.current ?? 0) * 100,
      driftPp: Number(drift.drift_pp ?? 0),
      color: sleeveColor(sleeve),
    }))
    .sort((a, b) => SLEEVE_ORDER.indexOf(a.sleeve) - SLEEVE_ORDER.indexOf(b.sleeve))
}

function DriftBar({ row }) {
  const breached = Math.abs(row.driftPp) > 5

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
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: row.color }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{row.label}</span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{row.sleeve}</span>
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
            {row.driftPp > 0 ? '+' : ''}{formatPctPoints(row.driftPp)}
          </span>
        </div>
      </div>

      <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(100, Math.max(0, row.target))}%`,
            top: 0, bottom: 0,
            width: 2,
            background: 'var(--text-muted)',
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(0, row.target - 5)}%`,
            width: `${Math.min(10, 100 - Math.max(0, row.target - 5))}%`,
            top: 0, bottom: 0,
            background: breached ? 'rgba(230,69,69,0.12)' : 'rgba(74,114,232,0.12)',
            zIndex: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${Math.min(100, Math.max(0, row.current))}%`,
            top: '25%', bottom: '25%',
            background: row.color,
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
          Target <span style={{ color: row.color }}>{row.target.toFixed(1)}%</span> · Current <span style={{ color: breached ? 'var(--ruby)' : 'var(--text-primary)' }}>{row.current.toFixed(1)}%</span>
        </span>
        <span>50%</span>
      </div>

      <div className="mt-2 text-xs" style={{ color: breached ? 'var(--ruby)' : 'var(--text-muted)' }}>
        {breached
          ? 'Breached band: corrective trade required'
          : Math.abs(row.driftPp) > 2
          ? `Within band: steer next contribution to ${row.driftPp < 0 ? 'increase' : 'reduce'}`
          : 'On target'}
      </div>
    </div>
  )
}

function RebalancePlan({ decision, monthlyContrib, loading }) {
  const steerSleeves = decision?.steer?.next_contribution_to ?? []
  const underweightSleeves = Object.entries(decision?.drifts ?? {})
    .filter(([, drift]) => Number(drift.target ?? 0) - Number(drift.current ?? 0) > 0.001)
    .map(([sleeve]) => sleeve)

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
        Rebalance Decision
      </div>
      <div className="space-y-3">
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: decision?.action === 'trade' ? 'rgba(230,69,69,0.06)' : 'rgba(74,114,232,0.06)',
            border: `1px solid ${decision?.action === 'trade' ? 'rgba(230,69,69,0.2)' : 'rgba(74,114,232,0.2)'}`,
          }}
        >
          <div
            className="shrink-0 flex items-center justify-center rounded-lg"
            style={{
              width: 28,
              height: 28,
              background: decision?.action === 'trade' ? 'rgba(230,69,69,0.15)' : 'rgba(74,114,232,0.15)',
              color: decision?.action === 'trade' ? 'var(--ruby)' : 'var(--blue)',
            }}
          >
            <ArrowRight size={13} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: decision?.action === 'trade' ? 'var(--ruby)' : 'var(--blue)' }}>
              {loading ? 'Engine Check Running' : decision?.action === 'trade' ? 'Corrective Trade: Band Breached' : decision?.action === 'steer' ? 'Contribution Steer: Within Band' : 'No Trade Needed'}
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {loading && 'Waiting for the engine rebalance decision.'}
              {!loading && decision?.action === 'trade' && (
                <span className="font-mono">
                  {decision.trades.map(trade => `${trade.side.toUpperCase()} ${trade.shares.toFixed(3)} ${trade.ticker}`).join(' · ')}
                </span>
              )}
              {!loading && decision?.action === 'steer' && (
                <span>
                  Next <span className="font-mono">{formatMoney(monthlyContrib)}/mo</span> → <span className="font-mono">{steerSleeves.map(sleeveLabel).join(' · ')}</span>
                </span>
              )}
              {!loading && decision?.action === 'none' && 'All sleeves are on target.'}
              {!loading && !decision && 'Rebalance data unavailable.'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {decision?.action === 'trade'
                ? `The engine found a drift-band breach. Underweight sleeves: ${underweightSleeves.map(sleeveLabel).join(', ') || 'none'}.`
                : decision?.action === 'steer'
                ? 'No taxable trade is needed; new contributions can close the drift.'
                : 'Positions remain inside the drift policy.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaxPanel({ taxReport, positions, costBasis }) {
  const warnings = Object.fromEntries((taxReport?.wash_sale_warnings ?? []).map(warning => [warning.ticker, warning]))
  const positionsByTicker = Object.fromEntries((positions?.items ?? []).map(position => [position.ticker, position]))
  const harvestable = taxReport?.harvestable ?? []

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

      {harvestable.length === 0 && (
        <div
          className="rounded-xl p-4 mb-3 text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          No harvestable losses were returned by the tax report.
        </div>
      )}

      {harvestable.map(flag => {
        const warning = warnings[flag.ticker]
        const position = positionsByTicker[flag.ticker]
        return (
          <div
            key={flag.ticker}
            className="rounded-xl p-4 mb-3"
            style={{ background: 'rgba(230,69,69,0.05)', border: '1px solid rgba(230,69,69,0.2)' }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{flag.ticker}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{flag.note}</div>
              </div>
              <div className="text-right">
                <div className="font-mono font-semibold text-sm" style={{ color: 'var(--ruby)' }}>-{formatMoney(flag.unrealized_loss)}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>harvestable loss</div>
              </div>
            </div>
            <div className="grid gap-2 text-xs" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Cost basis: </span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatMoney(costBasis?.[flag.ticker] ?? 0)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current value: </span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{formatMoney(position?.market_value ?? 0)}</span>
              </div>
            </div>
            {warning && (
              <div
                className="mt-3 rounded-lg p-3"
                style={{ background: 'rgba(196,154,44,0.08)', border: '1px solid rgba(196,154,44,0.2)' }}
              >
                <div className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: 'var(--gold-light)' }}>
                  <AlertTriangle size={12} /> Wash-Sale Caveat
                </div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Avoid a substantially identical repurchase within {warning.window_days} days. Suggested replacement: <span className="font-mono">{warning.suggested_replacement}</span>.
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div
        className="rounded-xl p-3 flex gap-2 items-start"
        style={{ background: 'rgba(74,114,232,0.08)', border: '1px solid rgba(74,114,232,0.2)' }}
      >
        <Info size={13} style={{ color: 'var(--blue)', marginTop: 1, flexShrink: 0 }} />
        <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {(taxReport?.after_tax_notes ?? ['Tax-loss harvesting is displayed only, never auto-executed.']).join(' ')}
        </div>
      </div>
    </div>
  )
}

export default function RebalancePanel({ onboardResult }) {
  const [portfolio, setPortfolio] = useState(() => onboardResult?.portfolio ?? null)
  const [decision, setDecision] = useState(null)
  const [taxReport, setTaxReport] = useState(null)
  const [positions, setPositions] = useState(null)
  const [costBasis, setCostBasis] = useState(null)
  const [loading, setLoading] = useState(Boolean(onboardResult))
  const [error, setError] = useState(null)

  const profile = getProfile(onboardResult)
  const monthlyContrib = getMonthlyContribution(onboardResult)
  const capital = getCapital(onboardResult) || 10000
  const rows = useMemo(() => driftRows(decision), [decision])

  useEffect(() => {
    if (!onboardResult) return undefined

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const nextPortfolio = onboardResult?.portfolio ?? await postPortfolio(onboardResult)
        const nextPositions = buildPositionsFromPortfolio(nextPortfolio, capital, { drift: true })
        const nextCostBasis = buildCostBasis(nextPositions)
        const [nextDecision, nextTaxReport] = await Promise.all([
          postRebalanceAnalysis({ positions: nextPositions, weights: nextPortfolio.weights }),
          postHarvestAnalysis({
            positions: nextPositions,
            cost_basis: nextCostBasis,
            filing_status: profile?.filing_status ?? onboardResult?.optimizer_input?.filing_status ?? 'single',
            bracket: 0.22,
          }),
        ])

        if (!cancelled) {
          setPortfolio(nextPortfolio)
          setPositions(nextPositions)
          setCostBasis(nextCostBasis)
          setDecision(nextDecision)
          setTaxReport(nextTaxReport)
        }
      } catch (err) {
        if (!cancelled) setError(err.message ?? 'Rebalance data unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [onboardResult, capital, profile?.filing_status])

  const sleeveMap = tickerSleeveMap(portfolio?.universe)
  const tickerCount = Object.keys(sleeveMap).length

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="p-7 space-y-5">

        <div className="anim-fade-up">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Fast-forwarded Quarter · Drift-Band Rebalance
          </div>
          <div
            className="font-display font-semibold"
            style={{ fontSize: 28, letterSpacing: 0, color: 'var(--text-primary)' }}
          >
            Engine decision from positions, target weights, and tax report.
          </div>
          {(loading || error) && (
            <div className="text-xs mt-2" style={{ color: error ? 'var(--ruby)' : 'var(--text-muted)' }}>
              {error ?? `Checking ${tickerCount || 'portfolio'} tickers against the drift band...`}
            </div>
          )}
        </div>

        <div className="anim-fade-up d100">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Sleeve Drift · Current vs Target (±5pp band)
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {rows.length > 0
              ? rows.map(row => <DriftBar key={row.sleeve} row={row} />)
              : (
                <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  Drift data pending.
                </div>
              )}
          </div>
        </div>

        <div className="grid gap-5 anim-fade-up d200" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <RebalancePlan decision={decision} monthlyContrib={monthlyContrib} loading={loading} />
          <TaxPanel taxReport={taxReport} positions={positions} costBasis={costBasis} />
        </div>

        <div
          className="rounded-2xl p-4 flex gap-3 items-start anim-fade-up d300"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <Info size={14} style={{ color: 'var(--text-muted)', marginTop: 1, flexShrink: 0 }} />
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Rebalancing policy:</strong> Drift-band (±5pp), not calendar-forced.
            Positions within band are corrected by steering the next contribution toward underweight sleeves. Only band breaches trigger an order.
          </div>
        </div>
      </div>
    </div>
  )
}
