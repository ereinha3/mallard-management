const BASE = import.meta.env.VITE_GREENLIGHT_URL ?? 'http://localhost:8000'

/**
 * AUTH ENDPOINTS
 */

export async function register({ email, password, name }) {
  const res = await fetch(`${BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
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
  const res = await fetch(`${BASE}/api/v1/profile/${email}`)
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
export async function postOnboard(profile, userEmail = null) {
  const url = userEmail 
    ? `${BASE}/api/v1/onboard?user_email=${encodeURIComponent(userEmail)}`
    : `${BASE}/api/v1/onboard`
    
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

// ── Next.js finance-engine API (port 3000) ────────────────────────────────

const FINANCE_BASE = import.meta.env.VITE_FINANCE_URL ?? 'http://localhost:3000'

/**
 * POST /api/tax/harvest — analyse tax-loss harvesting opportunities.
 * @param {object} harvestInput  Matches HarvestInputSchema from lib/tax/taxLossHarvesting.ts
 */
export async function postHarvestAnalysis(harvestInput) {
  const res = await fetch(`${FINANCE_BASE}/api/tax/harvest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(harvestInput),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Harvest API error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/tax/rebalance — analyse tax-aware rebalancing.
 * @param {object} rebalanceInput  Matches RebalanceInputSchema from lib/tax/rebalancing.ts
 */
export async function postRebalanceAnalysis(rebalanceInput) {
  const res = await fetch(`${FINANCE_BASE}/api/tax/rebalance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rebalanceInput),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Rebalance API error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * POST /api/optimization/quarterly-report — run the full quarterly optimizer.
 * @param {object} clientSnapshot  Matches ClientSnapshotSchema from lib/optimization/types.ts
 */
export async function postQuarterlyReport(clientSnapshot) {
  const res = await fetch(`${FINANCE_BASE}/api/optimization/quarterly-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clientSnapshot),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Quarterly report error ${res.status}: ${text}`)
  }
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
