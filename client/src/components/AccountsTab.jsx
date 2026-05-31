import { useState } from 'react'
import {
  Building, Briefcase, Home, TrendingUp, PiggyBank, Car,
  CreditCard, Plus, ExternalLink, ShieldCheck, Lock, ArrowRight, X
} from 'lucide-react'
import { formatCurrency, formatPercent, numberOrNull } from '../lib/utils'

const ASSET_ICONS = {
  retirement: { icon: Briefcase, color: '#ddb84a', bg: 'rgba(221, 184, 74, 0.1)' },
  home:       { icon: Home,      color: '#4a72e8', bg: 'rgba(74, 114, 232, 0.1)' },
  brokerage:  { icon: TrendingUp,color: '#1eb87a', bg: 'rgba(30, 184, 122, 0.1)' },
  savings:    { icon: PiggyBank, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
  vehicle:    { icon: Car,       color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)' },
  other:      { icon: Building,  color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)' },
}

const LIABILITY_ICONS = {
  mortgage:     { icon: Building,  color: '#4a72e8', bg: 'rgba(74, 114, 232, 0.1)' },
  auto:         { icon: Car,       color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
  student:      { icon: Briefcase, color: '#e64545', bg: 'rgba(230, 69, 69, 0.1)' },
  student_loan: { icon: Briefcase, color: '#e64545', bg: 'rgba(230, 69, 69, 0.1)' },
  credit_card:  { icon: CreditCard,color: '#e64545', bg: 'rgba(230, 69, 69, 0.1)' },
  other:        { icon: CreditCard,color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)' },
}

const ACCOUNTS_PAGE_STYLE = {
  background: 'color-mix(in srgb, var(--bg-surface) 92%, var(--bg-base))',
}

const ACCOUNTS_SURFACE_STYLE = {
  background: 'var(--bg-surface)',
  boxShadow: '0 14px 38px rgba(0, 0, 0, 0.08)',
}

function titleize(value) {
  return String(value || 'Other').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function firstPresent(...values) {
  return values.find(value => value != null && value !== '')
}

function formatProfilePercent(value) {
  const num = numberOrNull(value)
  if (num == null) return '—'
  return formatPercent(Math.abs(num) <= 1 ? num * 100 : num)
}

function AccountCard({ account, isLiability }) {
  const [open, setOpen] = useState(false)
  const config = isLiability
    ? (LIABILITY_ICONS[account.type] || LIABILITY_ICONS.other)
    : (ASSET_ICONS[account.type] || ASSET_ICONS.other)
  const Icon = config.icon
  const isExpandable = isLiability || account.details?.length > 0
  const rowContent = (
    <>
      <div
        className="flex items-center justify-center rounded-xl shrink-0"
        style={{ width: 48, height: 48, background: config.bg, color: config.color }}
      >
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-primary truncate group-hover:text-gold-light transition-colors">
            {account.label}
          </div>
          <div className={`text-lg font-mono font-semibold ${isLiability ? 'text-ruby' : 'text-emerald'}`}>
            {formatCurrency(account.balance, true)}
          </div>
        </div>
        {isExpandable && (
          <div className="flex items-center justify-between mt-0.5">
            <div className="text-xs text-muted truncate">
              {account.subtitle}
            </div>
            <div className="flex items-center gap-1 text-gold-light">
              <span className="text-[10px] font-bold uppercase tracking-widest">Details</span>
              <ArrowRight size={10} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
            </div>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="card-premium p-5 transition-all hover:border-gold-light group" style={ACCOUNTS_SURFACE_STYLE}>
      {isExpandable ? (
        <button type="button" className="w-full flex items-center gap-4 text-left" onClick={() => setOpen(!open)}>
          {rowContent}
        </button>
      ) : (
        <div className="w-full flex items-center gap-4 text-left">
          {rowContent}
        </div>
      )}

      {open && (
        <div className="mt-4 pt-4 grid grid-cols-1 gap-2 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
          {isLiability ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted">APR</span>
                <span className="font-mono text-primary">{account.apr != null ? formatPercent(account.apr * 100) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Monthly interest cost</span>
                <span className="font-mono text-primary">{account.monthly_interest_cost != null ? formatCurrency(account.monthly_interest_cost) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Months to payoff</span>
                <span className="font-mono text-primary">{account.months_to_payoff != null ? account.months_to_payoff : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Optimized payoff month</span>
                <span className="font-mono text-primary">{account.optimized_payoff_month != null ? account.optimized_payoff_month : 'Not provided'}</span>
              </div>
            </>
          ) : (
            account.details.map(detail => (
              <div key={detail.label} className="flex justify-between gap-4">
                <span className="text-muted">{detail.label}</span>
                <span className="font-mono text-primary text-right">{detail.value}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function LinkModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="card-premium p-6 max-w-md w-full mx-4 bg-surface" style={ACCOUNTS_SURFACE_STYLE}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="font-display font-semibold text-xl text-primary">Plaid connection pending</div>
            <div className="text-xs text-muted mt-1">Live account linking is not connected in this build.</div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-bg-elevated text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="text-sm text-secondary leading-relaxed">
          The accounts shown here come only from your onboarding profile and analysis. Once Plaid is wired, this button can launch the secure account-link flow and replace manually entered balances with live account data.
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 px-4 py-2 bg-gold text-bg-base rounded-lg text-sm font-bold hover:bg-gold-bright transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

export default function AccountsTab({ onboardResult, embedded = false }) {
  const [showLinkModal, setShowLinkModal] = useState(false)
  const profile = onboardResult?.validated_profile ?? {}
  const snapshot = onboardResult?.financial_analysis?.snapshot ?? {}
  const homeAddress = firstPresent(profile.address, onboardResult?.user?.address, 'Address not on file')
  const debtAnalysis = onboardResult?.financial_analysis?.debt ?? {}
  const payoffPlan = onboardResult?.financial_analysis?.debt_payoff_plan ?? onboardResult?.debt_payoff_plan
  const payoffByKind = new Map((payoffPlan?.per_debt ?? []).map(item => [item.kind, item]))
  const debts = Array.isArray(debtAnalysis.debts) && debtAnalysis.debts.length > 0
    ? debtAnalysis.debts
    : Array.isArray(profile.debts) ? profile.debts : []
  const incomeFields = [
    { label: 'Household Income', value: numberOrNull(profile.household_income), cadence: 'Annual' },
    { label: 'Monthly Income', value: numberOrNull(snapshot.monthly_income), cadence: 'Monthly' },
    { label: 'Monthly Expenses', value: numberOrNull(snapshot.monthly_expenses ?? profile.monthly_expenses), cadence: 'Monthly' },
    { label: 'Monthly Surplus', value: numberOrNull(snapshot.monthly_surplus ?? profile.monthly_surplus), cadence: 'Monthly' },
  ].filter(item => item.value != null)

  const assets = [
    {
      label: 'Liquid Cash',
      balance: numberOrNull(profile.capital_on_hand),
      type: 'savings',
      subtitle: 'validated_profile.capital_on_hand',
      key: 'capital_on_hand',
    },
    {
      label: 'Emergency Fund',
      balance: numberOrNull(profile.emergency_fund),
      type: 'savings',
      subtitle: 'validated_profile.emergency_fund',
      key: 'emergency_fund',
    },
    {
      label: '401(k)',
      balance: numberOrNull(profile.balance_401k),
      type: 'retirement',
      subtitle: 'validated_profile.balance_401k',
      key: 'balance_401k',
      details: [
        { label: 'Current balance', value: formatCurrency(profile.balance_401k) },
        { label: 'Annual contribution', value: formatCurrency(profile.pretax_401k) },
        { label: 'Employer match rate', value: formatProfilePercent(profile.employer_match_rate) },
        { label: 'Employer match cap', value: formatProfilePercent(profile.employer_match_cap_pct) },
      ],
    },
    {
      label: 'IRA',
      balance: numberOrNull(profile.ira_balance),
      type: 'retirement',
      subtitle: 'validated_profile.ira_balance',
      key: 'ira_balance',
      details: [
        { label: 'Current balance', value: formatCurrency(profile.ira_balance) },
        { label: 'Annual contribution', value: formatCurrency(profile.pretax_ira) },
      ],
    },
    {
      label: 'HSA',
      balance: numberOrNull(profile.hsa_balance),
      type: 'retirement',
      subtitle: 'validated_profile.hsa_balance',
      key: 'hsa_balance',
      details: [
        { label: 'Current balance', value: formatCurrency(profile.hsa_balance) },
        { label: 'Annual contribution', value: formatCurrency(profile.pretax_hsa) },
      ],
    },
    {
      label: 'Stocks & Brokerage',
      balance: numberOrNull(profile.non_liquid_savings),
      type: 'brokerage',
      subtitle: 'validated_profile.non_liquid_savings',
      key: 'non_liquid_savings',
    },
    {
      label: 'Primary Home',
      balance: numberOrNull(profile.home_value),
      type: 'home',
      subtitle: 'validated_profile.home_value',
      key: 'home_value',
      details: [
        { label: 'Address', value: homeAddress },
        { label: 'Home value', value: formatCurrency(profile.home_value) },
      ],
    },
  ]

  const displayAssets = assets.filter(asset => asset.balance != null && asset.balance > 0)
  const totalAssets = displayAssets.reduce((sum, asset) => sum + asset.balance, 0)
  const liabilities = debts
    .map((debt, index) => {
      const balance = numberOrNull(firstPresent(debt.balance, debt.current_balance, debt.total_balance))
      if (balance == null || balance <= 0) return null
      const kind = firstPresent(debt.kind, debt.type, debt.category, debt.name, debt.label, 'other')
      const apr = numberOrNull(firstPresent(debt.apr, debt.interest_rate, debt.effective_apr))
      return {
        label: titleize(kind),
        balance,
        type: String(kind),
        subtitle: apr != null ? `${formatPercent(apr * 100)} APR` : 'Debt from profile',
        apr,
        monthly_interest_cost: numberOrNull(firstPresent(debt.monthly_interest_cost, debt.monthly_interest)),
        months_to_payoff: numberOrNull(firstPresent(debt.months_to_payoff, debt.payoff_months)),
        optimized_payoff_month: numberOrNull(payoffByKind.get(kind)?.payoff_month),
        key: `${kind}-${index}`,
      }
    })
    .filter(Boolean)
  const rowDebtTotal = liabilities.reduce((sum, liability) => sum + liability.balance, 0)
  const totalDebt = liabilities.length > 0
    ? rowDebtTotal
    : numberOrNull(debtAnalysis.total_balance ?? snapshot.total_debt) ?? (displayAssets.length > 0 ? 0 : null)
  const netWorth = displayAssets.length > 0 && totalDebt != null
    ? totalAssets - totalDebt
    : numberOrNull(snapshot.net_worth_estimate)

  return (
    <div className={embedded ? 'flex flex-col bg-base' : 'flex flex-col h-full bg-base overflow-y-auto'} style={embedded ? { background: 'transparent' } : ACCOUNTS_PAGE_STYLE}>
      <div className={embedded ? 'px-8 py-6 border-y border-border bg-surface' : 'px-8 py-6 border-b border-border bg-surface sticky top-0 z-10'} style={{ background: 'var(--bg-surface)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-semibold text-2xl text-primary leading-none">
              {embedded ? 'Accounts & Holdings' : 'Accounts'}
            </h1>
            <p className="text-xs text-muted mt-2 tracking-wide uppercase font-semibold">
              {displayAssets.length + liabilities.length} Profile-Backed Items
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-bg-base rounded-lg text-sm font-bold hover:bg-gold-bright transition-colors"
          >
            <Plus size={16} strokeWidth={3} />
            Link Account
          </button>
        </div>
      </div>

      <div data-tour="accounts-holdings" className="p-8 space-y-10 max-w-6xl">
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-6 bg-gold rounded-full" />
              <h2 className="font-display font-semibold text-xl text-primary">Income</h2>
            </div>
          </div>
          {incomeFields.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {incomeFields.map(item => (
                <div key={item.label} className="card-premium p-5" style={ACCOUNTS_SURFACE_STYLE}>
                  <div className="text-xs font-bold text-muted uppercase tracking-widest">{item.cadence}</div>
                  <div className="mt-1 text-sm font-medium text-primary">{item.label}</div>
                  <div className="mt-3 text-xl font-mono font-bold text-emerald">
                    {formatCurrency(item.value, true)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-premium p-8 text-center text-sm text-muted" style={ACCOUNTS_SURFACE_STYLE}>
              No income fields were provided during onboarding.
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-6 bg-emerald rounded-full" />
              <h2 className="font-display font-semibold text-xl text-primary">Assets</h2>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-muted uppercase tracking-widest">Total Profile Assets</div>
              <div className="text-xl font-mono font-bold text-emerald">
                {formatCurrency(totalAssets, true)}
              </div>
              {netWorth != null && (
                <div className="text-[10px] font-mono text-muted mt-1">
                  Net worth {formatCurrency(netWorth, true)}
                </div>
              )}
            </div>
          </div>
          {displayAssets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayAssets.map((acc) => (
                <AccountCard key={acc.key} account={acc} />
              ))}
            </div>
          ) : (
            <div className="card-premium p-8 text-center text-sm text-muted" style={ACCOUNTS_SURFACE_STYLE}>
              No asset accounts were provided during onboarding.
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-6 bg-ruby rounded-full" />
              <h2 className="font-display font-semibold text-xl text-primary">Liabilities</h2>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-muted uppercase tracking-widest">Total Debt</div>
              <div className="text-xl font-mono font-bold text-ruby">
                {formatCurrency(totalDebt, true)}
              </div>
            </div>
          </div>
          {liabilities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liabilities.map((acc) => (
                <AccountCard key={acc.key} account={acc} isLiability />
              ))}
            </div>
          ) : (
            <div className="card-premium p-8 text-center text-sm text-muted" style={ACCOUNTS_SURFACE_STYLE}>
              No debts were provided during onboarding.
            </div>
          )}
        </section>

        <footer className="pt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card-premium p-6 bg-surface border-dashed" style={ACCOUNTS_SURFACE_STYLE}>
            <ShieldCheck size={24} className="text-gold mb-3" />
            <div className="text-sm font-semibold text-primary mb-1">Bank-Grade Security</div>
            <div className="text-xs text-muted leading-relaxed">
              Live account credentials are not stored by Mallard. This build is using profile-backed balances only.
            </div>
          </div>
          <div className="card-premium p-6 bg-surface border-dashed" style={ACCOUNTS_SURFACE_STYLE}>
            <Lock size={24} className="text-gold mb-3" />
            <div className="text-sm font-semibold text-primary mb-1">Read-Only Intent</div>
            <div className="text-xs text-muted leading-relaxed">
              Future account aggregation should be read-only unless explicit trading approval is added.
            </div>
          </div>
          <div className="card-premium p-6 bg-surface border-dashed" style={ACCOUNTS_SURFACE_STYLE}>
            <ExternalLink size={24} className="text-gold mb-3" />
            <div className="text-sm font-semibold text-primary mb-1">Plaid Not Connected</div>
            <div className="text-xs text-muted leading-relaxed">
              The Link Account button now explains the missing integration instead of showing sample institutions.
            </div>
          </div>
        </footer>
      </div>
      {showLinkModal && <LinkModal onClose={() => setShowLinkModal(false)} />}
    </div>
  )
}
