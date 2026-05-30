import { useState, useEffect, useRef } from 'react'
import { Feather, CheckCircle } from 'lucide-react'

const buildScript = (name) => [
  {
    agent: `Welcome, ${name}. I'm Mallard, your personal wealth advisor. Before we build your plan, I need to understand your financial picture. Let's start simple. How old are you?`,
    userPrompt: 'Enter your age',
    profileKey: 'age',
    profileLabel: 'Age',
    formatProfile: (v) => `${v} years old`,
  },
  {
    agent: "Good. What's your annual household income, roughly? Include salary, freelance, or any other sources.",
    userPrompt: 'e.g. $85,000',
    profileKey: 'income',
    profileLabel: 'Annual income',
    formatProfile: (v) => v,
  },
  {
    agent: "How much do you spend each month on essentials? Think rent or mortgage, groceries, utilities, transportation.",
    userPrompt: 'e.g. $3,200 / month',
    profileKey: 'expenses',
    profileLabel: 'Monthly expenses',
    formatProfile: (v) => v,
  },
  {
    agent: "Do you carry any outstanding debt? Credit cards, student loans, a mortgage, auto loan — anything significant.",
    userPrompt: 'e.g. $12,000 student loan at 5% APR',
    profileKey: 'debt',
    profileLabel: 'Outstanding debt',
    formatProfile: (v) => v,
  },
  {
    agent: "What age are you aiming to retire? There's no wrong answer — this just shapes the timeline we're working toward.",
    userPrompt: 'e.g. 65',
    profileKey: 'retirementAge',
    profileLabel: 'Retirement target',
    formatProfile: (v) => `Age ${v}`,
  },
  {
    agent: "On a scale from cautious to aggressive, how do you feel about investment risk? A market drop of 20% in a year: what would you do?",
    userPrompt: "e.g. Moderate, I'd hold and not sell",
    profileKey: 'risk',
    profileLabel: 'Risk tolerance',
    formatProfile: (v) => v,
  },
  {
    agent: "Last one. Are there any values that should shape your investments? Some clients prefer to exclude fossil fuels, weapons, or specific industries. Others don't mind.",
    userPrompt: 'e.g. No fossil fuels or tobacco',
    profileKey: 'esg',
    profileLabel: 'Investment values',
    formatProfile: (v) => v,
  },
  {
    agent: "Perfect. I have everything I need. Give me a moment to build your plan.",
    userPrompt: null,
    profileKey: null,
    profileLabel: null,
    isFinal: true,
  },
]

function useTypewriter(text, speed = 22) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!text) { setDisplayed(''); setDone(true); return }
    setDisplayed('')
    setDone(false)
    let i = 0
    const t = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) { setDone(true); clearInterval(t) }
    }, speed)
    return () => clearInterval(t)
  }, [text])
  return { displayed, done }
}

function MallardBubble({ text, isActive }) {
  const { displayed, done } = useTypewriter(isActive ? text : text, isActive ? 22 : 0)
  const content = isActive ? displayed : text
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginTop: 2,
        background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Feather size={14} color="#070604" />
      </div>
      <div style={{
        maxWidth: 520, padding: '13px 17px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-bright)',
        borderTopLeftRadius: 4, borderTopRightRadius: 14,
        borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
        fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {content}
        {isActive && !done && (
          <span style={{
            display: 'inline-block', width: 2, height: 15,
            background: 'var(--gold-light)', marginLeft: 3,
            verticalAlign: 'text-bottom',
            animation: 'blink 1s step-end infinite',
          }} />
        )}
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        maxWidth: 420, padding: '12px 16px',
        background: 'rgba(176,128,16,0.10)',
        border: '1px solid rgba(176,128,16,0.22)',
        borderTopLeftRadius: 14, borderTopRightRadius: 4,
        borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
        fontSize: 14, lineHeight: 1.55, color: 'var(--text-primary)',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {text}
      </div>
    </div>
  )
}

function ProfileRow({ label, value }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 9, marginBottom: 8,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      animation: 'fadeUp 0.35s ease both',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontWeight: 500 }}>
        {value}
      </div>
    </div>
  )
}

function BuildingScreen() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(t); return 100 }
        return p + 2
      })
    }, 30)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 32, zIndex: 100,
      animation: 'fadeUp 0.5s ease both',
    }}>
      {/* Atmospheric glow */}
      <div style={{
        position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(176,128,16,0.08) 0%, transparent 70%)',
        filter: 'blur(60px)', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        {/* Logo */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather size={26} color="#070604" />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'Playfair Display, serif', fontSize: 40,
            fontWeight: 600, letterSpacing: '-0.03em',
            color: 'var(--text-primary)', lineHeight: 1, marginBottom: 10,
          }}>
            Building your plan.
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
            Analyzing your profile and calibrating your wealth roadmap...
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ width: 280 }}>
          <div style={{
            height: 2, borderRadius: 2,
            background: 'var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'linear-gradient(90deg, var(--gold), var(--gold-bright))',
              width: `${progress}%`,
              transition: 'width 0.03s linear',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
            <span>Profile analysis</span>
            <span>{progress}%</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 280 }}>
          {[
            { label: 'Risk calibration', done: progress > 30 },
            { label: 'Tax-efficiency modeling', done: progress > 55 },
            { label: 'Portfolio allocation', done: progress > 75 },
            { label: 'Responsibility gate', done: progress > 90 },
          ].map(({ label, done }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: done ? 'var(--text-secondary)' : 'var(--text-muted)', transition: 'color 0.3s' }}>
              {done
                ? <CheckCircle size={13} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
                : <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1px solid var(--border-bright)', flexShrink: 0 }} />
              }
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function OnboardingChat({ user, onComplete }) {
  const script = buildScript(user?.name?.split(' ')[0] || 'there')
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState('agent') // 'agent' | 'input' | 'user'
  const [inputVal, setInputVal] = useState('')
  const [profile, setProfile] = useState({})
  const [history, setHistory] = useState([]) // {role, text}[]
  const [building, setBuilding] = useState(false)
  const [done, setDone] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const current = script[step]
  const isTyping = phase === 'agent'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, phase])

  useEffect(() => {
    if (phase === 'input') inputRef.current?.focus()
  }, [phase])

  // After typing done, move to input phase (or handle final)
  function onTypingDone() {
    if (current.isFinal) {
      setBuilding(true)
      setTimeout(() => {
        setDone(true)
        setTimeout(onComplete, 400)
      }, 1600)
      return
    }
    setPhase('input')
  }

  function handleSubmit(ev) {
    ev.preventDefault()
    const val = inputVal.trim()
    if (!val) return

    // Save to profile
    if (current.profileKey) {
      setProfile(p => ({ ...p, [current.profileKey]: { label: current.profileLabel, value: current.formatProfile(val) } }))
    }

    // Add to history
    setHistory(h => [...h, { role: 'agent', text: current.agent }, { role: 'user', text: val }])
    setInputVal('')

    // Advance
    setStep(s => s + 1)
    setPhase('agent')
  }

  const visibleAgentText = phase === 'agent' ? current.agent : null
  const profileEntries = Object.values(profile)

  if (building) return <BuildingScreen />

  return (
    <div style={{
      display: 'flex', height: '100vh', width: '100vw',
      background: 'var(--bg-base)', overflow: 'hidden',
    }}>
      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 36px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather size={14} color="#070604" />
          </div>
          <div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              Mallard
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Personal wealth advisor
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {step + 1} / {script.length}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'y-auto', padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {history.map((m, i) =>
            m.role === 'agent'
              ? <MallardBubble key={i} text={m.text} isActive={false} />
              : <UserBubble key={i} text={m.text} />
          )}

          {/* Current agent message with typewriter */}
          {visibleAgentText && (
            <MallardBubble
              text={visibleAgentText}
              isActive={true}
              key={`agent-${step}`}
              onDone={onTypingDone}
            />
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        {phase === 'input' && current.userPrompt && (
          <div style={{
            padding: '20px 36px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder={current.userPrompt}
                style={{
                  flex: 1, padding: '12px 16px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-bright)',
                  borderRadius: 9,
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: 'DM Sans, sans-serif',
                  outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--gold-light)'; e.target.style.boxShadow = '0 0 0 3px var(--focus-ring)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-bright)'; e.target.style.boxShadow = 'none' }}
              />
              <button
                type="submit"
                disabled={!inputVal.trim()}
                style={{
                  padding: '12px 22px',
                  borderRadius: 9, border: 'none',
                  cursor: inputVal.trim() ? 'pointer' : 'not-allowed',
                  background: inputVal.trim() ? 'linear-gradient(135deg, var(--gold), var(--gold-bright))' : 'var(--bg-elevated)',
                  color: inputVal.trim() ? '#070604' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 700,
                  fontFamily: 'DM Sans, sans-serif',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                Continue
              </button>
            </form>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
              Your answers are used only to build your personalized wealth plan.
            </div>
          </div>
        )}

        {/* Typing — show "Continue" to speed through if needed */}
        {phase === 'agent' && !current.isFinal && (
          <div style={{
            padding: '16px 36px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}>
            <TypewriterAdvancer text={current.agent} onDone={onTypingDone} key={`adv-${step}`} />
          </div>
        )}
      </div>

      {/* Profile panel */}
      <div style={{
        width: 300, minWidth: 300,
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Your Profile
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Building as we talk
          </div>
        </div>

        <div style={{ flex: 1, padding: '16px 16px', overflowY: 'auto' }}>
          {profileEntries.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 32, lineHeight: 1.6 }}>
              Your profile details<br />will appear here as<br />we go through the questions.
            </div>
          )}
          {profileEntries.map(({ label, value }) => (
            <ProfileRow key={label} label={label} value={value} />
          ))}
        </div>

        {/* Bottom note */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            padding: '10px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.5,
            background: 'rgba(176,128,16,0.07)',
            border: '1px solid rgba(176,128,16,0.18)',
            color: 'var(--text-muted)',
          }}>
            <span style={{ color: 'var(--gold-light)', fontWeight: 600 }}>Mallard AI</span> elicits your picture.
            A deterministic engine builds the plan. No hallucinated numbers.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        input::placeholder { color: var(--text-muted); opacity: 1; }
      `}</style>
    </div>
  )
}

// Invisible component that drives the typewriter timer and calls onDone
function TypewriterAdvancer({ text, onDone }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (i >= text.length) { onDone(); return }
    const t = setTimeout(() => setI(n => n + 1), 22)
    return () => clearTimeout(t)
  }, [i, text, onDone])
  return null
}
