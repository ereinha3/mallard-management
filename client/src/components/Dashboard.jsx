import { useEffect, useState } from 'react'
import {
  TrendingUp, DollarSign, Target,
  Calendar, ArrowUpRight, ArrowDownRight,
  Home, Car, Briefcase, PiggyBank, CreditCard, Building, Landmark,
} from 'lucide-react'
import { formatCurrency, formatPercent, formatMoneyOrNull, numberOrNull } from '../lib/utils'
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

function formatMaybeCurrency(value, compact = false) {
  return value == null ? 'Not available' : formatMoneyOrNull(value, { compact, fallback: 'Not available' })
}

function nullableNumber(value) {
  return value == null ? null : numberOrNull(value)
}

function bucketStatus(bucket) {
  const contribution = nullableNumber(bucket?.annual_contribution) ?? 0
  if (contribution <= 0) {
    return { color: 'var(--text-muted)', background: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.22)' }
  }
  if (bucket?.is_maxed) {
    return { color: 'var(--emerald)', background: 'rgba(30,184,122,0.10)', border: 'rgba(30,184,122,0.28)' }
  }
  return { color: 'var(--gold-light)', background: 'rgba(221,184,74,0.10)', border: 'rgba(221,184,74,0.28)' }
}

function getProfile(onboardResult) {
  return onboardResult?.validated_profile ?? onboardResult?.profile ?? onboardResult ?? {}
}

function getAssetRows(profile) {
  const assetsObj = (profile.assets && typeof profile.assets === 'object') ? profile.assets : {}
  const hasHomeInAssets = Object.keys(assetsObj).some(key => key.toLowerCase().includes('home'))
  const rows = [
    { label: 'Liquid Cash', value: numberOrNull(profile.capital_on_hand), type: 'cash' },
    { label: 'Emergency Fund', value: numberOrNull(profile.emergency_fund), type: 'emergency' },
  ]

  if (!hasHomeInAssets) {
    rows.push({ label: 'House', value: numberOrNull(profile.home_value), type: 'home' })
  }
  rows.push({ label: 'Non-Liquid Savings', value: numberOrNull(profile.non_liquid_savings), type: 'other' })

  Object.entries(assetsObj).forEach(([key, value]) => {
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

function getProjectionInputs(onboardResult, profile) {
  const optimizer = onboardResult?.optimizer_input ?? {}
  const horizonYears = nullableNumber(optimizer.horizon_years ?? profile.horizon_years)
  const monthlyContribution = nullableNumber(optimizer.monthly_surplus ?? profile.monthly_contribution ?? profile.monthly_savings)
  const capitalOnHand = nullableNumber(optimizer.capital_on_hand ?? profile.capital_on_hand)
  const goalTarget = nullableNumber(optimizer.goal_target ?? profile.goal_target)

  if (horizonYears == null || monthlyContribution == null || capitalOnHand == null || goalTarget == null) {
    return null
  }

  return {
    horizon_years: Math.max(1, Math.round(horizonYears)),
    monthly_contribution: Math.max(0, monthlyContribution),
    capital_on_hand: Math.max(0, capitalOnHand),
    goal_target: Math.max(0, goalTarget),
  }
}

function MetricCard({ label, value, suffix, delta, deltaLabel, direction, directionLabel, description, icon: Icon, color, delay = '', dataTour }) {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null
  const numericDelta = nullableNumber(delta)
  const trendDirection = direction ?? (numericDelta == null ? null : numericDelta >= 0 ? 'up' : 'down')
  const isPos = trendDirection !== 'down'
  const trendText = numericDelta == null ? directionLabel : formatPercent(Math.abs(numericDelta), true)
  const displayValue = typeof value === 'number'
    ? (numericValue == null ? 'N/A' : suffix ? numericValue.toFixed(1) : formatCurrency(numericValue))
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
          {displayValue}{suffix && numericValue != null && <span className="font-display text-2xl" style={{ color: 'var(--text-secondary)' }}>{suffix}</span>}
        </span>
      </div>
      {trendDirection && trendText && value != null && (
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {isPos
            ? <ArrowUpRight size={13} style={{ color: 'var(--emerald)' }} />
            : <ArrowDownRight size={13} style={{ color: 'var(--ruby)' }} />}
          <span style={{ color: isPos ? 'var(--emerald)' : 'var(--ruby)' }}>
            {trendText}
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
  const taxBreakdown = onboardResult?.tax_breakdown ?? null
  const bucketPlan = onboardResult?.bucket_plan ?? null
  const risk = onboardResult?.financial_analysis?.risk
  const portfolio = onboardResult?.portfolio ?? null

  const netWorth = nullableNumber(snapshot.net_worth_estimate)
  const totalDebt = nullableNumber(snapshot.total_debt)
  const cashFlow = nullableNumber(snapshot.monthly_surplus)
  const savingsRate = nullableNumber(snapshot.savings_rate_pct)
  const monthlyIncome = nullableNumber(snapshot.monthly_income)
  const monthlyExpenses = nullableNumber(snapshot.monthly_expenses)
  const score = nullableNumber(onboardResult?.risk_profile?.capacity_score ?? risk?.capacity_score)
  const assets = getAssetRows(profile)
  const backendTotalAssets = nullableNumber(snapshot.total_assets)
  const assetRowsTotal = assets.length > 0 ? assets.reduce((sum, row) => sum + row.value, 0) : null
  const inferredTotalAssets = netWorth != null && totalDebt != null ? netWorth + totalDebt : null
  const totalAssets = backendTotalAssets ?? assetRowsTotal ?? inferredTotalAssets
  const liabilities = getLiabilityRows(onboardResult, profile)
  const retirementHorizonYears = nullableNumber(profile.horizon_years)

  useEffect(() => {
    let cancelled = false

    async function loadProjection() {
      if (!portfolio?.weights) {
        setProjection(null)
        setProjectionError(null)
        setProjectionLoading(false)
        return
      }

      setProjectionLoading(true)
      setProjectionError(null)
      try {
        const projectionInputs = getProjectionInputs(onboardResult, profile)
        if (!projectionInputs) {
          setProjection(null)
          setProjectionError('Projection inputs were not returned by the backend.')
          setProjectionLoading(false)
          return
        }
        const client = await import('../api/greenlightClient')
        const postProjection = client.postProjection
        if (typeof postProjection !== 'function') {
          throw new Error('Projection endpoint wrapper is not available.')
        }
        const response = await postProjection({
          weights: portfolio.weights,
          ...projectionInputs,
          generator: 'stationary_bootstrap',
          n_paths: 10000,
        })
        if (!cancelled) setProjection(response)
      } catch (error) {
        if (!cancelled) {
          setProjection(null)
          setProjectionError(error?.message ?? 'Projection could not be loaded.')
        }
      } finally {
        if (!cancelled) setProjectionLoading(false)
      }
    }

    loadProjection()

    return () => { cancelled = true }
  }, [onboardResult, portfolio, profile])

  const snapshotRows = [
    { label: 'Monthly Income', value: monthlyIncome, positive: true },
    { label: 'Monthly Expenses', value: monthlyExpenses, positive: false },
    { label: 'Monthly Surplus', value: cashFlow, positive: (cashFlow ?? 0) >= 0 },
  ].filter(row => row.value != null)
  const ficaTotal = taxBreakdown
    ? (numberOrNull(taxBreakdown.fica_social_security) ?? 0)
      + (numberOrNull(taxBreakdown.fica_medicare) ?? 0)
      + (numberOrNull(taxBreakdown.additional_medicare) ?? 0)
    : null
  const taxRows = taxBreakdown ? [
    { label: 'Gross Income', value: numberOrNull(taxBreakdown.gross_income) },
    { label: 'Pre-tax Deductions', value: numberOrNull(taxBreakdown.pretax_deductions) },
    { label: 'AGI', value: numberOrNull(taxBreakdown.agi) },
    { label: 'Federal Tax', value: numberOrNull(taxBreakdown.federal_income_tax) },
    { label: 'State Tax', value: numberOrNull(taxBreakdown.state_income_tax) },
    { label: 'Local Tax', value: numberOrNull(taxBreakdown.local_tax) },
    { label: 'FICA (SS + Medicare)', value: ficaTotal },
    { label: 'Total Tax', value: numberOrNull(taxBreakdown.total_tax) },
    {
      label: 'Effective Tax Rate',
      value: numberOrNull(taxBreakdown.effective_tax_rate),
      percent: true,
    },
    { label: 'Net Take-Home', value: numberOrNull(taxBreakdown.net_income), highlight: true },
  ] : []
  const bucketRows = bucketPlan?.buckets ?? []
  const bucketTaxSavings = nullableNumber(bucketPlan?.total_tax_savings)
  const bucketNetTakeHome = nullableNumber(bucketPlan?.net_income_after_optimization)

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
              Risk Capacity
            </div>
            <RetirementScore score={score} />
          </div>

          <MetricCard
            label="Monthly Cash Flow"
            value={cashFlow ?? 'Not available'}
            direction={cashFlow == null ? null : cashFlow >= 0 ? 'up' : 'down'}
            directionLabel={cashFlow == null ? null : cashFlow >= 0 ? 'Positive cash flow' : 'Negative cash flow'}
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
              <ProjectionChart projection={projection} onboardResult={onboardResult} retirementHorizonYears={retirementHorizonYears} />
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

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
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
                      {nullableNumber(item.target_amount) != null ? `${formatCurrency(nullableNumber(item.target_amount))} target` : 'No dollar target'}{nullableNumber(item.months_estimated) != null ? ` · ${Math.round(nullableNumber(item.months_estimated))} months` : ''}
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

          <div className="card-premium p-5 anim-fade-up d550">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={13} style={{ color: 'var(--gold-light)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Tax Breakdown
              </div>
            </div>
            {taxBreakdown ? (
              <>
                {taxRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                    <span className="font-mono text-sm font-medium text-right" style={{ color: row.highlight ? 'var(--emerald)' : 'var(--text-primary)' }}>
                      {row.value == null
                        ? 'Not available'
                        : row.percent
                          ? `${(row.value * 100).toFixed(1)}%`
                          : formatCurrency(row.value)}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Add your ZIP code to see your tax breakdown.
              </p>
            )}
          </div>
        </div>

        <div className="card-premium p-5 anim-fade-up d600">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Landmark size={14} style={{ color: 'var(--emerald)' }} />
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Tax Bucket Plan
                </div>
                <div className="font-display font-semibold text-lg"
                  style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Contribution Priority
                </div>
              </div>
            </div>
          </div>

          {bucketRows.length > 0 ? (
            <>
              <div className="space-y-2">
                {bucketRows.map((bucket) => {
                  const status = bucketStatus(bucket)
                  const contribution = numberOrNull(bucket.annual_contribution) ?? 0
                  const savings = numberOrNull(bucket.tax_savings) ?? 0
                  return (
                    <div key={bucket.name} className="grid items-center gap-3 rounded-lg px-3 py-3"
                      style={{
                        gridTemplateColumns: 'minmax(0, 1fr) minmax(150px, auto) minmax(120px, auto)',
                        background: status.background,
                        border: `1px solid ${status.border}`,
                      }}>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: status.color }}>
                          {bucket.name}
                        </div>
                        {bucket.notes && (
                          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                            {bucket.notes}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Recommended Annual</div>
                        <div className="font-mono text-sm font-medium" style={{ color: contribution > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {formatCurrency(contribution)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Tax Savings</div>
                        <div className="font-mono text-sm font-medium" style={{ color: savings > 0 ? 'var(--emerald)' : 'var(--text-muted)' }}>
                          {formatCurrency(savings)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 pt-3 flex items-center justify-between gap-4 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  Total tax savings: <span className="font-mono font-semibold" style={{ color: 'var(--emerald)' }}>{formatMoneyOrNull(bucketTaxSavings ?? undefined, { fallback: 'N/A' })}</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Net take-home after optimization: <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoneyOrNull(bucketNetTakeHome ?? undefined, { fallback: 'N/A' })}</span>
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Complete onboarding to see your optimized tax bucket plan.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
