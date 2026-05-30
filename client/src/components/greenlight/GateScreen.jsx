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

// --- HALT screen ---
function HaltScreen({ onFix }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 100) }, [])

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
                <span className="font-mono font-semibold" style={{ color: 'var(--ruby)' }}>$1,500</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>3 months needed</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>$9,600</span>
              </div>
              <div
                className="h-px w-full my-1"
                style={{ background: 'rgba(230,69,69,0.2)' }}
              />
              <div className="flex justify-between text-sm font-semibold">
                <span style={{ color: 'var(--text-primary)' }}>Shortfall</span>
                <span className="font-mono" style={{ color: 'var(--ruby)' }}>
                  <AnimatedNumber target={8100} />
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

          {/* High-interest debt */}
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
                <span className="font-mono font-semibold" style={{ color: 'var(--emerald)' }}>22.0% guaranteed</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Market return (after tax)</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>≈ 6.4% uncertain</span>
              </div>
              <div
                className="h-px w-full my-1"
                style={{ background: 'rgba(230,69,69,0.2)' }}
              />
              <div className="flex justify-between text-sm font-semibold">
                <span style={{ color: 'var(--text-primary)' }}>Edge from payoff</span>
                <span className="font-mono" style={{ color: 'var(--ruby)' }}>+15.6 pp</span>
              </div>
            </div>
            <div
              className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
              style={{ background: 'rgba(230,69,69,0.08)', color: 'var(--text-secondary)' }}
            >
              Paying down 22% APR debt is a risk-free, tax-free 22% return. No market investment reliably beats that.
            </div>
            <div
              className="mt-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--ruby)' }}
            >
              ✕ HALT
            </div>
          </div>
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
            <li><span style={{ color: 'var(--gold-light)' }}>1.</span> Build emergency fund to <strong style={{ color: 'var(--text-primary)' }}>$9,600</strong> (3 months of expenses).</li>
            <li><span style={{ color: 'var(--gold-light)' }}>2.</span> Pay off the <strong style={{ color: 'var(--text-primary)' }}>$9,000 credit card</strong> at 22% APR in full.</li>
            <li><span style={{ color: 'var(--gold-light)' }}>3.</span> Return here. The gate re-runs with your updated picture.</li>
          </ol>
          <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            The 4.5% student loan is below the 8% threshold and won't block investing once the other issues are resolved.
          </div>
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

// --- GREENLIGHT screen ---
function GreenScreen({ onContinue }) {
  const [visible, setVisible] = useState(false)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    setTimeout(() => setVisible(true), 100)
    setTimeout(() => setPulse(true), 600)
  }, [])

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
        <div className="w-full grid gap-3 mb-8" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            {
              label: 'Emergency Fund',
              value: '$10,000',
              sub: '3.1 months ✓',
              detail: 'Meets 3-month threshold',
            },
            {
              label: 'No High-APR Debt',
              value: 'CC paid',
              sub: '0% remaining ✓',
              detail: 'Credit card cleared in full',
            },
            {
              label: 'Low-Interest Debt',
              value: '$14k @ 4.5%',
              sub: 'Noted, allowed ✓',
              detail: 'Below 8%, investing allowed alongside',
            },
          ].map(item => (
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
              { step: '3', label: 'ERC optimizer + glidepath', note: '$7,500 lump + $600/mo DCA' },
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

export default function GateScreen({ status, onContinue, onFix }) {
  if (status === 'halt') return <HaltScreen onFix={onFix} />
  return <GreenScreen onContinue={onContinue} />
}
