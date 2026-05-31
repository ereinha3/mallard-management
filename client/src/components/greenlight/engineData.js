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
  return onboardResult?.validated_profile
    ?? onboardResult?.profile
    ?? onboardResult?.optimizer_input
    ?? onboardResult
    ?? {}
}

export function getCapital(onboardResult) {
  const profile = getProfile(onboardResult)
  return Number(
    profile.capital_on_hand
      ?? onboardResult?.optimizer_input?.capital_on_hand
      ?? 0,
  )
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
  return Math.max(
    0,
    Number(
      onboardResult?.optimizer_input?.monthly_surplus
        ?? profile.monthly_surplus
        ?? profile.monthly_savings
        ?? profile.monthly_contribution
        ?? 0,
    ),
  )
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
  const source = weights && typeof weights === 'object'
    ? weights
    : {
        us_equity: 0.38,
        intl_equity: 0.2,
        bonds: 0.18,
        tips: 0.08,
        gold: 0.08,
        reits: 0.08,
      }
  const next = SLEEVE_ORDER.reduce((acc, sleeve) => {
    const value = Math.max(0, Number(source[sleeve] ?? 0))
    acc[sleeve] = Number.isFinite(value) ? value : 0
    return acc
  }, {})
  const total = Object.values(next).reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    const equal = 1 / SLEEVE_ORDER.length
    return SLEEVE_ORDER.reduce((acc, sleeve) => {
      acc[sleeve] = equal
      return acc
    }, {})
  }
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
  if (total <= 0) return { risky: 0.5, safe: 0.5 }
  return {
    risky: risky / total,
    safe: safe / total,
  }
}

export function withinGroupWeights(weights, sleeves) {
  const normalized = normalizeSleeveWeights(weights)
  const total = sleeves.reduce((sum, sleeve) => sum + Number(normalized[sleeve] ?? 0), 0)
  if (total <= 0) {
    const equal = 1 / sleeves.length
    return sleeves.reduce((acc, sleeve) => {
      acc[sleeve] = equal
      return acc
    }, {})
  }
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

export function combineGroupWeights(riskyShare, riskyWeights, safeWeights) {
  const growth = Math.max(0, Math.min(1, Number(riskyShare) || 0))
  const safeShare = 1 - growth
  return normalizeSleeveWeights({
    ...RISKY_SLEEVES.reduce((acc, sleeve) => {
      acc[sleeve] = growth * Number(riskyWeights?.[sleeve] ?? 0)
      return acc
    }, {}),
    ...SAFE_SLEEVES.reduce((acc, sleeve) => {
      acc[sleeve] = safeShare * Number(safeWeights?.[sleeve] ?? 0)
      return acc
    }, {}),
  })
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

export function allocationFromRiskDial(riskDial) {
  const dial = Math.max(0, Math.min(1, Number(riskDial) || 0))
  return combineGroupWeights(
    dial,
    {
      us_equity: 0.56,
      intl_equity: 0.28,
      reits: 0.08,
      gold: 0.08,
    },
    {
      bonds: 0.7,
      tips: 0.3,
    },
  )
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

export function estimatePortfolioMetrics(weights, riskDial = null) {
  const normalized = normalizeSleeveWeights(weights)
  const sleeveVol = {
    us_equity: 0.18,
    intl_equity: 0.20,
    bonds: 0.05,
    tips: 0.06,
    gold: 0.16,
    reits: 0.19,
  }
  const dial = riskDial ?? inferRiskDialFromWeights(normalized)
  const weightedVol = SLEEVE_ORDER.reduce((sum, sleeve) => (
    sum + (normalized[sleeve] * sleeveVol[sleeve])
  ), 0)
  const equityWeight = normalized.us_equity + normalized.intl_equity + normalized.reits
  const expectedVol = Math.max(0.035, weightedVol * (0.78 + (0.16 * dial)))
  const expectedShortfall = Math.max(0.06, expectedVol * 1.75 + equityWeight * 0.06)
  const rawRisk = SLEEVE_ORDER.reduce((acc, sleeve) => {
    acc[sleeve] = normalized[sleeve] * sleeveVol[sleeve]
    return acc
  }, {})
  const rawTotal = Object.values(rawRisk).reduce((sum, value) => sum + value, 0) || 1

  return {
    expected_vol: expectedVol,
    expected_shortfall_95: expectedShortfall,
    risk_contributions: SLEEVE_ORDER.reduce((acc, sleeve) => {
      acc[sleeve] = rawRisk[sleeve] / rawTotal
      return acc
    }, {}),
  }
}

export function riskSummaryFromMetrics(metrics) {
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

function driftSleeveWeights(bySleeve) {
  const entries = Object.entries(bySleeve ?? {}).filter(([, weight]) => Number(weight) > 0)
  if (entries.length < 2) return { ...(bySleeve ?? {}) }

  const [overSleeve, overTarget] = entries.reduce((best, entry) => (
    Number(entry[1]) > Number(best[1]) ? entry : best
  ))
  const restTotal = entries
    .filter(([sleeve]) => sleeve !== overSleeve)
    .reduce((sum, [, weight]) => sum + Number(weight), 0)
  const delta = Math.min(0.07, 1 - Number(overTarget), restTotal)
  if (delta <= 0) return { ...(bySleeve ?? {}) }

  return entries.reduce((next, [sleeve, target]) => {
    const numericTarget = Number(target)
    next[sleeve] = sleeve === overSleeve
      ? numericTarget + delta
      : Math.max(0, numericTarget - delta * (numericTarget / restTotal))
    return next
  }, {})
}

export function buildPositionsFromPortfolio(portfolio, capitalOnHand, { drift = false } = {}) {
  const weights = portfolio?.weights
  const byTicker = weights?.by_ticker ?? {}
  const bySleeve = weights?.by_sleeve ?? {}
  const sleeveMap = tickerSleeveMap(portfolio?.universe)
  const sleeveWeights = drift ? driftSleeveWeights(bySleeve) : bySleeve
  const portfolioValue = Math.max(0, Number(capitalOnHand ?? 0))

  const items = Object.entries(byTicker)
    .filter(([, targetWeight]) => Number(targetWeight) > 0)
    .map(([ticker, targetWeight]) => {
      const sleeve = sleeveMap[ticker]
      const targetSleeveWeight = Number(bySleeve[sleeve] ?? targetWeight)
      const currentSleeveWeight = Number(sleeveWeights[sleeve] ?? targetSleeveWeight)
      const tickerShareOfSleeve = targetSleeveWeight > 0
        ? Number(targetWeight) / targetSleeveWeight
        : 0
      const currentWeight = currentSleeveWeight * tickerShareOfSleeve
      const marketValue = Math.round(portfolioValue * currentWeight * 100) / 100
      const price = 100

      return {
        ticker,
        shares: marketValue / price,
        avg_cost: price,
        market_value: marketValue,
      }
    })

  const investedValue = Math.round(items.reduce((sum, item) => sum + item.market_value, 0) * 100) / 100
  return {
    items,
    portfolio_value: investedValue,
    cash: Math.max(0, Math.round((portfolioValue - investedValue) * 100) / 100),
  }
}

export function buildCostBasis(positions) {
  const preferredLoss = positions?.items?.find((item) => ['BND', 'TIP', 'SCHP'].includes(item.ticker))
    ?? positions?.items?.find((item) => item.market_value > 0)
  return (positions?.items ?? []).reduce((basis, item) => {
    basis[item.ticker] = item.market_value
    if (item.ticker === preferredLoss?.ticker) {
      basis[item.ticker] = Math.round(item.market_value * 1.08 * 100) / 100
    }
    return basis
  }, {})
}
