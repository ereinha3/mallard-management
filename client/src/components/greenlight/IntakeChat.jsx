import { useState, useEffect, useRef } from 'react'
import { CheckCircle, AlertTriangle, Loader } from 'lucide-react'

// --- Scripted conversations ---

const HALT_SCRIPT = [
  {
    agent: "Hello. I'm Greenlight. My job is to answer one question before anything else: should you be investing right now? Let's build your picture. What's your household income?",
    user: "$78,000 a year.",
    extract: { key: 'income', label: 'Household income', value: '$78,000 / yr', status: 'ok' },
  },
  {
    agent: "Got it. And your essential monthly expenses: housing, food, utilities, transportation?",
    user: "About $3,200 a month.",
    extract: { key: 'expenses', label: 'Monthly expenses', value: '$3,200 / mo', status: 'ok' },
  },
  {
    agent: "How much capital do you have available to put to work?",
    user: "$6,000.",
    extract: { key: 'capital', label: 'Capital on hand', value: '$6,000', status: 'ok' },
  },
  {
    agent: "Important one. How many months of essential expenses do you have in a liquid emergency fund right now?",
    user: "About $1,500 saved, so maybe half a month.",
    extract: { key: 'emergency', label: 'Emergency fund', value: '$1,500 · 0.5 months', status: 'warn', note: 'Need: $9,600 (3 mo.)' },
  },
  {
    agent: "Do you carry any debt? If yes, I'll need the balance and the interest rate for each.",
    user: "$9,000 on a credit card at 22% APR. Also $14,000 in student loans at 4.5%.",
    extract: { key: 'debt', label: 'Outstanding debt', value: 'CC $9k @ 22%  ·  Student $14k @ 4.5%', status: 'warn', note: '22% APR above 8% threshold' },
  },
  {
    agent: "Your age and target retirement horizon?",
    user: "28. Hoping to retire around 65.",
    extract: { key: 'lifecycle', label: 'Age / Horizon', value: '28 yrs · 37 yrs to retirement', status: 'ok' },
  },
  {
    agent: "Last one: risk comfort level and any investment preferences?",
    user: "Moderate-aggressive. ESG matters to me. No fossil fuels or weapons.",
    extract: { key: 'prefs', label: 'Risk & Preferences', value: 'Moderate-aggressive · ESG', status: 'ok', note: 'Excl: fossil fuels, weapons' },
  },
  {
    agent: "Got it. Running the responsibility gate now...",
    user: null,
    extract: null,
  },
]

const GREEN_SCRIPT = [
  {
    agent: "Welcome back. Let's confirm your updated financial picture. Income still $78,000?",
    user: "Yes, same.",
    extract: { key: 'income', label: 'Household income', value: '$78,000 / yr', status: 'ok' },
  },
  {
    agent: "And you mentioned you've paid off the credit card and built up savings?",
    user: "Paid off the $9,000 card in full. Emergency fund is now $10,000, about 3.1 months.",
    extract: { key: 'emergency', label: 'Emergency fund', value: '$10,000 · 3.1 months', status: 'ok', note: '✓ Meets 3-month threshold' },
  },
  {
    agent: "The student loan at 4.5%, still outstanding?",
    user: "$14,000 remaining at 4.5% APR.",
    extract: { key: 'debt', label: 'Outstanding debt', value: 'Student $14k @ 4.5%', status: 'ok', note: 'Below 8%, investing allowed alongside' },
  },
  {
    agent: "Capital available to invest now?",
    user: "$7,500.",
    extract: { key: 'capital', label: 'Capital on hand', value: '$7,500', status: 'ok' },
  },
  {
    agent: "Preferences unchanged: moderate-aggressive, ESG-screened?",
    user: "Exactly. Still no fossil fuels or weapons.",
    extract: { key: 'prefs', label: 'Risk & Preferences', value: 'Moderate-aggressive · ESG', status: 'ok', note: 'Excl: fossil fuels, weapons' },
  },
  {
    agent: "Running the gate...",
    user: null,
    extract: null,
  },
]

function useTypewriter(text, speed = 18) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed('')
    setDone(false)
    if (!text) { setDone(true); return }
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) { setDone(true); clearInterval(timer) }
    }, speed)
    return () => clearInterval(timer)
  }, [text])
  return { displayed, done }
}

function AgentBubble({ text, isActive }) {
  const { displayed, done } = useTypewriter(isActive ? text : text, isActive ? 18 : 0)
  const content = isActive ? displayed : text
  return (
    <div className="flex gap-3 items-start">
      <div
        className="shrink-0 flex items-center justify-center rounded-full text-xs font-mono font-semibold"
        style={{
          width: 28, height: 28, marginTop: 2,
          background: 'linear-gradient(135deg, #1eb87a22, #1eb87a44)',
          border: '1px solid #1eb87a55',
          color: 'var(--emerald)',
        }}
      >
        G
      </div>
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-bright)',
          color: 'var(--text-primary)',
          maxWidth: 480,
        }}
      >
        {content}
        {isActive && !done && (
          <span
            className="inline-block w-0.5 h-4 ml-0.5 align-text-bottom"
            style={{ background: 'var(--emerald)', animation: 'blink 1s step-end infinite' }}
          />
        )}
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="flex justify-end">
      <div
        className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed"
        style={{
          background: 'rgba(196,154,44,0.1)',
          border: '1px solid rgba(196,154,44,0.25)',
          color: 'var(--text-primary)',
          maxWidth: 440,
        }}
      >
        {text}
      </div>
    </div>
  )
}

function ParamRow({ label, value, status, note, visible }) {
  if (!visible) return null
  return (
    <div
      className="px-4 py-3 rounded-xl anim-fade-up"
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${status === 'warn' ? 'rgba(230,69,69,0.3)' : 'var(--border)'}`,
        marginBottom: 8,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            {label}
          </div>
          <div className="text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
            {value}
          </div>
          {note && (
            <div className="text-xs mt-1" style={{ color: status === 'warn' ? 'var(--ruby)' : 'var(--emerald)' }}>
              {note}
            </div>
          )}
        </div>
        <div className="shrink-0 mt-0.5">
          {status === 'warn'
            ? <AlertTriangle size={14} style={{ color: 'var(--ruby)' }} />
            : <CheckCircle size={14} style={{ color: 'var(--emerald)' }} />
          }
        </div>
      </div>
    </div>
  )
}

export default function IntakeChat({ scenario, onComplete }) {
  const script = scenario === 'halt' ? HALT_SCRIPT : GREEN_SCRIPT
  const [msgIdx, setMsgIdx] = useState(0)
  const [phase, setPhase] = useState('agent') // 'agent' | 'user' | 'next'
  const [extractedKeys, setExtractedKeys] = useState([])
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const bottomRef = useRef(null)

  const currentMsg = script[msgIdx]
  const isLastMsg = msgIdx === script.length - 1

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgIdx, phase])

  function advance() {
    if (phase === 'agent') {
      if (currentMsg.user) {
        // show user response after short delay
        setTimeout(() => {
          setPhase('user')
          if (currentMsg.extract) {
            setExtractedKeys(prev => [...prev, currentMsg.extract.key])
          }
        }, 400)
      } else {
        // last agent message (running gate...)
        if (currentMsg.extract) setExtractedKeys(prev => [...prev, currentMsg.extract.key])
        setRunning(true)
        setTimeout(() => {
          setFinished(true)
        }, 2000)
      }
    } else if (phase === 'user') {
      // advance to next message
      if (isLastMsg) {
        setFinished(true)
      } else {
        setMsgIdx(i => i + 1)
        setPhase('agent')
      }
    }
  }

  // All params keyed from script
  const allParams = script.filter(s => s.extract).map(s => s.extract)

  const visibleMessages = []
  for (let i = 0; i <= msgIdx; i++) {
    const s = script[i]
    visibleMessages.push({ role: 'agent', text: s.agent, isActive: i === msgIdx && phase === 'agent' })
    if (i < msgIdx || (i === msgIdx && phase === 'user')) {
      if (s.user) visibleMessages.push({ role: 'user', text: s.user })
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Chat column */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {/* Chat title */}
        <div className="px-8 py-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {scenario === 'green' ? 'Updated Profile · Re-run' : 'Elicitation · Session 1'}
          </div>
          <div className="font-display font-semibold text-xl mt-0.5" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {scenario === 'green' ? "Let's confirm what's changed." : "Should you be investing right now?"}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {visibleMessages.map((m, i) => (
            m.role === 'agent'
              ? <AgentBubble key={i} text={m.text} isActive={m.isActive} />
              : <UserBubble key={i} text={m.text} />
          ))}

          {running && !finished && (
            <div className="flex gap-3 items-center">
              <div
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{ width: 28, height: 28, background: 'rgba(30,184,122,0.15)', border: '1px solid #1eb87a55' }}
              >
                <Loader size={12} style={{ color: 'var(--emerald)', animation: 'spin 1s linear infinite' }} />
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Running responsibility gate<span style={{ animation: 'blink 1s step-end infinite' }}>...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Action footer */}
        <div className="px-8 py-5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          {!finished ? (
            <button
              onClick={advance}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
                color: '#070910',
                opacity: running ? 0.4 : 1,
                cursor: running ? 'not-allowed' : 'pointer',
              }}
              disabled={running}
            >
              {phase === 'agent' ? 'Continue →' : 'Next question →'}
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, #1eb87a, #16a864)',
                color: '#070910',
              }}
            >
              See gate result →
            </button>
          )}
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            Elicitation agent · parameters extracted to typed schema · deterministic engine evaluates
          </p>
        </div>
      </div>

      {/* Parameter extraction panel */}
      <div
        style={{
          width: 320,
          minWidth: 320,
          background: 'var(--bg-surface)',
          overflow: 'y-auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="px-5 py-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Extracted Parameters
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Live · LLM → typed schema
          </div>
        </div>
        <div className="flex-1 px-5 py-4 overflow-y-auto">
          {allParams.map(p => (
            <ParamRow
              key={p.key}
              label={p.label}
              value={p.value}
              status={p.status}
              note={p.note}
              visible={extractedKeys.includes(p.key)}
            />
          ))}
          {extractedKeys.length === 0 && (
            <div className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
              Parameters will appear as<br />the conversation progresses
            </div>
          )}
          {extractedKeys.length > 0 && extractedKeys.length < allParams.length && (
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1 h-1 rounded-full" style={{ background: 'var(--text-muted)', animation: `blink ${0.6 + i * 0.2}s step-end infinite` }} />
                ))}
              </div>
              Awaiting next response
            </div>
          )}
        </div>

        {/* Engine boundary label */}
        <div
          className="px-5 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div
            className="rounded-xl p-3 text-xs"
            style={{
              background: 'rgba(74,114,232,0.08)',
              border: '1px solid rgba(74,114,232,0.2)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <div className="font-semibold mb-1" style={{ color: 'var(--blue)' }}>LLM ↔ Engine boundary</div>
            The agent elicits and extracts. Every gate decision, allocation, and figure is produced by the deterministic engine. The LLM never computes a number.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
