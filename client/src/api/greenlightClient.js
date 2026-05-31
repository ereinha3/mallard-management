const BASE = import.meta.env.VITE_GREENLIGHT_URL ?? 'http://localhost:8000'

async function jsonOrThrow(res, label) {
  if (res.ok) return res.json()

  const payload = await res.json().catch(() => null)
  const detail = payload?.detail ?? payload?.error?.message ?? payload?.error
  const message = typeof detail === 'string'
    ? detail
    : detail
    ? JSON.stringify(detail)
    : await res.text().catch(() => res.statusText)
  throw new Error(`${label} error ${res.status}: ${message}`)
}

function profileFromInput(input) {
  return input?.profile
    ?? input?.validated_profile
    ?? input?.onboard?.validated_profile
    ?? input
}

function projectionInputFromSnapshot(snapshot, portfolio) {
  const profile = profileFromInput(snapshot) ?? {}
  const optimizerInput = snapshot?.optimizer_input ?? {}
  const monthlyContribution = Math.max(
    0,
    snapshot?.monthly_contribution
      ?? snapshot?.monthlyContribution
      ?? optimizerInput.monthly_surplus
      ?? profile.monthly_surplus
      ?? 0,
  )

  return {
    weights: portfolio.weights,
    horizon_years: snapshot?.horizon_years ?? optimizerInput.horizon_years ?? profile.horizon_years ?? 30,
    monthly_contribution: monthlyContribution,
    capital_on_hand: snapshot?.capital_on_hand ?? optimizerInput.capital_on_hand ?? profile.capital_on_hand ?? 0,
    goal_target: snapshot?.goal_target ?? optimizerInput.goal_target ?? profile.goal_target ?? 0,
    generator: snapshot?.generator ?? 'stationary_bootstrap',
    seed: snapshot?.seed,
    n_paths: snapshot?.n_paths ?? 10000,
  }
}

/**
 * Stream the elicitation chat. Calls /api/v1/chat with the full message history.
 * Callbacks:
 *   onToken(text)        — each streamed text chunk
 *   onProfileReady(obj)  — fired when Gemini calls submit_profile
 *   onError(msg)         — backend error event or network failure
 *   onDone()             — stream closed normally
 */
export async function streamChat({ messages, onToken, onProfileReady, onError, onDone }) {
  let res
  try {
    res = await fetch(`${BASE}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
  } catch (e) {
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
        if (event.type === 'token') onToken?.(event.content)
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
export async function postOnboard(profile) {
  const res = await fetch(`${BASE}/api/v1/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  return jsonOrThrow(res, 'Onboard')
}

/**
 * GET /api/v1/config — gate thresholds and market assumptions.
 */
export async function getConfig() {
  const res = await fetch(`${BASE}/api/v1/config`)
  if (!res.ok) throw new Error(`Config error ${res.status}`)
  return res.json()
}

// ── Engine-backed finance endpoints ───────────────────────────────────────

/**
 * POST /api/v1/portfolio — build target universe, weights, and risk metrics.
 */
export async function postPortfolio(input) {
  const profile = profileFromInput(input)
  const res = await fetch(`${BASE}/api/v1/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  })
  return jsonOrThrow(res, 'Portfolio')
}

/**
 * POST /api/v1/projection — run Monte Carlo projection from target weights.
 */
export async function postProjection(projectionInput) {
  const res = await fetch(`${BASE}/api/v1/projection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectionInput),
  })
  return jsonOrThrow(res, 'Projection')
}

/**
 * Former quarterly report entry point, now backed by /api/v1/portfolio and
 * /api/v1/projection on the Python backend.
 */
export async function postQuarterlyReport(clientSnapshot) {
  const hasProfile = Boolean(
    clientSnapshot?.profile
      ?? clientSnapshot?.validated_profile
      ?? clientSnapshot?.onboard?.validated_profile,
  )
  const portfolio = hasProfile ? await postPortfolio(clientSnapshot) : clientSnapshot?.portfolio
  if (!portfolio) throw new Error('Quarterly report requires a profile or portfolio payload')
  const projection = await postProjection(projectionInputFromSnapshot(clientSnapshot, portfolio))
  return {
    portfolio,
    projection,
    universe: portfolio.universe,
    weights: portfolio.weights,
    metrics: portfolio.metrics,
  }
}

/**
 * POST /api/v1/tax/report — analyse tax-loss harvesting opportunities.
 */
export async function postHarvestAnalysis(taxReportInput) {
  const res = await fetch(`${BASE}/api/v1/tax/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taxReportInput),
  })
  return jsonOrThrow(res, 'Tax report')
}

/**
 * POST /api/v1/rebalance — decide drift-band rebalancing.
 */
export async function postRebalanceAnalysis(rebalanceInput) {
  const res = await fetch(`${BASE}/api/v1/rebalance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rebalanceInput),
  })
  return jsonOrThrow(res, 'Rebalance')
}

// ── Streaming advisor Q&A ─────────────────────────────────────────────────

/**
 * POST /api/v1/advisor/chat — streaming advisor Q&A.
 * Same SSE protocol as streamChat but never emits profile_ready.
 */
export async function streamAdvisor({ messages, context, onToken, onError, onDone }) {
  let res
  try {
    res = await fetch(`${BASE}/api/v1/advisor/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
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
        if (event.type === 'token') onToken?.(event.content)
        else if (event.type === 'error') onError?.(event.content)
      } catch { /* skip */ }
    }
  }
  onDone?.()
}
