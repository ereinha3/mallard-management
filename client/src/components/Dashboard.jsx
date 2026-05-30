// Drop this file into client/src/components/Dashboard.jsx
// Replaces all hardcoded data with live calls to Gilbert's backend.
// Component structure, styling, and sub-components are unchanged.

import { useState } from 'react'
import {
  TrendingUp, DollarSign, Target,
  Calendar, ArrowUpRight, ArrowDownRight,
  Home, Car, Briefcase, PiggyBank, CreditCard, Building,
} from 'lucide-react'
import { formatCurrency, formatPercent } from '../lib/utils'
import RetirementScore from './RetirementScore'
import ProjectionChart from './ProjectionChart'
import { useFinancialProfile } from '../hooks/useFinancialProfile'

// ── Example user profile — replace with real form data ────────────────────
// In production this comes from your onboarding form / user state.
const EXAMPLE_PROFILE = {
  tax: {
    grossIncome: 170400,       // $14,200/mo × 12
    filingStatus: "single",
    state: "CA",
    age: 34,
    traditional401kContributions: 23000,
    hsaContributions: 0,
    studentLoanInterestPaid: 1200,
    mortgageInterestPaid: 0,
    charitableContributions: 0,
    stateAndLocalTaxesPaid: 0,
    shortTermCapitalGains: 0,
    longTermCapitalGains: 0,
    qualifiedDividends: 0,
    ordinaryDividends: 0,
    isSelfEmployed: false,
  },
  debts: [
    { id: "mortgage", label: "Mortgage",      type: "mortgage",     balance: 238000, apr: 0.0325, minimumPayment: 1150 },
    { id: "auto",     label: "Auto Loan",     type: "auto",         balance: 28000,  apr: 0.0510, minimumPayment: 520  },
    { id: "student",  label: "Student Loans", type: "student_loan", balance: 18000,  apr: 0.0575, minimumPayment: 210  },
  ],
  assets: {
    retirement401k: 680000,
    primaryHome:    480000,
    brokerage:      240000,
    savingsCash:    98000,
    vehicle:        30000,
    other:          0,
  },
  monthlySavingsContribution: 2800,
  retirementTargetYear: 2041,
}

// ── Icon map for asset/liability types ────────────────────────────────────
const ASSET_ICONS = {
  retirement: { icon: Briefcase, color: "#ddb84a" },
  home:       { icon: Home,      color: "#4a72e8" },
  brokerage:  { icon: TrendingUp,color: "#1eb87a" },
  savings:    { icon: PiggyBank, color: "#8b5cf6" },
  vehicle:    { icon: Car,       color: "#6b7280" },
  other:      { icon: DollarSign,color: "#6b7280" },
}

const LIABILITY_ICONS = {
  mortgage:     { icon: Building,  color: "#4a72e8" },
  auto:         { icon: Car,       color: "#8b5cf6" },
  student_loan: { icon: Briefcase, color: "#e64545" },
  credit_card:  { icon: CreditCard,color: "#e64545" },
  medical:      { icon: DollarSign,color: "#e64545" },
  other:        { icon: DollarSign,color: "#6b7280" },
}

// ── Sub-components (unchanged from Ben's originals) ───────────────────────

function MetricCard({ label, value, suffix, delta, deltaLabel, icon: Icon, color, className = '', style = {}, delay = '' }) {
  const isPos = delta >= 0
  const displayValue = typeof value === 'number'
    ? (suffix ? value.toFixed(1) : formatCurrency(value))
    : value
  return (
    <div
      className={`card-premium p-5 flex flex-col gap-3 cursor-default anim-fade-up ${delay} ${className}`}
      style={style}
    >
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
          {displayValue}{suffix && <span className="font-display text-2xl" style={{ color: 'var(--text-secondary)' }}>{suffix}</span>}
        </span>
      </div>
      {delta !== undefined && (
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

const CHART_SCENARIOS = ['base', 'optimistic', 'conservative']

// ── Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [scenario, setScenario] = useState('base')
  const { data, loading, error } = useFinancialProfile(EXAMPLE_PROFILE)

  // While loading, keep hardcoded fallback values so the UI doesn't flash blank
  const netWorth     = data?.totalNetWorth      ?? 1_240_000
  const totalAssets  = data?.totalAssets        ?? 1_528_000
  const totalDebt    = data?.totalLiabilities   ?? 284_000
  const cashFlow     = data?.netCashFlow        ?? 4_820
  const score        = data?.retirementScore    ?? 78
  const snapshot     = data?.monthlySnapshot    ?? [
    { label: 'Gross Income', value: 14200,  positive: true  },
    { label: 'Tax Withheld', value: -3840,  positive: false },
    { label: 'Debt Payments',value: -1880,  positive: false },
    { label: 'Investments',  value: -2800,  positive: false },
  ]
  const assets       = data?.assets             ?? []
  const liabilities  = data?.liabilities        ?? []
  const projections  = data?.projections        ?? null

  // Savings rate derived from snapshot
  const grossMonthly = snapshot.find(r => r.positive)?.value ?? 1
  const investRow    = snapshot.find(r => r.label === 'Investments')
  const savingsRate  = investRow ? Math.abs(investRow.value) / grossMonthly * 100 : 24.3

  return (
    <div role="main" className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 anim-fade-up"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <div>
          <h1 className="font-display font-semibold"
            style={{ fontSize: 22, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Retirement Dashboard
          </h1>
          <p aria-live="polite" className="text-xs mt-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
            {loading
              ? 'Calculating your profile...'
              : error
              ? `${error} (showing estimates)`
              : `Updated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}  ·  All values in USD`}
          </p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Projection scenario">
          {CHART_SCENARIOS.map((s) => (
            <button key={s} onClick={() => setScenario(s)}
              aria-pressed={scenario === s}
              className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all"
              style={{
                background: scenario === s ? 'var(--bg-elevated)' : 'transparent',
                color: scenario === s ? 'var(--gold-light)' : 'var(--text-muted)',
                border: scenario === s ? '1px solid var(--border-gold)' : '1px solid transparent',
                letterSpacing: '0.03em',
              }}>
              {s}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 p-7 space-y-5">
        {/* Top metric cards */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
          {/* Net Worth */}
          <div className="card-premium p-5 anim-fade-up d100 transition-all cursor-default"
            style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: 0, right: 0, width: 200, height: 200,
              background: 'radial-gradient(circle at 100% 0%, rgba(196,154,44,0.07) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Total Net Worth
                </div>
                <div className="font-display font-semibold"
                  style={{ fontSize: 48, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
                  {formatCurrency(netWorth, true)}
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
                  {formatCurrency(totalAssets, true)}
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Liabilities</div>
                <div className="font-mono font-medium" style={{ color: 'var(--ruby)', fontSize: 16 }}>
                  {formatCurrency(totalDebt, true)}
                </div>
              </div>
            </div>
          </div>

          {/* Retirement Score */}
          <div className="card-premium p-4 anim-fade-up d150 cursor-default">
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
              Retirement Score
            </div>
            <RetirementScore score={score} />
          </div>

          {/* Monthly Cash Flow */}
          <MetricCard
            label="Monthly Cash Flow"
            value={cashFlow}
            delta={cashFlow > 0 ? 1 : -1}
            deltaLabel="this mo."
            icon={TrendingUp}
            color="var(--emerald)"
            delay="d200"
          />

          {/* Savings Rate */}
          <MetricCard
            label="Savings Rate"
            value={savingsRate}
            suffix="%"
            icon={Target}
            color="var(--blue)"
            delay="d250"
          />
        </div>

        {/* Chart + Assets */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div className="card-premium p-5 anim-fade-up d300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Portfolio Projection
                </div>
                <div className="font-display font-semibold text-lg"
                  style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Retirement Wealth Forecast
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: '#1eb87a' }} />Optimistic</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: '#ddb84a' }} />Base</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: '#4a72e8' }} />Conservative</div>
              </div>
            </div>
            {/* Pass live projection data to Ben's chart; it falls back to its own data if null */}
            <ProjectionChart data={projections} />
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
              : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>}
            <div className="mt-4 pt-3 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Total Assets</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                {formatCurrency(totalAssets, true)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {/* Milestones — static for now, Phase 3 will drive these */}
          <div className="card-premium p-5 anim-fade-up d400">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={13} style={{ color: 'var(--gold-light)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Milestones
              </div>
            </div>
            {[
              { label: "Max 401(k) contribution",   date: "Completed Feb 2026",  done: true  },
              { label: "Emergency fund, 6 months", date: "Completed Dec 2025",  done: true  },
              { label: "Pay off student loans",     date: "Target Dec 2026",     done: false },
              { label: "Reach $1.5M net worth",     date: "Projected Q3 2027",   done: false },
              { label: "Retire",                    date: `Target Jan ${EXAMPLE_PROFILE.retirementTargetYear}`, done: false },
            ].map(({ label, date, done }) => (
              <div key={label} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: done ? 'var(--emerald)' : 'var(--bg-elevated)', border: done ? 'none' : '1.5px solid var(--border-bright)' }}>
                  {done && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#070910" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>{label}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{date}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Liabilities — live data with effective APR */}
          <div className="card-premium p-5 anim-fade-up d450">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={13} style={{ color: 'var(--ruby)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Liabilities
              </div>
            </div>
            {liabilities.map((item) => {
              const { icon: Icon, color } = LIABILITY_ICONS[item.type] ?? LIABILITY_ICONS.other
              const hasDiscount = item.effectiveApr < item.apr
              return (
                <div key={item.id} className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-center rounded-lg shrink-0"
                    style={{ width: 32, height: 32, background: `${color}18`, color }}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {(item.apr * 100).toFixed(2)}% APR
                      {hasDiscount && (
                        <span style={{ color: 'var(--emerald)', marginLeft: 4 }}>
                          → {(item.effectiveApr * 100).toFixed(2)}% effective
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-mono text-sm font-medium shrink-0" style={{ color: 'var(--ruby)' }}>
                    {formatCurrency(item.balance, true)}
                  </div>
                </div>
              )
            })}
            <div className="mt-4 pt-3 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Total Debt</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--ruby)' }}>
                {formatCurrency(totalDebt, true)}
              </span>
            </div>
          </div>

          {/* Monthly Snapshot — live data */}
          <div className="card-premium p-5 anim-fade-up d500">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={13} style={{ color: 'var(--emerald)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Monthly Snapshot
              </div>
            </div>
            {snapshot.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                <span className="font-mono text-sm font-medium" style={{ color: row.positive ? 'var(--emerald)' : 'var(--text-primary)' }}>
                  {row.positive ? '+' : ''}{formatCurrency(row.value)}
                </span>
              </div>
            ))}
            <div className="mt-3 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Net Cash Flow</span>
              <span className="font-mono font-semibold" style={{ color: cashFlow >= 0 ? 'var(--emerald)' : 'var(--ruby)', fontSize: 16 }}>
                {cashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
