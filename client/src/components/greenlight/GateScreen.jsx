import { useEffect, useState } from 'react'
import { XCircle, CheckCircle, ArrowRight, RefreshCw } from 'lucide-react'

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
  }, [target])
  return <>{prefix}{val.toLocaleString()}</>
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Pull the user's financial profile out of the onboard response.
 *  Ethan's backend may nest it under .profile or return it flat. */
function getProfile(gateResult) {
  return gateResult?.profile ?? gateResult ?? {}
}

/** High-APR debts are those above 8% APR (the market-return threshold). */
function getHighAprDebts(profile) {
  const debts = profile?.debts ?? []
  return debts.filter(d => (d.apr ?? d.interest_rate ?? 0) > 0.08)
}

function getLowAprDebts(profile) {
  const debts = profile?.debts ?? []
  return debts.filter(d => {
    const apr = d.apr ?? d.interest_rate ?? 0
    return apr > 0 && apr <= 0.08
  })
}

/** Derive halt reasons from the gate_result checks or infer from profile. */
function getHaltReasons(gateResult) {
  const profile = getProfile(gateResult)
  const checks = gateResult?.gate_result?.checks ?? {}

  const monthlyExpenses = profile?.monthly_expenses ?? 3200
  const efRequired = monthlyExpenses * 3
  const efCurrent = profile?.emergency_fund ?? 0
  const efShortfall = Math.max(0, efRequired - efCurrent)
  const efFailed = checks?.emergency_fund?.passed === false || efCurrent < efRequired

  const highAprDebts = getHighAprDebts(profile)
  const debtFailed = checks?.high_apr_debt?.passed === false || highAprDebts.length > 0

  const marketReturn = checks?.high_apr_debt?.market_return_after_tax ?? 0.064
  const highAprThreshold = 8

  return {
    efFailed,
    efCurrent,
    efRequired,
    efShortfall,
    monthlyExpenses,
    debtFailed,
    highAprDebts,
    marketReturn,
    highAprThreshold,
    lowAprDebts: getLowAprDebts(profile),
  }
}

// ── HALT screen ────────────────────────────────────────────────────────────

function HaltScreen({ onFix, gateResult }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 100) }, [])

  const r = getHaltReasons(gateResult)

  // Pick the worst high-APR debt for the display card (or show all if multiple)
  const worstDebt = r.highAprDebts[0] ?? null
  const debtApr = worstDebt ? Math.round((worstDebt.apr ?? worstDebt.interest_rate ?? 0.22) * 1000) / 10 : 22.0
  const debtBalance = worstDebt?.balance ?? worstDebt?.amount ?? 9000
  const debtLabel = worstDebt?.label ?? worstDebt?.type ?? 'Credit card'

  const marketReturnPct = Math.round(r.marketReturn * 10000) / 100
  const edgePp = Math.round((debtApr - marketReturnPct) * 10) / 10

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
          {/* Emergency fund */}
          {r.efFailed && (
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
                    ${r.efCurrent.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>3 months needed</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                    ${r.efRequired.toLocaleString()}
                  </span>
                </div>
                <div
                  className="h-px w-full my-1"
                  style={{ background: 'rgba(230,69,69,0.2)' }}
                />
                <div className="flex justify-between text-sm font-semibold">
                  <span style={{ color: 'var(--text-primary)' }}>Shortfall</span>
                  <span className="font-mono" style={{ color: 'var(--ruby)' }}>
                    <AnimatedNumber target={r.efShortfall} />
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
          {r.debtFailed && worstDebt && (
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
                    {debtApr.toFixed(1)}% guaranteed
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Market return (after tax)</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    ≈ {marketReturnPct.toFixed(1)}% uncertain
                  </span>
                </div>
                <div
                  className="h-px w-full my-1"
                  style={{ background: 'rgba(230,69,69,0.2)' }}
                />
                <div className="flex justify-between text-sm font-semibold">
                  <span style={{ color: 'var(--text-primary)' }}>Edge from payoff</span>
                  <span className="font-mono" style={{ color: 'var(--ruby)' }}>+{edgePp} pp</span>
                </div>
              </div>
              <div
                className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{ background: 'rgba(230,69,69,0.08)', color: 'var(--text-secondary)' }}
              >
                Paying down {debtApr.toFixed(1)}% APR debt is a risk-free, tax-free {debtApr.toFixed(1)}% return. No market investment reliably beats that.
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
          {(!r.efFailed || !r.debtFailed || !worstDebt) && (
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
                <strong style={{ color: 'var(--text-primary)' }}>${r.efRequired.toLocaleString()}</strong>{' '}
                (3 months of expenses).
              </li>
            )}
            {r.debtFailed && worstDebt && (
              <li>
                <span style={{ color: 'var(--gold-light)' }}>{r.efFailed ? '2.' : '1.'}</span>{' '}
                Pay off the{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  ${debtBalance.toLocaleString()} {debtLabel}
                </strong>{' '}
                at {debtApr.toFixed(1)}% APR in full.
              </li>
            )}
            <li>
              <span style={{ color: 'var(--gold-light)' }}>{(r.efFailed ? 1 : 0) + (r.debtFailed && worstDebt ? 1 : 0) + 1}.</span>{' '}
              Return here. The gate re-runs with your updated picture.
            </li>
          </ol>
          {lowAprDebt && (
            <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
              The {Math.round((lowAprDebt.apr ?? lowAprDebt.interest_rate ?? 0) * 1000) / 10}%{' '}
              {lowAprDebt.label ?? 'low-interest loan'} is below the {r.highAprThreshold}% threshold and won't block investing once the other issues are resolved.
            </div>
          )}
        </div>

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
          Fast-forward: situation fixed → re-run gate
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
  const monthlyExpenses = profile?.monthly_expenses ?? 3200
  const efAmount = profile?.emergency_fund ?? 10000
  const monthsCovered = monthlyExpenses > 0
    ? Math.round((efAmount / monthlyExpenses) * 10) / 10
    : 3.1
  const capital = profile?.capital_on_hand ?? profile?.capital ?? 7500
  const monthlyContrib = profile?.monthly_savings ?? profile?.monthly_contribution ?? 600

  const lowAprDebts = getLowAprDebts(profile)

  const passedChecks = [
    {
      label: 'Emergency Fund',
      value: `$${efAmount.toLocaleString()}`,
      sub: `${monthsCovered} months ✓`,
      detail: `Meets 3-month threshold`,
    },
    {
      label: 'No High-APR Debt',
      value: 'Cleared',
      sub: '0 debts > 8% APR ✓',
      detail: 'No high-interest liabilities blocking investing',
    },
    ...(lowAprDebts.length > 0 ? [{
      label: 'Low-Interest Debt',
      value: `$${(lowAprDebts[0].balance ?? lowAprDebts[0].amount ?? 14000).toLocaleString()} @ ${Math.round((lowAprDebts[0].apr ?? lowAprDebts[0].interest_rate ?? 0.045) * 1000) / 10}%`,
      sub: 'Noted, allowed ✓',
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
          {passedChecks.map(item => (
            <div
              key={item.label}
              className="rounded-2xl p-4 text-left"
              style={{
                background: 'rgba(30,184,122,0.06)',
                border: '1px solid rgba(30,184,122,0.2)',
              }}
            >
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(30,184,122,0.7)' }}>
                {item.label}
              </div>
              <div className="font-mono font-semibold" style={{ fontSize: 18, color: 'var(--text-primary)' }}>
                {item.value}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--emerald)' }}>{item.sub}</div>
              <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{item.detail}</div>
            </div>
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
              { step: '1', label: 'Risk profile → γ', note: 'Two-axis: tolerance + capacity' },
              { step: '2', label: 'ESG-filtered universe', note: 'Excl. fossil fuels, weapons' },
              { step: '3', label: `ERC optimizer + glidepath`, note: `$${capital.toLocaleString()} lump + $${monthlyContrib.toLocaleString()}/mo DCA` },
            ].map(s => (
              <div key={s.step} className="flex gap-3 items-start">
                <div
                  className="shrink-0 text-xs font-mono font-semibold flex items-center justify-center rounded-full"
                  style={{ width: 20, height: 20, background: 'rgba(196,154,44,0.2)', color: 'var(--gold-light)' }}
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
  if (status === 'halt') return <HaltScreen onFix={onFix} gateResult={gateResult} />
  return <GreenScreen onContinue={onContinue} gateResult={gateResult} />
}
