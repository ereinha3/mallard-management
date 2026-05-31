// Default the API base to the SAME host the frontend was served from, on port
// 8000. This makes out-of-band access work automatically: open the app at
// localhost:5173 -> calls localhost:8000; open it at a Tailscale/LAN IP -> calls
// that same IP:8000 (instead of a hardcoded "localhost" that would resolve to
// the viewer's own machine). Override explicitly with VITE_GREENLIGHT_URL.
const BASE =
  import.meta.env.VITE_GREENLIGHT_URL ??
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : 'http://localhost:8000')

/**
 * AUTH ENDPOINTS
 */

export async function register({ email, password, name, phone, zip, address }) {
  const res = await fetch(`${BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, phone, zip, address }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail ?? 'Registration failed')
  }
  return res.json()
}

export async function login({ email, password }) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail ?? 'Login failed')
  }
  return res.json()
}

export async function getProfile(email) {
  const res = await fetch(`${BASE}/api/v1/profile/${encodeURIComponent(email)}`)
  if (!res.ok) return null
  return res.json()
}

/**
 * GET /api/v1/users/{email}/active-onboarding — the latest in-progress elicitation
 * session for this user (transcript + extracted profile), so an interrupted
 * enrollment can be resumed by email alone. Returns { found, session } or null.
 */
export async function getActiveOnboarding(email) {
  const res = await fetch(`${BASE}/api/v1/users/${encodeURIComponent(email)}/active-onboarding`)
  if (!res.ok) return null
  return res.json()
}

/**
 * Stream the elicitation chat. Calls /api/v1/chat with the full message history.
 */
export async function streamChat({ messages, user_email, session_id, onSession, onToken, onProfileReady, onError, onDone }) {
  let res
  try {
    res = await fetch(`${BASE}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, user_email, session_id }),
    })
  } catch {
    onError?.(`Cannot reach Greenlight backend at ${BASE}. Is it running?`)
    return
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    onError?.(`Backend error ${res.status}: ${text}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') { onDone?.(); return }
      try {
        const event = JSON.parse(raw)
        if (event.type === 'session') onSession?.(event.session_id)
        else if (event.type === 'token') onToken?.(event.content)
        else if (event.type === 'profile_ready') onProfileReady?.(event.profile)
        else if (event.type === 'error') onError?.(event.content)
      } catch {
        // malformed event — skip
      }
    }
  }
  onDone?.()
}

/**
 * POST /api/v1/onboard — validate profile, run gate, return OnboardResponse.
 */
export async function postOnboard(profile, userEmail = null, sessionId = null) {
  const params = new URLSearchParams()
  if (userEmail) params.set('user_email', userEmail)
  // Passing the session id lets the backend mark that elicitation session
  // 'complete' so it is no longer surfaced as a resumable in-progress onboarding.
  if (sessionId) params.set('session_id', sessionId)
  const qs = params.toString()
  const url = qs ? `${BASE}/api/v1/onboard?${qs}` : `${BASE}/api/v1/onboard`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Onboard error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/v1/portfolio — build a portfolio from a profile.
 */
export async function postPortfolio(profile, method = 'erc') {
  const res = await fetch(`${BASE}/api/v1/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, method }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Portfolio error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/v1/projection — run a portfolio projection.
 */
export async function postProjection(payload) {
  const res = await fetch(`${BASE}/api/v1/projection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Projection error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/v1/rebalance — generate a rebalance recommendation.
 */
export async function postRebalance(payload) {
  const res = await fetch(`${BASE}/api/v1/rebalance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Rebalance error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/v1/tax/report — generate a tax report.
 */
export async function postTaxReport(payload) {
  const res = await fetch(`${BASE}/api/v1/tax/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Tax report error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/v1/portfolio/reoptimize — rerun optimizer from a risk dial target.
 */
export async function postReoptimize({ profile, risk_dial, weights = null }) {
  const res = await fetch(`${BASE}/api/v1/portfolio/reoptimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile,
      risk_dial,
      ...(weights ? { weights: { by_sleeve: weights?.by_sleeve ?? weights } } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Reoptimize error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/v1/portfolio/analyze-weights — analyze edited sleeve weights.
 */
export async function postAnalyzeWeights({ profile, weights }) {
  const res = await fetch(`${BASE}/api/v1/portfolio/analyze-weights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, weights: { by_sleeve: weights?.by_sleeve ?? weights } }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Analyze weights error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/v1/portfolio/save — persist an edited portfolio for a user.
 */
export async function postSavePortfolio({ user_email, portfolio, risk_summary = null }) {
  if (!user_email) throw new Error('Portfolio save requires a user email.')

  const res = await fetch(`${BASE}/api/v1/portfolio/save?user_email=${encodeURIComponent(user_email)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portfolio,
      ...(risk_summary ? { risk_summary } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Save portfolio error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function getPositions(userEmail) {
  if (!userEmail) throw new Error('Positions require a user email.')

  const res = await fetch(`${BASE}/api/v1/positions/${encodeURIComponent(userEmail)}`)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Positions error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function getFundingAccount(userEmail) {
  if (!userEmail) throw new Error('Funding account requires a user email.')

  const res = await fetch(`${BASE}/api/v1/funding/account/${encodeURIComponent(userEmail)}`)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Funding account error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function postMockDeposit({ user_email, amount }) {
  const res = await fetch(`${BASE}/api/v1/funding/mock/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_email, amount }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Deposit error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function postExecutionPreview({ user_email, weights }) {
  const res = await fetch(`${BASE}/api/v1/execution/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_email, weights }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Execution preview error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function postExecutionSubmit({ user_email, weights }) {
  const res = await fetch(`${BASE}/api/v1/execution/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_email, weights }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Execution submit error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function postRebalanceSubmit({ user_email, weights }) {
  const res = await fetch(`${BASE}/api/v1/execution/rebalance/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_email, weights }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Rebalance submit error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/v1/profile/update — persist profile changes and rerun the engine.
 */
export async function postUpdateProfile({ user_email, profile_patch }) {
  if (!user_email) throw new Error('Profile update requires a user email.')

  const res = await fetch(`${BASE}/api/v1/profile/update?user_email=${encodeURIComponent(user_email)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_patch }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Update profile error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * GET /api/v1/config — gate thresholds and market assumptions.
 */
export async function getConfig() {
  const res = await fetch(`${BASE}/api/v1/config`)
  if (!res.ok) throw new Error(`Config error ${res.status}`)
  return res.json()
}

export async function getUserRecord(email) {
  const res = await fetch(`${BASE}/api/v1/users/${encodeURIComponent(email)}/record`)
  if (!res.ok) throw new Error(`User record error ${res.status}`)
  return res.json()
}

export async function listChats(email, kind = null) {
  const params = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  const res = await fetch(`${BASE}/api/v1/users/${encodeURIComponent(email)}/chats${params}`)
  if (!res.ok) throw new Error(`Chats error ${res.status}`)
  return res.json()
}

// ── Streaming advisor Q&A ─────────────────────────────────────────────────

/**
 * POST /api/v1/advisor/chat — streaming advisor Q&A.
 * Same SSE protocol as streamChat but never emits profile_ready.
 */
export async function streamAdvisor({ messages, context, user_email, session_id, onSession, onToken, onError, onDone }) {
  let res
  try {
    res = await fetch(`${BASE}/api/v1/advisor/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context, user_email, session_id }),
    })
  } catch (e) {
    onError?.(`Cannot reach advisor endpoint: ${e.message}`)
    return
  }

  if (!res.ok) {
    onError?.(`Advisor error ${res.status}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') { onDone?.(); return }
      try {
        const event = JSON.parse(raw)
        if (event.type === 'session') onSession?.(event.session_id)
        else if (event.type === 'token') onToken?.(event.content)
        else if (event.type === 'error') onError?.(event.content)
      } catch { /* skip */ }
    }
  }
  onDone?.()
}
