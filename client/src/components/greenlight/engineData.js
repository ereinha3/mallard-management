export const RISKY_SLEEVES = ['us_equity', 'intl_equity', 'reits', 'gold']
export const SAFE_SLEEVES = ['bonds', 'tips']
export const SLEEVE_ORDER = ['us_equity', 'intl_equity', 'bonds', 'tips', 'gold', 'reits']

export const SLEEVE_META = {
  us_equity: { label: 'US Equity', color: '#ddb84a' },
  intl_equity: { label: 'Intl Equity', color: '#4a72e8' },
  bonds: { label: 'Bonds', color: '#6b7280' },
  tips: { label: 'TIPS', color: '#22c27e' },
  gold: { label: 'Gold', color: '#f0c060' },
  reits: { label: 'REITs', color: '#8b5cf6' },
}

export function getProfile(onboardResult) {
  return onboardResult?.validated_profile ?? {}
}

export function getCapital(onboardResult) {
  const profile = getProfile(onboardResult)
  const capital = Number(
    profile.capital_on_hand
      ?? onboardResult?.optimizer_input?.capital_on_hand
  )
  return Number.isFinite(capital) ? capital : null
}

export function getPortfolio(onboardResult) {
  return onboardResult?.portfolio ?? null
}

export function getSleeveWeights(onboardResult) {
  return normalizeSleeveWeights(
    getPortfolio(onboardResult)?.weights?.by_sleeve
      ?? onboardResult?.weights?.by_sleeve
      ?? null,
  )
}

export function getMonthlyContribution(onboardResult) {
  const profile = getProfile(onboardResult)
  const monthly = Number(
    onboardResult?.financial_analysis?.snapshot?.monthly_surplus
      ?? onboardResult?.optimizer_input?.monthly_surplus
      ?? profile.monthly_surplus
  )
  return Number.isFinite(monthly) ? Math.max(0, monthly) : null
}

export function formatMoney(value, compact = false) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(amount)
}

export function formatPercent(value, digits = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  const pct = parsed * 100
  return `${pct.toFixed(digits)}%`
}

export function formatPctPoints(value, digits = 1) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? `${parsed.toFixed(digits)}pp` : '—'
}

export function sleeveLabel(sleeve) {
  return SLEEVE_META[sleeve]?.label ?? String(sleeve ?? '').replace(/_/g, ' ')
}

export function sleeveColor(sleeve) {
  return SLEEVE_META[sleeve]?.color ?? '#6b7280'
}

export function normalizeSleeveWeights(weights) {
  if (!weights || typeof weights !== 'object') return {}
  const source = weights
  const next = SLEEVE_ORDER.reduce((acc, sleeve) => {
    const value = Math.max(0, Number(source[sleeve] ?? 0))
    acc[sleeve] = Number.isFinite(value) ? value : 0
    return acc
  }, {})
  const total = Object.values(next).reduce((sum, value) => sum + value, 0)
  if (total <= 0) return {}
  return SLEEVE_ORDER.reduce((acc, sleeve) => {
    acc[sleeve] = next[sleeve] / total
    return acc
  }, {})
}

export function bucketShare(weights, sleeves) {
  const normalized = normalizeSleeveWeights(weights)
  return sleeves.reduce((sum, sleeve) => sum + Number(normalized[sleeve] ?? 0), 0)
}

export function portfolioSplit(weights) {
  const normalized = normalizeSleeveWeights(weights)
  const risky = bucketShare(normalized, RISKY_SLEEVES)
  const safe = bucketShare(normalized, SAFE_SLEEVES)
  const total = risky + safe
  if (total <= 0) return { risky: 0, safe: 0 }
  return {
    risky: risky / total,
    safe: safe / total,
  }
}

export function withinGroupWeights(weights, sleeves) {
  const normalized = normalizeSleeveWeights(weights)
  const total = sleeves.reduce((sum, sleeve) => sum + Number(normalized[sleeve] ?? 0), 0)
  if (total <= 0) return {}
  return sleeves.reduce((acc, sleeve) => {
    acc[sleeve] = Number(normalized[sleeve] ?? 0) / total
    return acc
  }, {})
}

export function groupWeights(weights) {
  return {
    risky: withinGroupWeights(weights, RISKY_SLEEVES),
    safe: withinGroupWeights(weights, SAFE_SLEEVES),
  }
}

export function weightsToAllocation(weights, portfolio, capitalOnHand) {
  const normalized = normalizeSleeveWeights(weights)
  const total = Number.isFinite(Number(capitalOnHand)) ? Math.max(0, Number(capitalOnHand)) : null
  const sleeves = portfolio?.universe?.sleeves ?? {}

  return SLEEVE_ORDER.map((sleeve) => {
    const weight = normalized[sleeve]
    const tickers = sleeves[sleeve] ?? []
    return {
      key: sleeve,
      sleeve,
      label: sleeveLabel(sleeve),
      color: sleeveColor(sleeve),
      ticker: tickers[0] ?? null,
      tickers,
      weight,
      pct: Math.round(weight * 1000) / 10,
      amount: total != null ? Math.round(total * weight) : null,
    }
  })
}

export function inferRiskDialFromWeights(weights) {
  const normalized = normalizeSleeveWeights(weights)
  const growth = RISKY_SLEEVES.reduce((sum, sleeve) => sum + normalized[sleeve], 0)
  return Math.max(0, Math.min(1, growth))
}

export function renormalizeWithinGroupChange(weights, changedSleeve, changedPct, groupSleeves) {
  const current = normalizeSleeveWeights(weights)
  const sleeves = groupSleeves.includes(changedSleeve) ? groupSleeves : SLEEVE_ORDER
  const groupShare = sleeves.reduce((sum, sleeve) => sum + current[sleeve], 0)
  const targetWithin = Math.max(0, Math.min(1, Number(changedPct) / 100))
  const target = groupShare * targetWithin
  const others = sleeves.filter(sleeve => sleeve !== changedSleeve)
  const otherTotal = others.reduce((sum, sleeve) => sum + current[sleeve], 0)
  const remaining = Math.max(0, groupShare - target)

  return SLEEVE_ORDER.reduce((next, sleeve) => {
    if (sleeve === changedSleeve) {
      next[sleeve] = target
    } else if (!sleeves.includes(sleeve)) {
      next[sleeve] = current[sleeve]
    } else if (otherTotal > 0) {
      next[sleeve] = current[sleeve] * (remaining / otherTotal)
    } else {
      next[sleeve] = remaining / others.length
    }
    return next
  }, {})
}

export function renormalizeSleeveChange(weights, changedSleeve, changedPct) {
  const group = RISKY_SLEEVES.includes(changedSleeve) ? RISKY_SLEEVES : SAFE_SLEEVES
  return renormalizeWithinGroupChange(weights, changedSleeve, changedPct, group)
}

export function riskSummaryFromMetrics(metrics) {
  if (!metrics) return null
  return {
    target_volatility_pct: Number(metrics?.expected_vol ?? 0) * 100,
    estimated_max_loss_1yr_pct: Number(metrics?.expected_shortfall_95 ?? 0) * 100,
  }
}

export function tickerSleeveMap(universe) {
  const map = {}
  Object.entries(universe?.sleeves ?? {}).forEach(([sleeve, tickers]) => {
    ;(tickers ?? []).forEach((ticker) => {
      map[ticker] = sleeve
    })
  })
  return map
}

export function allocationRows(portfolio, capitalOnHand) {
  const byTicker = portfolio?.weights?.by_ticker ?? {}
  const bySleeve = portfolio?.weights?.by_sleeve ?? {}
  const sleeveMap = tickerSleeveMap(portfolio?.universe)
  const parsedTotal = Number(capitalOnHand)
  const total = Number.isFinite(parsedTotal) ? Math.max(0, parsedTotal) : null

  return Object.entries(byTicker)
    .filter(([, weight]) => Number(weight) > 0)
    .map(([ticker, weight]) => {
      const sleeve = sleeveMap[ticker]
      return {
        ticker,
        sleeve,
        label: sleeveLabel(sleeve),
        weight: Number(weight),
        pct: Number(weight) * 100,
        sleeveWeight: Number(bySleeve[sleeve] ?? weight),
        amount: total != null ? Math.round(total * Number(weight)) : null,
        color: sleeveColor(sleeve),
      }
    })
    .sort((a, b) => {
      const sleeveOrder = SLEEVE_ORDER.indexOf(a.sleeve) - SLEEVE_ORDER.indexOf(b.sleeve)
      return sleeveOrder || a.ticker.localeCompare(b.ticker)
    })
}

export function projectionRows(projection) {
  const paths = projection?.percentile_paths ?? {}
  const length = Math.max(
    paths.p5?.length ?? 0,
    paths.p25?.length ?? 0,
    paths.p50?.length ?? 0,
    paths.p75?.length ?? 0,
    paths.p95?.length ?? 0,
  )

  return Array.from({ length }, (_, i) => ({
    year: i,
    p5: paths.p5?.[i],
    p25: paths.p25?.[i],
    p50: paths.p50?.[i],
    p75: paths.p75?.[i],
    p95: paths.p95?.[i],
  }))
}
