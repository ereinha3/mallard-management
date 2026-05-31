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
