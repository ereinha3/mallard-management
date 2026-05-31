import { useEffect, useState } from 'react'
import { XCircle, CheckCircle, ArrowRight, RefreshCw, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatPercent, numberOrNull } from '../../lib/utils'

function AnimatedNumber({ target, prefix = '$', duration = 1200 }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start = Math.min(start + step, target)
      setVal(Math.round(start))
      if (start >= target) clearInterval(timer)
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration])
  return <>{prefix}{val.toLocaleString()}</>
}

// ── helpers ────────────────────────────────────────────────────────────────

function getProfile(gateResult) {
  return gateResult?.validated_profile ?? {}
}

/** High-APR debts are those above 8% APR (the market-return threshold). */
function getHighAprDebts(profile, threshold = 0.08) {
  const debts = profile?.debts ?? []
  return debts.filter(d => numberOrNull(d.apr) > threshold)
}

function getLowAprDebts(profile) {
  const debts = profile?.debts ?? []
  return debts.filter(d => {
    const apr = numberOrNull(d.apr)
    return apr > 0 && apr <= 0.08
  })
}

function formatCheckLabel(key) {
  return String(key ?? 'check').replace(/_/g, ' ')
}

function formatDuration(months) {
  const total = Number(months)
  if (!Number.isFinite(total)) return 'Not available'
  const years = Math.floor(total / 12)
  const rem = total % 12
  return `${years} years ${rem} months`
}

function titleize(value) {
  return String(value || 'Debt').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function normalizeGateChecks(gateResult) {
  const rawChecks = gateResult?.gate_result?.checks ?? []
  if (Array.isArray(rawChecks)) {
    return rawChecks.map((check, index) => ({
      key: check.key ?? `check_${index + 1}`,
      status: check.status ?? 'warn',
      detail: check.detail ?? '',
    }))
  }

  return Object.entries(rawChecks).map(([key, value]) => ({
    key,
    status: value?.status ?? (value?.passed === true ? 'pass' : value?.passed === false ? 'fail' : 'warn'),
    detail: value?.detail ?? value?.reason ?? `${formatCheckLabel(key)} ${value?.passed === true ? 'passed' : value?.passed === false ? 'failed' : 'needs review'}.`,
  }))
}

function checkStyles(status, tone = 'green') {
  if (status === 'pass') {
    return {
      color: 'var(--emerald)',
      label: 'PASS',
      icon: CheckCircle,
      background: 'rgba(30,184,122,0.06)',
      border: '1px solid rgba(30,184,122,0.2)',
      muted: 'rgba(30,184,122,0.7)',
    }
  }
  if (status === 'fail') {
    return {
      color: 'var(--ruby)',
      label: 'FAIL',
      icon: XCircle,
      background: 'rgba(230,69,69,0.06)',
      border: '1px solid rgba(230,69,69,0.25)',
      muted: 'rgba(230,69,69,0.8)',
    }
  }
  return {
    color: tone === 'halt' ? 'var(--gold-light)' : 'var(--gold-light)',
    label: 'WARN',
    icon: AlertTriangle,
    background: 'rgba(196,154,44,0.06)',
    border: '1px solid rgba(196,154,44,0.25)',
    muted: 'rgba(196,154,44,0.75)',
  }
}

function GateCheckCard({ check, tone = 'green' }) {
  const styles = checkStyles(check.status, tone)
  const Icon = styles.icon

  return (
    <div
      className="rounded-2xl p-4 text-left"
      style={{
        background: styles.background,
        border: styles.border,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: styles.muted }}>
          {formatCheckLabel(check.key)}
        </div>
        <Icon size={15} style={{ color: styles.color, flexShrink: 0 }} />
      </div>
      <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: styles.color }}>
        {styles.label}
      </div>
      <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {check.detail || 'No detail returned.'}
      </div>
    </div>
  )
}

/** Derive halt reasons from the gate_result checks or infer from profile. */
function getHaltReasons(gateResult) {
  const profile = getProfile(gateResult)
  const snapshot = gateResult?.financial_analysis?.snapshot ?? {}
  const rawChecks = gateResult?.gate_result?.checks ?? {}
  const checks = Array.isArray(rawChecks)
    ? Object.fromEntries(rawChecks.map(check => [check.key, { passed: check.status === 'pass', ...check }]))
    : rawChecks

  const monthlyExpenses = numberOrNull(profile?.monthly_expenses ?? snapshot.monthly_expenses)
  const efMath = gateResult?.gate_result?.math?.emergency_fund
    ?? {}
  const efRequired = numberOrNull(efMath.target_balance
    ?? gateResult?.financial_analysis?.emergency_fund?.target_balance
    ?? (monthlyExpenses != null ? monthlyExpenses * 3 : null)
  )
  const efCurrent = numberOrNull(profile?.emergency_fund)
  const efShortfall = numberOrNull(efMath.shortfall
    ?? gateResult?.financial_analysis?.emergency_fund?.shortfall
    ?? gateResult?.financial_analysis?.snapshot?.emergency_fund_shortfall
    ?? (efRequired != null && efCurrent != null ? Math.max(0, efRequired - efCurrent) : null)
  )
  const efFailed = checks?.emergency_fund?.passed === false || (efCurrent != null && efRequired != null && efCurrent < efRequired)

  const highAprThreshold = 0.08
  const highAprDebts = getHighAprDebts(profile, highAprThreshold)
  const debtFailed = checks?.high_interest_debt?.passed === false || highAprDebts.length > 0

  const marketReturn = numberOrNull(
    gateResult?.gate_result?.math?.debt?.expected_after_tax_market_return
  )

  return {
    efFailed,
    efCurrent,
    efRequired,
    efShortfall,
    monthlyExpenses,
    debtFailed,
    highAprDebts,
    marketReturn,
    highAprThresholdPct: highAprThreshold * 100,
    lowAprDebts: getLowAprDebts(profile),
  }
}

function DebtPayoffSchedule({ gateResult }) {
  const plan = gateResult?.financial_analysis?.debt_payoff_plan ?? gateResult?.debt_payoff_plan
  const debts = gateResult?.financial_analysis?.debt?.debts ?? gateResult?.validated_profile?.debts ?? gateResult?.profile?.debts ?? []
  if (!plan || !Array.isArray(plan.per_debt) || plan.per_debt.length === 0) return null

  const debtByKind = new Map(debts.map(debt => [debt.kind ?? debt.type ?? debt.label, debt]))

  return (
    <div
      className="w-full rounded-2xl p-5 mb-8 text-left"
      style={{
        background: 'rgba(30,184,122,0.05)',
        border: '1px solid rgba(30,184,122,0.22)',
      }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--emerald)' }}>
            Consumer Debt Payoff Schedule
          </div>
          <div className="font-display font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
            {formatDuration(plan.months_to_freedom)} to debt freedom
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Cash freed after payoff</div>
          <div className="font-mono font-semibold" style={{ color: 'var(--emerald)' }}>
            {formatCurrency(plan.monthly_free_cash_after_payoff)}/mo
          </div>
        </div>
      </div>

      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Interest paid</div>
          <div className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(plan.total_interest_paid)}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Method</div>
          <div className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {titleize(plan.method)}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Saved vs snowball</div>
          <div className="font-mono text-sm font-semibold" style={{ color: 'var(--emerald)' }}>
            {plan.avalanche_vs_snowball_interest_saved != null ? formatCurrency(plan.avalanche_vs_snowball_interest_saved) : 'Not available'}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {plan.per_debt.map((item, index) => {
          const debt = debtByKind.get(item.kind) ?? {}
          const apr = Number(debt.apr)
          const balance = item.starting_balance ?? debt.balance
          return (
            <div
              key={`${item.kind}-${index}`}
              className="grid items-center gap-3 rounded-lg px-3 py-2"
              style={{ gridTemplateColumns: '1fr auto auto auto', background: 'var(--bg-elevated)' }}
            >
              <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{titleize(item.kind)}</div>
              <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                {Number.isFinite(apr) ? `${(apr * 100).toFixed(1)}% APR` : 'APR n/a'}
              </div>
              <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{formatCurrency(balance)}</div>
              <div className="text-xs font-mono font-semibold" style={{ color: 'var(--emerald)' }}>
                Month {item.payoff_month ?? 'n/a'}
              </div>
            </div>
          )
        })}
      </div>
      {plan.excluded_debt_kinds?.length > 0 && (
        <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          Excludes {plan.excluded_debt_kinds.map(titleize).join(', ')}
          {plan.excluded_debt_balance != null ? ` (${formatCurrency(plan.excluded_debt_balance)})` : ''} from aggressive payoff planning.
        </div>
      )}
    </div>
  )
}

// ── HALT screen ────────────────────────────────────────────────────────────

function HaltScreen({ onFix, gateResult }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 100) }, [])

  const r = getHaltReasons(gateResult)
  const gateChecks = normalizeGateChecks(gateResult)

  // Pick the worst high-APR debt for the display card (or show all if multiple)
  const worstDebt = r.highAprDebts[0] ?? null
  const debtApr = numberOrNull(worstDebt?.apr)
  const debtBalance = numberOrNull(worstDebt?.balance)
  const debtLabel = worstDebt?.kind ?? 'credit_card'

  const marketReturnPct = r.marketReturn != null ? r.marketReturn * 100 : null
  const debtAprPct = debtApr != null ? debtApr * 100 : null
  const edgePp = debtAprPct != null && marketReturnPct != null ? Math.round((debtAprPct - marketReturnPct) * 10) / 10 : null

  const lowAprDebt = r.lowAprDebts[0]

  return (
    <div
      className="flex flex-col items-center justify-center h-full relative overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Atmospheric glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(230,69,69,0.10) 0%, transparent 70%)',
      }} />
      <div style={{
        position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(230,69,69,0.07) 0%, transparent 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }} />

      <div
        className="flex flex-col items-center text-center"
        style={{
          maxWidth: 680,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
          zIndex: 1,
          padding: '0 24px',
        }}
      >
        {/* Icon */}
        <div
          className="flex items-center justify-center rounded-full mb-6"
          style={{
            width: 64, height: 64,
            background: 'rgba(230,69,69,0.12)',
            border: '1px solid rgba(230,69,69,0.3)',
          }}
        >
          <XCircle size={32} style={{ color: 'var(--ruby)' }} />
        </div>

        {/* Headline */}
        <div
          className="font-display font-semibold mb-2"
          style={{ fontSize: 56, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}
        >
          Not yet.
        </div>
        <div className="text-base mb-8" style={{ color: 'var(--text-secondary)', maxWidth: 440 }}>
          Investing now would hurt you. The math, not a judgment.
        </div>

        {/* Math cards */}
        <div className="w-full grid gap-4 mb-8" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {gateChecks.length > 0 && gateChecks.map(check => (
            <GateCheckCard key={check.key} check={check} tone="halt" />
          ))}

          {/* Emergency fund */}
          {gateChecks.length === 0 && r.efFailed && (
            <div
              className="rounded-2xl p-5 text-left"
              style={{
                background: 'rgba(230,69,69,0.06)',
                border: '1px solid rgba(230,69,69,0.25)',
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: 'rgba(230,69,69,0.8)', letterSpacing: '0.1em' }}
              >
                Check 1: Emergency Fund
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>You have</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--ruby)' }}>
                    {r.efCurrent != null ? formatCurrency(r.efCurrent) : 'Not available'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>3 months needed</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {r.efRequired != null ? formatCurrency(r.efRequired) : 'Not available'}
                  </span>
                </div>
                <div
                  className="h-px w-full my-1"
                  style={{ background: 'rgba(230,69,69,0.2)' }}
                />
                <div className="flex justify-between text-sm font-semibold">
                  <span style={{ color: 'var(--text-primary)' }}>Shortfall</span>
                  <span className="font-mono" style={{ color: 'var(--ruby)' }}>
                    {r.efShortfall != null ? <AnimatedNumber target={r.efShortfall} /> : 'Not available'}
                  </span>
                </div>
              </div>
              <div
                className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{ background: 'rgba(230,69,69,0.08)', color: 'var(--text-secondary)' }}
              >
                Without a safety net, an emergency forces high-APR borrowing, undoing any market gains instantly.
              </div>
              <div
                className="mt-2 text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--ruby)' }}
              >
                ✕ HALT
              </div>
            </div>
          )}

          {/* High-interest debt */}
          {gateChecks.length === 0 && r.debtFailed && worstDebt && (
            <div
              className="rounded-2xl p-5 text-left"
              style={{
                background: 'rgba(230,69,69,0.06)',
                border: '1px solid rgba(230,69,69,0.25)',
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: 'rgba(230,69,69,0.8)', letterSpacing: '0.1em' }}
              >
                Check 2: High-Interest Debt
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Paydown return</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--emerald)' }}>
                    {debtAprPct != null ? `${formatPercent(debtAprPct)} guaranteed` : 'APR not available'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Market return (after tax)</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {marketReturnPct != null ? `≈ ${formatPercent(marketReturnPct)} uncertain` : 'Not available'}
                  </span>
                </div>
                <div
                  className="h-px w-full my-1"
                  style={{ background: 'rgba(230,69,69,0.2)' }}
                />
                <div className="flex justify-between text-sm font-semibold">
                  <span style={{ color: 'var(--text-primary)' }}>Edge from payoff</span>
                  <span className="font-mono" style={{ color: 'var(--ruby)' }}>{edgePp != null ? `+${edgePp} pp` : 'Not available'}</span>
                </div>
              </div>
              <div
                className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{ background: 'rgba(230,69,69,0.08)', color: 'var(--text-secondary)' }}
              >
                Paying down high-APR debt is a risk-free, tax-free return. No market investment reliably beats high-interest debt.
              </div>
              <div
                className="mt-2 text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--ruby)' }}
              >
                ✕ HALT
              </div>
            </div>
          )}

          {/* If only one halt condition, show a placeholder second card with "What comes next" */}
          {gateChecks.length === 0 && (!r.efFailed || !r.debtFailed || !worstDebt) && (
            <div
              className="rounded-2xl p-5 text-left"
              style={{
                background: 'rgba(196,154,44,0.04)',
                border: '1px solid rgba(196,154,44,0.2)',
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: 'rgba(196,154,44,0.7)', letterSpacing: '0.1em' }}
              >
                After you fix this
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Once the blocking check is cleared, we'll re-run the full gate and build an ESG-screened portfolio tuned to your exact risk profile.
              </div>
            </div>
          )}
        </div>

        {/* Recommended action */}
        <div
          className="w-full rounded-2xl p-5 mb-8 text-left"
          style={{
            background: 'rgba(196,154,44,0.06)',
            border: '1px solid rgba(196,154,44,0.25)',
          }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: 'var(--gold-light)', letterSpacing: '0.1em' }}
          >
            Recommended path
          </div>
          <ol className="text-sm space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
            {r.efFailed && (
              <li>
                <span style={{ color: 'var(--gold-light)' }}>1.</span>{' '}
                Build emergency fund to{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{r.efRequired != null ? formatCurrency(r.efRequired) : 'the target amount'}</strong>{' '}
                (3 months of expenses).
              </li>
            )}
            {r.debtFailed && worstDebt && (
              <li>
                <span style={{ color: 'var(--gold-light)' }}>{r.efFailed ? '2.' : '1.'}</span>{' '}
                Pay off the{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {debtBalance != null ? `${formatCurrency(debtBalance)} ` : ''}{debtLabel.replace(/_/g, ' ')}
                </strong>{' '}
                {debtAprPct != null ? `at ${formatPercent(debtAprPct)} APR ` : ''}in full.
              </li>
            )}
            <li>
              <span style={{ color: 'var(--gold-light)' }}>{(r.efFailed ? 1 : 0) + (r.debtFailed && worstDebt ? 1 : 0) + 1}.</span>{' '}
              Return here. The gate re-runs with your updated picture.
            </li>
          </ol>
          {lowAprDebt && (
            <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
              The {numberOrNull(lowAprDebt.apr) != null ? formatPercent(numberOrNull(lowAprDebt.apr) * 100) : ''}{' '}
              {(lowAprDebt.kind ?? 'low-interest loan').replace(/_/g, ' ')} is below the {formatPercent(r.highAprThresholdPct)} threshold and won't block investing once the other issues are resolved.
            </div>
          )}
        </div>

        <DebtPayoffSchedule gateResult={gateResult} />

        <button
          onClick={onFix}
          className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm transition-all"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-bright)',
            color: 'var(--text-primary)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--gold-light)'
            e.currentTarget.style.color = 'var(--gold-light)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-bright)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
        >
          <RefreshCw size={14} />
          Re-run gate with updated profile
        </button>
      </div>
    </div>
  )
}

// ── GREEN screen ───────────────────────────────────────────────────────────

function GreenScreen({ onContinue, gateResult }) {
  const [visible, setVisible] = useState(false)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    setTimeout(() => setVisible(true), 100)
    setTimeout(() => setPulse(true), 600)
  }, [])

  const profile = getProfile(gateResult)
  const snapshot = gateResult?.financial_analysis?.snapshot ?? {}
  const monthlyExpenses = numberOrNull(profile?.monthly_expenses ?? snapshot.monthly_expenses)
  const efAmount = numberOrNull(profile?.emergency_fund)
  const monthsCovered = monthlyExpenses > 0 && efAmount != null
    ? Math.round((efAmount / monthlyExpenses) * 10) / 10
    : null
  const capital = numberOrNull(profile?.capital_on_hand ?? gateResult?.optimizer_input?.capital_on_hand)
  const monthlyContrib = numberOrNull(snapshot.monthly_surplus ?? gateResult?.optimizer_input?.monthly_surplus)

  const lowAprDebts = getLowAprDebts(profile)
  const gateChecks = normalizeGateChecks(gateResult)
  const passedChecks = gateChecks.length > 0 ? gateChecks : [
    {
      key: 'emergency_fund',
      status: 'pass',
      detail: monthsCovered != null
        ? `Emergency fund covers ${monthsCovered} months and meets the 3-month threshold.`
        : `Emergency fund ${efAmount != null ? formatCurrency(efAmount) : 'was accepted by the gate'}.`,
    },
    {
      key: 'high_interest_debt',
      status: 'pass',
      detail: 'No high-interest liabilities blocking investing',
    },
    ...(lowAprDebts.length > 0 ? [{
      key: 'low_interest_debt',
      status: 'pass',
      detail: 'Below 8%, investing allowed alongside',
    }] : []),
  ]

  return (
    <div
      className="flex flex-col items-center justify-center h-full relative overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Atmospheric emerald glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(30,184,122,0.10) 0%, transparent 70%)',
      }} />
      <div style={{
        position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(30,184,122,0.10) 0%, transparent 70%)',
        filter: 'blur(48px)',
        pointerEvents: 'none',
        animation: pulse ? 'glowPulse 3s ease-in-out infinite' : 'none',
      }} />

      <div
        className="flex flex-col items-center text-center"
        style={{
          maxWidth: 680,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
          zIndex: 1,
          padding: '0 24px',
        }}
      >
        {/* Icon */}
        <div
          className="flex items-center justify-center rounded-full mb-6"
          style={{
            width: 64, height: 64,
            background: 'rgba(30,184,122,0.12)',
            border: '1px solid rgba(30,184,122,0.4)',
          }}
        >
          <CheckCircle size={32} style={{ color: 'var(--emerald)' }} />
        </div>

        {/* Headline */}
        <div
          className="font-display font-semibold mb-2"
          style={{ fontSize: 56, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}
        >
          You're cleared.
        </div>
        <div className="text-base mb-8" style={{ color: 'var(--text-secondary)', maxWidth: 440 }}>
          All gate checks passed. We can now build a portfolio sized to what you can actually afford.
        </div>

        {/* Passed checks */}
        <div
          className="w-full grid gap-3 mb-8"
          style={{ gridTemplateColumns: `repeat(${passedChecks.length}, 1fr)` }}
        >
          {passedChecks.map(check => (
            <GateCheckCard key={check.key} check={check} />
          ))}
        </div>

        {/* Portfolio preview */}
        <div
          className="w-full rounded-2xl p-5 mb-8 text-left"
          style={{
            background: 'rgba(196,154,44,0.06)',
            border: '1px solid rgba(196,154,44,0.2)',
          }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--gold-light)', letterSpacing: '0.1em' }}
          >
            What's next
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[
              { step: 'Risk', label: 'Risk profile', note: 'Tolerance and capacity from backend analysis' },
              { step: 'Universe', label: 'Filtered universe', note: 'Exclusions returned by the optimizer universe' },
              { step: 'Capital', label: 'Portfolio sizing', note: `${capital != null ? `${formatCurrency(capital)} available capital` : 'Capital not available'}${monthlyContrib != null && monthlyContrib > 0 ? ` + ${formatCurrency(monthlyContrib)}/mo surplus` : ''}` },
            ].map(s => (
              <div key={s.step} className="flex gap-3 items-start">
                <div
                  className="shrink-0 text-xs font-mono font-semibold flex items-center justify-center rounded-full"
                  style={{ minWidth: 20, height: 20, padding: '0 7px', background: 'rgba(196,154,44,0.2)', color: 'var(--gold-light)' }}
                >
                  {s.step}
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DebtPayoffSchedule gateResult={gateResult} />

        <button
          onClick={onContinue}
          className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm transition-all"
          style={{
            background: 'linear-gradient(135deg, #1eb87a, #16a864)',
            color: '#070910',
          }}
        >
          Build my portfolio
          <ArrowRight size={15} />
        </button>
      </div>

      <style>{`
        @keyframes glowPulse {
          0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.6; transform: translateX(-50%) scale(1.08); }
        }
      `}</style>
    </div>
  )
}

export default function GateScreen({ status, onContinue, onFix, gateResult }) {
  if (status === 'greenlight' || status === 'green') return <GreenScreen onContinue={onContinue} gateResult={gateResult} />
  return <HaltScreen onFix={onFix} gateResult={gateResult} />
}
