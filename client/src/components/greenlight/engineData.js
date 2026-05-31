export const RISKY_SLEEVES = ['us_equity', 'intl_equity', 'reits', 'gold']
export const SAFE_SLEEVES = ['bonds', 'tips']
export const SLEEVE_ORDER = ['us_equity', 'intl_equity', 'bonds', 'tips', 'gold', 'reits']
export const OTHER_SLEEVE = 'other'

export const SLEEVE_META = {
  us_equity: { label: 'US Equity', color: '#ddb84a' },
  intl_equity: { label: 'Intl Equity', color: '#4a72e8' },
  bonds: { label: 'Bonds', color: '#6b7280' },
  tips: { label: 'TIPS', color: '#22c27e' },
  gold: { label: 'Gold', color: '#f0c060' },
  reits: { label: 'REITs', color: '#8b5cf6' },
  [OTHER_SLEEVE]: { label: 'Other', color: '#14b8a6' },
}

export function getProfile(onboardResult) {
  const candidates = [
    onboardResult?.validated_profile,
    onboardResult?.profile,
    onboardResult?.optimizer_input,
    onboardResult,
  ]

  return candidates.find(candidate => {
    if (!candidate || typeof candidate !== 'object') return false
    return Number.isFinite(Number(candidate.horizon_years))
      || Number.isFinite(Number(candidate.capital_on_hand))
  }) ?? null
}

export function getCapital(onboardResult) {
  const profile = getProfile(onboardResult)
  const capital = Number(
    profile?.capital_on_hand
      ?? onboardResult?.optimizer_input?.capital_on_hand
  )
  return Number.isFinite(capital) ? capital : null
}

export function getPortfolio(onboardResult) {
  return onboardResult?.portfolio
    ?? onboardResult?.optimizer_input?.portfolio
    ?? null
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
    onboardResult?.optimizer_input?.monthly_surplus
      ?? profile?.monthly_surplus
      ?? profile?.monthly_savings
      ?? profile?.monthly_contribution,
  )
  return Number.isFinite(monthly) ? Math.max(0, monthly) : null
}

export function formatMoney(value, compact = false) {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(amount)
}

export function formatPercent(value, digits = 1) {
  const pct = Number(value ?? 0) * 100
  return `${pct.toFixed(digits)}%`
}

export function formatPctPoints(value, digits = 1) {
  return `${Number(value ?? 0).toFixed(digits)}pp`
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
  const next = SLEEVE_ORDER.reduce((acc, sleeve) => ({ ...acc, [sleeve]: 0 }), {})
  let other = 0

  Object.entries(source).forEach(([sleeve, rawValue]) => {
    const value = Math.max(0, Number(rawValue ?? 0))
    if (!Number.isFinite(value)) return
    if (SLEEVE_ORDER.includes(sleeve)) {
      next[sleeve] += value
    } else {
      other += value
    }
  })

  if (other > 0) next[OTHER_SLEEVE] = other

  const total = Object.values(next).reduce((sum, value) => sum + value, 0)
  if (total <= 0) return {}
  return Object.keys(next).reduce((acc, sleeve) => {
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
  const orderedSleeves = [
    ...SLEEVE_ORDER,
    ...Object.keys(normalized).filter(sleeve => !SLEEVE_ORDER.includes(sleeve)),
  ]

  return orderedSleeves.map((sleeve) => {
    const weight = normalized[sleeve]
    const tickers = sleeve === OTHER_SLEEVE
      ? Object.entries(sleeves)
        .filter(([key]) => !SLEEVE_ORDER.includes(key))
        .flatMap(([, sleeveTickers]) => sleeveTickers ?? [])
      : sleeves[sleeve] ?? []
    return {
      key: sleeve,
      sleeve,
      label: sleeveLabel(sleeve),
      color: sleeveColor(sleeve),
      ticker: tickers[0] ?? null,
      tickers,
      weight,
      pct: weight * 100,
      amount: total != null ? Math.round(total * weight) : null,
    }
  })
}

export function withDisplayAllocationPcts(allocation, digits = 1) {
  const scale = 10 ** digits
  const targetUnits = 100 * scale
  const rows = (allocation ?? []).map((row, index) => {
    const pct = Number(row.pct)
    const scaled = Number.isFinite(pct) && pct > 0 ? pct * scale : 0
    const units = Math.floor(scaled)
    return {
      row,
      index,
      units,
      remainder: scaled - units,
    }
  })
  const pctTotal = rows.reduce((sum, item) => sum + Math.max(0, Number(item.row.pct) || 0), 0)

  if (pctTotal <= 0) {
    return rows.map(item => ({
      ...item.row,
      displayPct: 0,
    }))
  }

  const unitTotal = rows.reduce((sum, item) => sum + item.units, 0)
  const remaining = Math.max(0, targetUnits - unitTotal)
  const sorted = [...rows].sort((a, b) => (
    b.remainder - a.remainder
      || Number(b.row.pct ?? 0) - Number(a.row.pct ?? 0)
      || a.index - b.index
  ))

  for (let i = 0; i < remaining; i += 1) {
    if (!sorted.length) break
    sorted[i % sorted.length].units += 1
  }

  return rows.map(item => ({
    ...item.row,
    displayPct: item.units / scale,
  }))
}

export function inferRiskDialFromWeights(weights) {
  const normalized = normalizeSleeveWeights(weights)
  const growth = RISKY_SLEEVES.reduce((sum, sleeve) => sum + normalized[sleeve], 0)
  return Math.max(0, Math.min(1, growth))
}

export function renormalizeWithinGroupChange(weights, changedSleeve, changedPct, groupSleeves) {
  const current = normalizeSleeveWeights(weights)
  const sleeves = groupSleeves.includes(changedSleeve) ? groupSleeves : SLEEVE_ORDER
  const outputOrder = [
    ...SLEEVE_ORDER,
    ...Object.keys(current).filter(sleeve => !SLEEVE_ORDER.includes(sleeve)),
  ]
  const groupShare = sleeves.reduce((sum, sleeve) => sum + current[sleeve], 0)
  const targetWithin = Math.max(0, Math.min(1, Number(changedPct) / 100))
  const target = groupShare * targetWithin
  const others = sleeves.filter(sleeve => sleeve !== changedSleeve)
  const otherTotal = others.reduce((sum, sleeve) => sum + current[sleeve], 0)
  const remaining = Math.max(0, groupShare - target)

  return outputOrder.reduce((next, sleeve) => {
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
  const total = Math.max(0, Number(capitalOnHand ?? 0))

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
        amount: Math.round(total * Number(weight)),
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
