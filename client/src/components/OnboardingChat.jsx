import { useState, useEffect, useRef, useCallback } from 'react'
import { Feather, CheckCircle, Send, AlertTriangle, FastForward } from 'lucide-react'
import { streamChat, postOnboard } from '../api/greenlightClient'
import { DUMMY_ONBOARD_RESULT } from '../data/dummyProfile'
import IntakeForm from './greenlight/IntakeForm.jsx'

// ── Building / analysis screen ────────────────────────────────────────────────

function BuildingScreen({ onboardResult }) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('analyzing') // 'analyzing' | 'done'

  useEffect(() => {
    const t = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(t); setPhase('done'); return 100 }
        return p + 1.8
      })
    }, 25)
    return () => clearInterval(t)
  }, [])

  const gateStatus = onboardResult?.gate_result?.status
  const snapshot = onboardResult?.financial_analysis?.snapshot

  const steps = [
    { label: 'Profile validated',       done: progress > 20 },
    { label: 'Risk profile computed',   done: progress > 42 },
    { label: 'Responsibility gate run', done: progress > 65 },
    { label: 'Financial analysis ready',done: progress > 85 },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, animation: 'fadeUp 0.5s ease both',
    }}>
      <div style={{
        position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(176,128,16,0.09) 0%, transparent 70%)',
        filter: 'blur(60px)', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, maxWidth: 400, width: '100%', padding: '0 24px' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather size={26} color="#070604" />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'Playfair Display, serif', fontSize: 36,
            fontWeight: 600, letterSpacing: '-0.02em',
            color: 'var(--text-primary)', lineHeight: 1.1, marginBottom: 10,
          }}>
            {phase === 'done' && gateStatus === 'greenlight' ? "You're cleared." : "Building your plan."}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {phase === 'done' && snapshot
              ? `Monthly surplus: $${Math.round(snapshot.monthly_surplus).toLocaleString()} · Savings rate: ${snapshot.savings_rate_pct.toFixed(1)}%`
              : 'Running the responsibility gate and risk calibration...'}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%' }}>
          <div style={{ height: 2, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: phase === 'done' && gateStatus === 'halt'
                ? 'linear-gradient(90deg, var(--ruby), #f06060)'
                : 'linear-gradient(90deg, var(--gold), var(--gold-bright))',
              width: `${progress}%`,
              transition: 'width 0.025s linear',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
            <span>Analysis</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Step checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {steps.map(({ label, done }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: done ? 'var(--text-secondary)' : 'var(--text-muted)', transition: 'color 0.3s' }}>
              {done
                ? <CheckCircle size={14} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
                : <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--border-bright)', flexShrink: 0 }} />
              }
              {label}
            </div>
          ))}
        </div>

        {/* Gate result preview */}
        {phase === 'done' && gateStatus && (
          <div
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10,
              background: gateStatus === 'greenlight' ? 'rgba(26,173,114,0.08)' : 'rgba(217,64,64,0.08)',
              border: `1px solid ${gateStatus === 'greenlight' ? 'rgba(26,173,114,0.25)' : 'rgba(217,64,64,0.25)'}`,
              textAlign: 'center', fontSize: 13,
              color: gateStatus === 'greenlight' ? 'var(--emerald)' : 'var(--ruby)',
              fontWeight: 600,
              animation: 'fadeUp 0.4s ease both',
            }}
          >
            {gateStatus === 'greenlight'
              ? 'Gate cleared. Taking you to your dashboard.'
              : `Gate: ${onboardResult?.gate_result?.reason?.slice(0, 80) ?? 'Action required before investing.'}`
            }
          </div>
        )}
      </div>

      <style>{`@keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  )
}

// ── Message bubbles ───────────────────────────────────────────────────────────

function MallardBubble({ text, isStreaming }) {
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
        maxWidth: 560, padding: '13px 17px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-bright)',
        borderTopLeftRadius: 4, borderTopRightRadius: 14,
        borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
        fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {text}
        {isStreaming && (
          <span style={{
            display: 'inline-block', width: 2, height: 15, background: 'var(--gold-light)',
            marginLeft: 3, verticalAlign: 'text-bottom',
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
        maxWidth: 440, padding: '12px 16px',
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

// ── Main component ────────────────────────────────────────────────────────────

const TAX_PROFILE_FIELDS = [
  'zip_code',
  'state',
  'filing_status',
  'pretax_401k',
  'pretax_ira',
  'pretax_hsa',
  'employer_match_rate',
  'employer_match_cap_pct',
  'has_hsa_eligible_plan',
  'hsa_coverage',
]

const FILING_STATUS_MAP = {
  married_filing_jointly: 'married_joint',
  married_filing_separately: 'married_separate',
  qualifying_surviving_spouse: 'married_joint',
}

function normalizeFilingStatus(value) {
  return FILING_STATUS_MAP[value] ?? value
}

function normalizePercent(value) {
  if (value == null) return value
  return value > 1 ? value / 100 : value
}

function normalizeHsaCoverage(value) {
  if (value === 'self') return 'self_only'
  return value
}

function getTaxProfilePayload(taxProfile) {
  if (!taxProfile) return {}

  const contributions = taxProfile.pre_tax_contributions_annual ?? {}
  const normalized = {
    zip_code: taxProfile.zip_code,
    state: taxProfile.state,
    filing_status: normalizeFilingStatus(taxProfile.filing_status),
    pretax_401k: contributions.traditional_401k,
    pretax_ira: contributions.traditional_ira,
    pretax_hsa: contributions.hsa_contribution,
    employer_match_rate: normalizePercent(contributions.employer_match_rate_pct),
    employer_match_cap_pct: normalizePercent(contributions.employer_match_cap_pct_salary),
    has_hsa_eligible_plan: contributions.hsa_eligible,
    hsa_coverage: normalizeHsaCoverage(contributions.hsa_coverage),
  }

  return TAX_PROFILE_FIELDS.reduce((payload, field) => {
    if (normalized[field] !== undefined && normalized[field] !== null && normalized[field] !== '') {
      payload[field] = normalized[field]
    }
    return payload
  }, {})
}

function formatTaxProfileSeed(taxProfile) {
  const payload = getTaxProfilePayload(taxProfile)
  const parts = []

  if (payload.zip_code) parts.push(`ZIP code is ${payload.zip_code}`)
  if (payload.state) parts.push(`state is ${payload.state}`)
  if (payload.filing_status) parts.push(`filing status is ${payload.filing_status}`)
  if (payload.pretax_401k != null) parts.push(`annual 401k contribution is $${payload.pretax_401k}`)
  if (payload.pretax_ira != null) parts.push(`annual traditional IRA contribution is $${payload.pretax_ira}`)
  if (payload.has_hsa_eligible_plan != null) parts.push(`HSA eligibility is ${payload.has_hsa_eligible_plan ? 'yes' : 'no'}`)
  if (payload.pretax_hsa != null) parts.push(`annual HSA contribution is $${payload.pretax_hsa}`)
  if (payload.hsa_coverage) parts.push(`HSA coverage is ${payload.hsa_coverage}`)
  if (payload.employer_match_rate != null) parts.push(`employer match rate is ${payload.employer_match_rate}`)
  if (payload.employer_match_cap_pct != null) parts.push(`employer match cap is ${payload.employer_match_cap_pct}`)

  if (!parts.length) return ''
  return ` The user also completed TaxProfileForm: ${parts.join(', ')}. Do NOT ask about any TaxProfileForm fields.`
}

export default function OnboardingChat({ user, taxProfile, onComplete, resumeSession }) {

  // Resume an interrupted enrollment: restore the saved transcript + session id from
  // the DB so the user continues where they left off instead of starting over.
  const resumeMessages = resumeSession?.messages?.map(m => ({ role: m.role, content: m.content })) ?? []
  const isResume = resumeMessages.length > 0

  const [step, setStep] = useState(isResume ? 'chat' : 'form') // 'form' | 'chat'

  // Conversation state
  const [messages, setMessages] = useState(isResume ? resumeMessages : []) // {role:'user'|'assistant', content:string}[]
  const [streamingText, setStreamingText] = useState('') // partial AI response
  const [isStreaming, setIsStreaming] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [error, setError] = useState(null)

  // Pipeline state
  const [profile, setProfile] = useState(null)       // UserProfileInput from backend
  const [onboardResult, setOnboardResult] = useState(null)
  const [building, setBuilding] = useState(false)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(false)
  const initializedRef = useRef(isResume) // resumed sessions are already initialized (don't re-seed)
  const sessionIdRef = useRef(resumeSession?.id ?? null)
  const resumeKickedRef = useRef(false)

  // Scroll to bottom whenever messages or streaming text changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Focus input when not streaming
  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus()
  }, [isStreaming])

  // After profile_ready → run /onboard → show building screen
  useEffect(() => {
    if (!profile) return
    ;(async () => {
      setBuilding(true)
      try {
        const result = await postOnboard(
          { ...profile, ...getTaxProfilePayload(taxProfile) },
          user?.email,
          sessionIdRef.current,
        )
        setOnboardResult(result)
        // Give the building screen 1.8s to animate, then complete
        await new Promise(r => setTimeout(r, 1800))
        onComplete(result)
      } catch (e) {
        // If onboard fails, still proceed (show dashboard without gate data)
        console.error('Onboard error:', e)
        await new Promise(r => setTimeout(r, 1800))
        onComplete(null)
      }
    })()
  }, [profile, taxProfile, user?.email]) // eslint-disable-line

  const callBackend = useCallback((msgList) => {
    abortRef.current = false
    setIsStreaming(true)
    setStreamingText('')
    setError(null)

    let accumulated = ''
    let committed = false

    streamChat({
      messages: msgList,
      user_email: user?.email,
      session_id: sessionIdRef.current,
      onSession: (session) => {
        sessionIdRef.current = session?.session_id ?? session
      },
      onToken: (chunk) => {
        if (abortRef.current) return
        accumulated += chunk
        setStreamingText(accumulated)
      },
      onProfileReady: (profileData) => {
        if (committed) return
        committed = true
        // AI has collected enough — commit the streaming message first
        setMessages(prev => {
          const withAI = accumulated
            ? [...prev, { role: 'assistant', content: accumulated }]
            : prev
          return withAI
        })
        setStreamingText('')
        setIsStreaming(false)
        setProfile(profileData)
      },
      onError: (msg) => {
        setIsStreaming(false)
        setStreamingText('')
        setError(msg)
      },
      onDone: () => {
        if (abortRef.current || committed) return
        committed = true
        // Normal stream end (no profile_ready yet — AI asked a question)
        if (accumulated) {
          setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
        }
        setStreamingText('')
        setIsStreaming(false)
      },
    })
  }, [user?.email])

  // On resume: if the saved transcript ends on a user turn, the assistant reply never
  // arrived before the interrupt — continue the stream so the conversation advances.
  useEffect(() => {
    if (!isResume || resumeKickedRef.current) return
    resumeKickedRef.current = true
    const last = messages[messages.length - 1]
    if (last && last.role === 'user') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      callBackend(messages)
    }
  }, [isResume, messages, callBackend])

  function handleIntakeSubmit(data) {
    if (initializedRef.current) return
    initializedRef.current = true

    const capturedFields = {
      annualIncome: data.income,
      monthlyExpenses: data.expenses,
      liquidCapital: data.liquidCapital,
      emergencyFund: data.emergencyFund,
      age: data.age,
      dependents: data.dependents,
      employerCompany: data.employerCompany,
      jobTitle: data.jobTitle,
      companyTenure: data.companyTenure,
      companySize: data.companySize,
      employmentType: data.employmentType,
    }
    setStep('chat')

    const seedContent = `The user has already completed the intake form. Their annual income is $${capturedFields.annualIncome}, monthly expenses are $${capturedFields.monthlyExpenses}, liquid capital is $${capturedFields.liquidCapital}, emergency fund is $${capturedFields.emergencyFund}, age is ${capturedFields.age}, and dependents is ${capturedFields.dependents}. Their employer is ${capturedFields.employerCompany}, job title is ${capturedFields.jobTitle}, company tenure is ${capturedFields.companyTenure}, company size is ${capturedFields.companySize}, and employment type is ${capturedFields.employmentType}.${formatTaxProfileSeed(taxProfile)} Do NOT re-ask about any of those fields. Proceed to income stability classification, then risk tolerance using the GL1-GL13 questions one at a time, then outstanding debts if they are not obvious, then primary investing goals and time horizon. Start with ONE natural question. Never ask multiple things in one message. Vary your phrasing — do not sound like a form.`
    const seed = [{ role: 'user', content: seedContent }]
    setMessages(seed)
    callBackend(seed)
  }

  function handleSend(e) {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text || isStreaming) return

    const updated = [...messages, { role: 'user', content: text }]
    setMessages(updated)
    setInputVal('')
    callBackend(updated)
  }

  if (building) return <BuildingScreen onboardResult={onboardResult} />
  if (step === 'form') return <IntakeForm onSubmit={handleIntakeSubmit} />

  // Render all committed messages + current streaming text
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* Chat column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 32px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather size={15} color="#070604" />
          </div>
          <div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              Mallard
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {isStreaming ? 'Typing...' : 'Personal wealth advisor'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Dev-only: skip onboarding and load demo data */}
            <button
              type="button"
              onClick={() => onComplete(DUMMY_ONBOARD_RESULT)}
              title="Developer shortcut: skip the chat and load demo data"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 11px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--green-soft, rgba(26,107,66,0.12))',
                border: '1px solid var(--green, var(--emerald))',
                color: 'var(--green-bright, var(--emerald))',
                fontSize: 11.5, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.04em', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--green, var(--emerald))'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--green-soft, rgba(26,107,66,0.12))'; e.currentTarget.style.color = 'var(--green-bright, var(--emerald))' }}
            >
              <FastForward size={13} />
              DEV: SKIP
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: isStreaming ? 'var(--gold-light)' : 'var(--emerald)', transition: 'background 0.3s', animation: isStreaming ? 'pulse 1.2s ease-in-out infinite' : 'none' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                {isStreaming ? 'LIVE' : 'READY'}
              </span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'hidden auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Filter out the seed user message */}
          {messages.slice(1).map((m, i) =>
            m.role === 'assistant'
              ? <MallardBubble key={i} text={m.content} isStreaming={false} />
              : <UserBubble key={i} text={m.content} />
          )}

          {/* Streaming partial response */}
          {streamingText && <MallardBubble text={streamingText} isStreaming={true} />}

          {/* Connecting state */}
          {isStreaming && !streamingText && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Feather size={14} color="#070604" />
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--text-muted)',
                    animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
              background: 'rgba(217,64,64,0.08)', border: '1px solid rgba(217,64,64,0.25)',
              borderRadius: 10, fontSize: 13, color: 'var(--ruby)',
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>Backend unreachable</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{error}</div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '16px 32px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 10 }}>
            <input
              ref={inputRef}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder={isStreaming ? 'Mallard is typing...' : 'Type your response...'}
              disabled={isStreaming}
              aria-label="Your response"
              style={{
                flex: 1, padding: '12px 16px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-bright)',
                borderRadius: 9, color: 'var(--text-primary)',
                fontSize: 14, fontFamily: 'DM Sans, sans-serif',
                outline: 'none', opacity: isStreaming ? 0.5 : 1,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--gold-light)'; e.target.style.boxShadow = '0 0 0 3px var(--focus-ring)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border-bright)'; e.target.style.boxShadow = 'none' }}
            />
            <button
              type="submit"
              disabled={isStreaming || !inputVal.trim()}
              aria-label="Send message"
              style={{
                width: 44, height: 44, borderRadius: 9, border: 'none', flexShrink: 0,
                cursor: isStreaming || !inputVal.trim() ? 'not-allowed' : 'pointer',
                background: isStreaming || !inputVal.trim() ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
                color: isStreaming || !inputVal.trim() ? 'var(--text-muted)' : '#070604',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <Send size={16} />
            </button>
          </form>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
            Powered by Gemini. Your answers feed the deterministic Greenlight engine.
          </div>
        </div>
      </div>

      {/* Profile panel */}
      <div style={{
        width: 280, minWidth: 280,
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Your Profile
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {profile ? 'Complete — running analysis' : 'Filling in as we talk'}
          </div>
        </div>

        <div style={{ flex: 1, padding: '14px 14px', overflowY: 'auto' }}>
          {!profile && messages.length <= 1 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 28, lineHeight: 1.6 }}>
              Your details will appear<br />here as Mallard gathers<br />your financial picture.
            </div>
          )}

          {/* Show extracted profile fields once available */}
          {profile && (
            <ProfileSummary profile={profile} />
          )}
        </div>

        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            padding: '10px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.5,
            background: 'rgba(176,128,16,0.07)',
            border: '1px solid rgba(176,128,16,0.18)',
            color: 'var(--text-muted)',
          }}>
            <span style={{ color: 'var(--gold-light)', fontWeight: 600 }}>Mallard AI</span> elicits.
            A deterministic engine decides. No hallucinated numbers.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input::placeholder { color: var(--text-muted); opacity:1; }
      `}</style>
    </div>
  )
}

function ProfileSummary({ profile }) {
  const fields = [
    { label: 'Age', value: profile.age },
    { label: 'Annual Income', value: profile.household_income ? `$${Math.round(profile.household_income).toLocaleString()}` : null },
    { label: 'Monthly Expenses', value: profile.monthly_expenses ? `$${Math.round(profile.monthly_expenses).toLocaleString()}` : null },
    { label: 'Capital on Hand', value: profile.capital_on_hand != null ? `$${Math.round(profile.capital_on_hand).toLocaleString()}` : null },
    { label: 'Emergency Fund', value: profile.emergency_fund != null ? `$${Math.round(profile.emergency_fund).toLocaleString()}` : null },
    { label: 'Horizon', value: profile.horizon_years ? `${profile.horizon_years} yrs` : null },
    { label: 'Filing Status', value: profile.filing_status },
    { label: 'Income Stability', value: profile.income_stability },
    { label: 'Universe Pref', value: profile.universe_pref },
    { label: 'ESG Exclusions', value: profile.esg_exclusions?.length ? profile.esg_exclusions.join(', ') : 'None' },
    { label: 'Debts', value: profile.debts?.length ? `${profile.debts.length} item(s)` : 'None' },
  ].filter(f => f.value != null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map(({ label, value }) => (
        <div key={label} style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          animation: 'fadeUp 0.3s ease both',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>
            {label}
          </div>
          <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontWeight: 500 }}>
            {String(value)}
          </div>
        </div>
      ))}
    </div>
  )
}
