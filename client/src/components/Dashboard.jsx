import { useEffect, useState } from 'react'
import {
  TrendingUp, DollarSign, Target,
  Calendar, ArrowUpRight, ArrowDownRight,
  Home, Car, Briefcase, PiggyBank, CreditCard, Building,
} from 'lucide-react'
import { formatCurrency, formatPercent } from '../lib/utils'
import RetirementScore from './RetirementScore'
import ProjectionChart from './ProjectionChart'

const ASSET_ICONS = {
  cash:       { icon: PiggyBank, color: '#8b5cf6' },
  emergency: { icon: PiggyBank, color: '#1eb87a' },
  home:      { icon: Home,      color: '#4a72e8' },
  vehicle:   { icon: Car,       color: '#6b7280' },
  brokerage: { icon: TrendingUp,color: '#1eb87a' },
  retirement:{ icon: Briefcase, color: '#ddb84a' },
  other:     { icon: DollarSign,color: '#6b7280' },
}

const LIABILITY_ICONS = {
  mortgage:     { icon: Building,  color: '#4a72e8' },
  auto:         { icon: Car,       color: '#8b5cf6' },
  student_loan: { icon: Briefcase, color: '#e64545' },
  credit_card:  { icon: CreditCard,color: '#e64545' },
  medical:      { icon: DollarSign,color: '#e64545' },
  other:        { icon: DollarSign,color: '#6b7280' },
}

function numberOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function formatMaybeCurrency(value, compact = false) {
  return value == null ? 'Not available' : formatCurrency(value, compact)
}

function getProfile(onboardResult) {
  return onboardResult?.validated_profile ?? onboardResult?.profile ?? onboardResult ?? {}
}

function getAssetRows(profile) {
  const rows = [
    { label: 'Liquid Cash', value: numberOrNull(profile.capital_on_hand), type: 'cash' },
    { label: 'Emergency Fund', value: numberOrNull(profile.emergency_fund), type: 'emergency' },
  ]

  if (profile.assets && typeof profile.assets === 'object') {
    Object.entries(profile.assets).forEach(([key, value]) => {
      const amount = numberOrNull(value)
      if (amount == null || amount <= 0) return
      rows.push({
        label: key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
        value: amount,
        type: key.includes('home') ? 'home'
          : key.includes('vehicle') || key.includes('auto') ? 'vehicle'
          : key.includes('brokerage') ? 'brokerage'
          : key.includes('retirement') || key.includes('401') ? 'retirement'
          : 'other',
      })
    })
  }

  const unique = new Map()
  rows.forEach(row => {
    if (row.value != null && row.value > 0) unique.set(row.label, row)
  })
  const total = [...unique.values()].reduce((sum, row) => sum + row.value, 0)
  return [...unique.values()].map(row => ({
    ...row,
    percent: total > 0 ? (row.value / total) * 100 : 0,
  }))
}

function getLiabilityRows(onboardResult, profile) {
  const analyzedDebts = onboardResult?.financial_analysis?.debt?.debts
  const sourceDebts = analyzedDebts?.length ? analyzedDebts : profile.debts ?? []
  return sourceDebts
    .map((debt, index) => {
      const balance = numberOrNull(debt.balance)
      if (balance == null || balance <= 0) return null
      return {
        id: debt.id ?? debt.kind ?? debt.type ?? `debt-${index}`,
        label: (debt.kind ?? debt.type ?? debt.label ?? 'Debt').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
        type: debt.kind ?? debt.type ?? 'other',
        balance,
        apr: numberOrNull(debt.apr),
        effectiveApr: numberOrNull(debt.effective_apr),
      }
    })
    .filter(Boolean)
}

function retirementScoreFromAnalysis(onboardResult) {
  const snapshot = onboardResult?.financial_analysis?.snapshot
  const emergencyPct = numberOrNull(snapshot?.emergency_fund_pct_complete)
  const savingsRate = numberOrNull(snapshot?.savings_rate_pct)
  const debtRatio = numberOrNull(snapshot?.debt_to_income_ratio)
  if (emergencyPct == null && savingsRate == null && debtRatio == null) return null

  const emergencyScore = Math.min(emergencyPct ?? 0, 100) * 0.45
  const savingsScore = Math.min((savingsRate ?? 0) / 20, 1) * 35
  const debtScore = Math.max(0, 20 - (debtRatio ?? 0) * 20)
  return Math.round(Math.max(0, Math.min(100, emergencyScore + savingsScore + debtScore)))
}

function getProjectionInputs(onboardResult, profile) {
  const optimizer = onboardResult?.optimizer_input ?? {}
  const horizonYears = numberOrNull(optimizer.horizon_years ?? profile.horizon_years) ?? 1
  const monthlyContribution = Math.max(0, numberOrNull(optimizer.monthly_surplus ?? profile.monthly_contribution ?? profile.monthly_savings) ?? 0)
  const capitalOnHand = Math.max(0, numberOrNull(optimizer.capital_on_hand ?? profile.capital_on_hand) ?? 0)
  const goalTarget = Math.max(0, numberOrNull(optimizer.goal_target ?? profile.goal_target) ?? 0)

  return {
    horizon_years: Math.max(1, Math.round(horizonYears)),
    monthly_contribution: monthlyContribution,
    capital_on_hand: capitalOnHand,
    goal_target: goalTarget,
  }
}

function MetricCard({ label, value, suffix, delta, deltaLabel, description, icon: Icon, color, delay = '', dataTour }) {
  const isPos = delta >= 0
  const displayValue = typeof value === 'number'
    ? (suffix ? value.toFixed(1) : formatCurrency(value))
    : value
  return (
    <div data-tour={dataTour} className={`card-premium p-5 flex flex-col gap-3 cursor-default anim-fade-up ${delay}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
        {Icon && (
          <div className="flex items-center justify-center rounded-lg"
            style={{ width: 32, height: 32, background: `${color || 'var(--gold)'}18`, color: color || 'var(--gold-light)' }}>
            <Icon size={15} />
          </div>
        )}
      </div>
      <div>
        <span className="font-display font-semibold"
          style={{ fontSize: 32, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          {displayValue}{suffix && value != null && <span className="font-display text-2xl" style={{ color: 'var(--text-secondary)' }}>{suffix}</span>}
        </span>
      </div>
      {delta !== undefined && value != null && (
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {isPos
            ? <ArrowUpRight size={13} style={{ color: 'var(--emerald)' }} />
            : <ArrowDownRight size={13} style={{ color: 'var(--ruby)' }} />}
          <span style={{ color: isPos ? 'var(--emerald)' : 'var(--ruby)' }}>
            {formatPercent(Math.abs(delta), true)}
          </span>
          {deltaLabel && <span style={{ color: 'var(--text-muted)' }}>{deltaLabel}</span>}
        </div>
      )}
      {description && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      )}
    </div>
  )
}

function AssetRow({ label, value, percent, icon: Icon, color }) {
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center justify-center rounded-lg"
        style={{ width: 32, height: 32, background: `${color}18`, color, flexShrink: 0 }}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        <div className="mt-1.5 h-1 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: color }} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
          {formatCurrency(value, true)}
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{percent.toFixed(0)}%</div>
      </div>
    </div>
  )
}

export default function Dashboard({ onboardResult }) {
  const [projection, setProjection] = useState(null)
  const [projectionLoading, setProjectionLoading] = useState(false)
  const [projectionError, setProjectionError] = useState(null)
  const profile = getProfile(onboardResult)
  const snapshot = onboardResult?.financial_analysis?.snapshot ?? {}
  const risk = onboardResult?.financial_analysis?.risk
  const portfolio = onboardResult?.portfolio ?? null

  const netWorth = numberOrNull(snapshot.net_worth_estimate)
  const totalDebt = numberOrNull(snapshot.total_debt)
  const cashFlow = numberOrNull(snapshot.monthly_surplus)
  const savingsRate = numberOrNull(snapshot.savings_rate_pct)
  const monthlyIncome = numberOrNull(snapshot.monthly_income)
  const monthlyExpenses = numberOrNull(snapshot.monthly_expenses)
  const totalAssets = netWorth != null && totalDebt != null ? netWorth + totalDebt : null
  const score = retirementScoreFromAnalysis(onboardResult)
  const assets = getAssetRows(profile)
  const liabilities = getLiabilityRows(onboardResult, profile)
  const retirementYear = numberOrNull(profile.horizon_years) ? new Date().getFullYear() + Number(profile.horizon_years) : null

  useEffect(() => {
    let cancelled = false

    if (!portfolio?.weights) {
      setProjection(null)
      setProjectionError(null)
      setProjectionLoading(false)
      return () => { cancelled = true }
    }

    setProjectionLoading(true)
    setProjectionError(null)
    import('../api/greenlightClient')
      .then((client) => {
        const postProjection = client.postProjection
        if (typeof postProjection !== 'function') {
          throw new Error('Projection endpoint wrapper is not available.')
        }
        return postProjection({
          weights: portfolio.weights,
          ...getProjectionInputs(onboardResult, profile),
          generator: 'stationary_bootstrap',
          n_paths: 10000,
        })
      })
      .then((response) => {
        if (!cancelled) setProjection(response)
      })
      .catch((error) => {
        if (!cancelled) {
          setProjection(null)
          setProjectionError(error?.message ?? 'Projection could not be loaded.')
        }
      })
      .finally(() => {
        if (!cancelled) setProjectionLoading(false)
      })

    return () => { cancelled = true }
  }, [onboardResult, portfolio, profile])

  const snapshotRows = [
    { label: 'Monthly Income', value: monthlyIncome, positive: true },
    { label: 'Monthly Expenses', value: monthlyExpenses, positive: false },
    { label: 'Monthly Surplus', value: cashFlow, positive: (cashFlow ?? 0) >= 0 },
  ].filter(row => row.value != null)

  return (
    <div role="main" className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <header className="flex items-center justify-between px-8 py-5 anim-fade-up"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <div>
          <h1 className="font-display font-semibold"
            style={{ fontSize: 22, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Retirement Dashboard
          </h1>
          <p aria-live="polite" className="text-xs mt-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
            {onboardResult
              ? `Updated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Values from onboarding analysis`
              : 'No onboarding analysis available yet'}
          </p>
        </div>
      </header>

      <div className="flex-1 p-7 space-y-5">
        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
          <div data-tour="net-worth" className="card-premium p-5 anim-fade-up d100 transition-all cursor-default"
            style={{ position: 'relative', overflow: 'hidden' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Total Net Worth
                </div>
                <div className="font-display font-semibold"
                  style={{ fontSize: 48, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
                  {formatMaybeCurrency(netWorth, true)}
                </div>
              </div>
              <div className="flex items-center justify-center rounded-xl"
                style={{ width: 40, height: 40, background: 'rgba(196,154,44,0.12)', color: 'var(--gold-light)' }}>
                <DollarSign size={18} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Assets</div>
                <div className="font-mono font-medium" style={{ color: 'var(--emerald)', fontSize: 16 }}>
                  {formatMaybeCurrency(totalAssets, true)}
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Liabilities</div>
                <div className="font-mono font-medium" style={{ color: 'var(--ruby)', fontSize: 16 }}>
                  {formatMaybeCurrency(totalDebt, true)}
                </div>
              </div>
            </div>
          </div>

          <div data-tour="retirement-score" className="card-premium p-4 anim-fade-up d150 cursor-default">
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
              Retirement Readiness
            </div>
            <RetirementScore score={score} />
          </div>

          <MetricCard
            label="Monthly Cash Flow"
            value={cashFlow ?? 'Not available'}
            delta={cashFlow == null ? undefined : cashFlow > 0 ? 1 : -1}
            deltaLabel="from analysis"
            icon={TrendingUp}
            color="var(--emerald)"
            delay="d200"
          />

          <MetricCard
            label="Savings Rate"
            value={savingsRate ?? 'Not available'}
            suffix="%"
            description="Share of income you save each month: (income - expenses) / income."
            icon={Target}
            color="var(--blue)"
            delay="d250"
            dataTour="savings-rate"
          />
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div data-tour="projection" className="card-premium p-5 anim-fade-up d300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Portfolio Projection
                </div>
                <div className="font-display font-semibold text-lg"
                  style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {portfolio ? 'Retirement Wealth Forecast' : 'Projection unavailable'}
                </div>
              </div>
            </div>
            {!portfolio ? (
              <div
                className="flex items-center justify-center text-sm"
                style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
              >
                Portfolio weights are required before a projection can run.
              </div>
            ) : projectionLoading && !projection ? (
              <div
                className="flex items-center justify-center text-sm"
                style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
              >
                Running Monte Carlo projection...
              </div>
            ) : projectionError ? (
              <div
                className="flex items-center justify-center text-sm"
                style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
              >
                {projectionError}
              </div>
            ) : (
              <ProjectionChart projection={projection} onboardResult={onboardResult} retirementYear={retirementYear} />
            )}
          </div>

          <div className="card-premium p-5 anim-fade-up d350">
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Asset Breakdown
            </div>
            {assets.length > 0
              ? assets.map(({ label, value, percent, type }) => {
                  const { icon, color } = ASSET_ICONS[type] ?? ASSET_ICONS.other
                  return <AssetRow key={label} label={label} value={value} percent={percent} icon={icon} color={color} />
                })
              : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No asset accounts were provided during onboarding.</p>}
            <div className="mt-4 pt-3 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Total Assets</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                {formatMaybeCurrency(totalAssets, true)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="card-premium p-5 anim-fade-up d400">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={13} style={{ color: 'var(--gold-light)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Path To Greenlight
              </div>
            </div>
            {(onboardResult?.financial_analysis?.path_to_greenlight?.steps ?? []).length > 0 ? (
              onboardResult.financial_analysis.path_to_greenlight.steps.map((item) => (
                <div key={`${item.step}-${item.action}`} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--bg-elevated)', border: '1.5px solid var(--border-bright)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.action}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {item.target_amount != null ? `${formatCurrency(Number(item.target_amount))} target` : 'No dollar target'}{item.months_estimated != null ? ` · ${item.months_estimated} months` : ''}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No path-to-greenlight steps were returned.</p>
            )}
          </div>

          <div className="card-premium p-5 anim-fade-up d450">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={13} style={{ color: 'var(--ruby)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Liabilities
              </div>
            </div>
            {liabilities.length > 0 ? liabilities.map((item) => {
              const { icon: Icon, color } = LIABILITY_ICONS[item.type] ?? LIABILITY_ICONS.other
              const hasDiscount = item.effectiveApr != null && item.apr != null && item.effectiveApr < item.apr
              return (
                <div key={item.id} className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-center rounded-lg shrink-0"
                    style={{ width: 32, height: 32, background: `${color}18`, color }}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                    {item.apr != null && (
                      <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {(item.apr * 100).toFixed(2)}% APR
                        {hasDiscount && (
                          <span style={{ color: 'var(--emerald)', marginLeft: 4 }}>
                            to {(item.effectiveApr * 100).toFixed(2)}% effective
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="font-mono text-sm font-medium shrink-0" style={{ color: 'var(--ruby)' }}>
                    {formatCurrency(item.balance, true)}
                  </div>
                </div>
              )
            }) : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No debts were provided during onboarding.</p>}
            <div className="mt-4 pt-3 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Total Debt</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--ruby)' }}>
                {formatMaybeCurrency(totalDebt, true)}
              </span>
            </div>
          </div>

          <div className="card-premium p-5 anim-fade-up d500">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={13} style={{ color: 'var(--emerald)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Monthly Snapshot
              </div>
            </div>
            {snapshotRows.length > 0 ? snapshotRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                <span className="font-mono text-sm font-medium" style={{ color: row.positive ? 'var(--emerald)' : 'var(--text-primary)' }}>
                  {row.positive ? '+' : ''}{formatCurrency(row.value)}
                </span>
              </div>
            )) : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No monthly snapshot was returned.</p>}
            <div className="mt-3 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Net Cash Flow</span>
              <span className="font-mono font-semibold" style={{ color: (cashFlow ?? 0) >= 0 ? 'var(--emerald)' : 'var(--ruby)', fontSize: 16 }}>
                {cashFlow == null ? 'Not available' : `${cashFlow >= 0 ? '+' : ''}${formatCurrency(cashFlow)}`}
              </span>
            </div>
            {risk?.label && (
              <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                Risk label: <span style={{ color: 'var(--text-secondary)' }}>{risk.label}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
