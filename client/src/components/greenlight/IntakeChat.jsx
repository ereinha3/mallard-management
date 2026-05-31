import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle, AlertTriangle, Send, Loader } from 'lucide-react'
import { streamChat, postOnboard } from '../../api/greenlightClient'

function AgentBubble({ text, isStreaming }) {
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
        {text}
        {isStreaming && (
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

function ParamRow({ label, value, status, note }) {
  return (
    <div
      className="px-4 py-3 rounded-xl"
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${status === 'warn' ? 'rgba(230,69,69,0.3)' : 'var(--border)'}`,
        marginBottom: 8,
        animation: 'fadeUp 0.3s ease both',
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
            : <CheckCircle size={14} style={{ color: 'var(--emerald)' }} />}
        </div>
      </div>
    </div>
  )
}

function buildSeedMessage(prefillData) {
  if (!prefillData) {
    return "Hi, I'd like to check whether I'm ready to start investing."
  }

  return [
    "Hi, I'd like to check whether I'm ready to start investing.",
    "I've already provided these financial facts:",
    `Annual household income: ${prefillData.income}`,
    `Total monthly expenses: ${prefillData.expenses}`,
    `Liquid capital / savings: ${prefillData.liquidCapital}`,
    `Emergency fund balance: ${prefillData.emergencyFund}`,
    `Age: ${prefillData.age}`,
    'Use those facts as given. Do not ask me for them again.',
    'Ask only 2-3 follow-up questions, focused on risk tolerance and investing goals, before extracting the profile.',
  ].join('\n')
}

export default function IntakeChat({ onComplete, userEmail, prefillData }) {
  const [messages, setMessages] = useState([])
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [error, setError] = useState(null)
  const [profile, setProfile] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const calledRef = useRef(false)
  const sessionIdRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (!isStreaming && !analyzing) inputRef.current?.focus()
  }, [isStreaming, analyzing])

  const callBackend = useCallback((msgList) => {
    setIsStreaming(true)
    setStreamingText('')
    setError(null)
    let accumulated = ''
    let committed = false

    streamChat({
      messages: msgList,
      user_email: userEmail,
      session_id: sessionIdRef.current,
      onSession: (session) => {
        sessionIdRef.current = session?.session_id ?? session
      },
      onToken: (chunk) => {
        accumulated += chunk
        setStreamingText(accumulated)
      },
      onProfileReady: async (profileData) => {
        if (committed) return
        committed = true
        if (accumulated) {
          setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
        }
        setStreamingText('')
        setIsStreaming(false)
        setProfile(profileData)
        setAnalyzing(true)
        try {
          const result = await postOnboard(profileData, userEmail)
          await new Promise(r => setTimeout(r, 800))
          onComplete(result)
        } catch {
          await new Promise(r => setTimeout(r, 800))
          onComplete(null)
        }
      },
      onError: (msg) => {
        setIsStreaming(false)
        setStreamingText('')
        setError(msg)
      },
      onDone: () => {
        if (committed) return
        committed = true
        if (accumulated) {
          setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
        }
        setStreamingText('')
        setIsStreaming(false)
      },
    })
  }, [onComplete, userEmail])

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true
    const seed = [{ role: 'user', content: buildSeedMessage(prefillData) }]
    setMessages(seed)
    callBackend(seed)
  }, []) // eslint-disable-line

  function handleSend(e) {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text || isStreaming || analyzing) return
    const updated = [...messages, { role: 'user', content: text }]
    setMessages(updated)
    setInputVal('')
    callBackend(updated)
  }

  const paramRows = profile ? [
    {
      label: 'Annual Income',
      value: `$${Math.round(profile.household_income).toLocaleString()}`,
      status: 'ok',
    },
    {
      label: 'Monthly Expenses',
      value: `$${Math.round(profile.monthly_expenses).toLocaleString()}`,
      status: 'ok',
    },
    {
      label: 'Emergency Fund',
      value: `$${Math.round(profile.emergency_fund).toLocaleString()}`,
      status: profile.emergency_fund < profile.monthly_expenses * 3 ? 'warn' : 'ok',
      note: profile.emergency_fund < profile.monthly_expenses * 3
        ? 'May be below 3-month threshold'
        : 'Meets 3-month threshold',
    },
    {
      label: 'Capital on Hand',
      value: `$${Math.round(profile.capital_on_hand).toLocaleString()}`,
      status: 'ok',
    },
    {
      label: 'Debts',
      value: profile.debts?.length ? `${profile.debts.length} item(s)` : 'None',
      status: profile.debts?.some(d => d.apr > 0.08) ? 'warn' : 'ok',
      note: profile.debts?.some(d => d.apr > 0.08) ? 'High-APR debt detected (>8%)' : null,
    },
    {
      label: 'Age / Horizon',
      value: `${profile.age} yrs · ${profile.horizon_years} yrs to goal`,
      status: 'ok',
    },
    {
      label: 'Filing Status',
      value: profile.filing_status?.replace(/_/g, ' '),
      status: 'ok',
    },
    {
      label: 'Income Stability',
      value: profile.income_stability?.replace(/_/g, ' '),
      status: 'ok',
    },
  ].filter(r => r.value) : []

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Chat column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
        <div className="px-8 py-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Elicitation · Live Session
          </div>
          <div className="font-display font-semibold text-xl mt-0.5" style={{ color: 'var(--text-primary)', letterSpacing: 0 }}>
            Should you be investing right now?
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {messages.slice(1).map((m, i) =>
            m.role === 'assistant'
              ? <AgentBubble key={i} text={m.content} isStreaming={false} />
              : <UserBubble key={i} text={m.content} />
          )}

          {streamingText && <AgentBubble text={streamingText} isStreaming={true} />}

          {isStreaming && !streamingText && (
            <div className="flex gap-3 items-center">
              <div
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{ width: 28, height: 28, background: 'rgba(30,184,122,0.15)', border: '1px solid #1eb87a55' }}
              >
                <Loader size={12} style={{ color: 'var(--emerald)', animation: 'spin 1s linear infinite' }} />
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Greenlight is thinking...</div>
            </div>
          )}

          {analyzing && (
            <div className="flex gap-3 items-center">
              <div
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{ width: 28, height: 28, background: 'rgba(30,184,122,0.15)', border: '1px solid #1eb87a55' }}
              >
                <Loader size={12} style={{ color: 'var(--emerald)', animation: 'spin 1s linear infinite' }} />
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Running responsibility gate...</div>
            </div>
          )}

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
              background: 'rgba(217,64,64,0.08)', border: '1px solid rgba(217,64,64,0.25)',
              borderRadius: 10, fontSize: 13, color: 'var(--ruby)',
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>Backend error</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{error}</div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="px-8 py-5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 10 }}>
            <input
              ref={inputRef}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder={
                analyzing ? 'Running analysis...'
                : isStreaming ? 'Greenlight is typing...'
                : 'Type your answer...'
              }
              disabled={isStreaming || analyzing}
              style={{
                flex: 1, padding: '11px 16px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-bright)',
                borderRadius: 9, color: 'var(--text-primary)',
                fontSize: 14, fontFamily: 'DM Sans, sans-serif',
                outline: 'none',
                opacity: (isStreaming || analyzing) ? 0.5 : 1,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'var(--emerald)'
                e.target.style.boxShadow = '0 0 0 3px rgba(30,184,122,0.12)'
              }}
              onBlur={e => {
                e.target.style.borderColor = 'var(--border-bright)'
                e.target.style.boxShadow = 'none'
              }}
            />
            <button
              type="submit"
              disabled={isStreaming || analyzing || !inputVal.trim()}
              style={{
                width: 44, height: 44, borderRadius: 9, border: 'none', flexShrink: 0,
                cursor: (isStreaming || analyzing || !inputVal.trim()) ? 'not-allowed' : 'pointer',
                background: (isStreaming || analyzing || !inputVal.trim())
                  ? 'var(--bg-elevated)'
                  : 'linear-gradient(135deg, #1eb87a, #16a864)',
                color: (isStreaming || analyzing || !inputVal.trim()) ? 'var(--text-muted)' : '#070910',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <Send size={16} />
            </button>
          </form>
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            Elicitation agent · parameters extracted to typed schema · deterministic engine evaluates
          </p>
        </div>
      </div>

      {/* Parameter extraction panel */}
      <div style={{ width: 320, minWidth: 320, background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
        <div className="px-5 py-5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Extracted Parameters
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {profile ? 'Complete · submitting to engine' : 'Live · LLM → typed schema'}
          </div>
        </div>

        <div className="flex-1 px-5 py-4 overflow-y-auto">
          {profile
            ? paramRows.map(p => (
                <ParamRow key={p.label} label={p.label} value={p.value} status={p.status} note={p.note} />
              ))
            : (
              <div className="text-xs text-center py-8" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                {messages.length > 1
                  ? <>Parameters appear here once Greenlight<br />has gathered your complete<br />financial picture.</>
                  : <>Parameters will appear as<br />the conversation progresses.</>
                }
              </div>
            )
          }
        </div>

        <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
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
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        input::placeholder { color: var(--text-muted); opacity: 1; }
      `}</style>
    </div>
  )
}
