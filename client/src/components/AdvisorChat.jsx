import { useState, useEffect, useRef, useCallback } from 'react'
import { Feather, Send, AlertTriangle } from 'lucide-react'
import { streamAdvisor } from '../api/greenlightClient'

const SUGGESTIONS = [
  'How is my portfolio doing?',
  'Should I pay off debt or invest more?',
  'What is my retirement score?',
  'How much should I be saving each month?',
]

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
        maxWidth: 600, padding: '13px 17px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-bright)',
        borderTopLeftRadius: 4, borderTopRightRadius: 14,
        borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
        fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)',
        fontFamily: 'DM Sans, sans-serif',
        whiteSpace: 'pre-wrap',
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
        maxWidth: 480, padding: '12px 16px',
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

export default function AdvisorChat({ context, user }) {
  const [messages, setMessages] = useState([])
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const sessionIdRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus()
  }, [isStreaming])

  const callAdvisor = useCallback((msgList) => {
    setIsStreaming(true)
    setStreamingText('')
    setError(null)
    let accumulated = ''
    let committed = false

    streamAdvisor({
      messages: msgList,
      context,
      user_email: user?.email,
      session_id: sessionIdRef.current,
      onSession: (sessionId) => {
        sessionIdRef.current = sessionId
      },
      onToken: (chunk) => {
        accumulated += chunk
        setStreamingText(accumulated)
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
  }, [context, user?.email])

  function handleSend(e) {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text || isStreaming) return
    const updated = [...messages, { role: 'user', content: text }]
    setMessages(updated)
    setInputVal('')
    callAdvisor(updated)
  }

  function handleSuggestion(text) {
    if (isStreaming) return
    const updated = [...messages, { role: 'user', content: text }]
    setMessages(updated)
    callAdvisor(updated)
  }

  const hasContext = !!context

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
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
            Ask Mallard
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {isStreaming ? 'Typing...' : hasContext ? 'Grounded in your financial profile' : 'General financial Q&A'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isStreaming ? 'var(--gold-light)' : 'var(--emerald)',
            transition: 'background 0.3s',
            animation: isStreaming ? 'pulse 1.2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {isStreaming ? 'LIVE' : 'READY'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'hidden auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 24, textAlign: 'center' }}>
            <div>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 8 }}>
                What's on your mind?
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.6 }}>
                {hasContext
                  ? 'Ask anything about your portfolio, retirement timeline, debt strategy, or risk profile. I have your numbers.'
                  : 'Ask any financial question. Complete the Greenlight intake for personalized answers grounded in your profile.'}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 520 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  style={{
                    padding: '8px 14px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-bright)',
                    borderRadius: 20,
                    fontSize: 13, color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-light)'; e.currentTarget.style.color = 'var(--gold-light)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'assistant'
            ? <MallardBubble key={i} text={m.content} isStreaming={false} />
            : <UserBubble key={i} text={m.content} />
        )}

        {streamingText && <MallardBubble text={streamingText} isStreaming={true} />}

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
            placeholder={isStreaming ? 'Mallard is typing...' : 'Ask anything about your finances...'}
            disabled={isStreaming}
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
          Powered by Gemini. Educational only — not financial, tax, or investment advice.
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input::placeholder { color: var(--text-muted); opacity: 1; }
      `}</style>
    </div>
  )
}
