import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '../lib/utils'

function numberOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function getProjectionInputs(onboardResult) {
  const optimizer = onboardResult?.optimizer_input ?? {}
  const profile = onboardResult?.validated_profile ?? onboardResult?.profile ?? {}
  const horizonYears = numberOrNull(optimizer.horizon_years ?? profile.horizon_years)
  const monthlyContribution = numberOrNull(optimizer.monthly_surplus ?? profile.monthly_contribution ?? profile.monthly_savings)
  const capitalOnHand = numberOrNull(optimizer.capital_on_hand ?? profile.capital_on_hand)
  const goalTarget = numberOrNull(optimizer.goal_target ?? profile.goal_target)

  if (horizonYears == null || monthlyContribution == null || capitalOnHand == null || goalTarget == null) {
    return null
  }

  return {
    horizon_years: Math.max(1, Math.round(horizonYears)),
    monthly_contribution: Math.max(0, monthlyContribution),
    capital_on_hand: Math.max(0, capitalOnHand),
    goal_target: Math.max(0, goalTarget),
  }
}

function rowsFromProjection(projection) {
  const paths = projection?.percentile_paths ?? {}
  const length = Math.max(
    paths.p5?.length ?? 0,
    paths.p25?.length ?? 0,
    paths.p50?.length ?? 0,
    paths.p75?.length ?? 0,
    paths.p95?.length ?? 0,
  )

  return Array.from({ length }, (_, i) => ({
    year: i + 1,
    p5: paths.p5?.[i],
    p25: paths.p25?.[i],
    p50: paths.p50?.[i],
    p75: paths.p75?.[i],
    p95: paths.p95?.[i],
  }))
}

function projectionScale(data) {
  const values = data.flatMap(row => [row.p5, row.p25, row.p50, row.p75, row.p95])
    .map(Number)
    .filter(Number.isFinite)
  if (values.length === 0) return null

  const min = Math.min(0, ...values)
  const max = Math.max(...values)
  const pad = Math.max((max - min) * 0.08, max * 0.04, 1)
  return { min, max: max + pad }
}

function linePath(data, key, xFor, yFor) {
  return data
    .map((row, index) => {
      const value = Number(row[key])
      if (!Number.isFinite(value)) return null
      return `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`
    })
    .filter(Boolean)
    .join(' ')
}

function bandPath(data, lowerKey, upperKey, xFor, yFor) {
  const upper = data
    .map((row, index) => ({ x: xFor(index), y: yFor(Number(row[upperKey])) }))
    .filter(point => Number.isFinite(point.y))
  const lower = data
    .map((row, index) => ({ x: xFor(index), y: yFor(Number(row[lowerKey])) }))
    .filter(point => Number.isFinite(point.y))
    .reverse()
  if (upper.length === 0 || lower.length === 0) return ''
  return [
    `M ${upper[0].x.toFixed(2)} ${upper[0].y.toFixed(2)}`,
    ...upper.slice(1).map(point => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    ...lower.map(point => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    'Z',
  ].join(' ')
}

export default function ProjectionChart({ projection: providedProjection, onboardResult, retirementYear }) {
  const [fetchedProjection, setFetchedProjection] = useState(null)
  const [loadingProjection, setLoadingProjection] = useState(false)
  const [projectionError, setProjectionError] = useState(null)
  const portfolio = onboardResult?.portfolio ?? null

  useEffect(() => {
    let cancelled = false

    async function loadProjection() {
      if (providedProjection) {
        setFetchedProjection(null)
        setProjectionError(null)
        setLoadingProjection(false)
        return
      }

      if (!portfolio?.weights) {
        setProjectionError(null)
        setLoadingProjection(false)
        return
      }

      const projectionInputs = getProjectionInputs(onboardResult)
      if (!projectionInputs) {
        setProjectionError(null)
        setLoadingProjection(false)
        return
      }

      setLoadingProjection(true)
      setProjectionError(null)
      try {
        const client = await import('../api/greenlightClient')
        const postProjection = client.postProjection
        if (typeof postProjection !== 'function') {
          throw new Error('Projection endpoint wrapper is not available.')
        }
        const response = await postProjection({
          weights: portfolio.weights,
          ...projectionInputs,
          generator: 'stationary_bootstrap',
          n_paths: 10000,
        })
        if (!cancelled) setFetchedProjection(response)
      } catch (error) {
        if (!cancelled) setProjectionError(error?.message ?? 'Projection could not be loaded.')
      } finally {
        if (!cancelled) setLoadingProjection(false)
      }
    }

    loadProjection()

    return () => { cancelled = true }
  }, [providedProjection, onboardResult, portfolio])

  const projection = providedProjection ?? fetchedProjection
  const data = useMemo(() => (projection ? rowsFromProjection(projection) : []), [projection])
  const referenceYear = projection?.horizon_years ?? retirementYear
  const scale = useMemo(() => projectionScale(data), [data])

  if (!portfolio?.weights && !projection) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
      >
        Portfolio weights are required before a Monte Carlo projection can run.
      </div>
    )
  }

  if (!projection && !getProjectionInputs(onboardResult)) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
      >
        Projection inputs were not returned by the backend.
      </div>
    )
  }

  if (loadingProjection && data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
      >
        Running Monte Carlo projection...
      </div>
    )
  }

  if (data.length === 0 || !scale) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
      >
        {projectionError ?? 'No projection data was returned.'}
      </div>
    )
  }

  const width = 720
  const height = projection ? 230 : 280
  const margin = { top: 14, right: 18, bottom: 30, left: 70 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const xFor = (index) => margin.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * plotWidth)
  const yFor = (value) => margin.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(part => scale.min + (scale.max - scale.min) * part)
  const xTicks = [0, Math.floor((data.length - 1) / 2), data.length - 1]
    .filter((value, index, values) => values.indexOf(value) === index)
  const p90Band = bandPath(data, 'p5', 'p95', xFor, yFor)
  const p50Band = bandPath(data, 'p25', 'p75', xFor, yFor)
  const retireX = referenceYear && Number(referenceYear) <= data.length ? xFor(Number(referenceYear) - 1) : null

  return (
    <div>
      {projection && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Success Probability</div>
            <div className="font-display font-semibold" style={{ color: 'var(--emerald)', fontSize: 24, lineHeight: 1 }}>
              {(Number(projection.p_success ?? 0) * 100).toFixed(0)}%
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Median Terminal</div>
            <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)', fontSize: 16 }}>
              {formatCurrency(Number(projection.median_terminal ?? 0), true)}
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(230,69,69,0.08)', border: '1px solid rgba(230,69,69,0.16)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Bad Case</div>
            <div className="font-mono font-semibold" style={{ color: 'var(--ruby)', fontSize: 16 }}>
              {formatCurrency(Number(projection.bad_case_terminal ?? 0), true)}
            </div>
          </div>
        </div>
      )}
      <div style={{ width: '100%', height }}>
        <svg
          role="img"
          aria-label="Monte Carlo portfolio projection percentile paths"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <linearGradient id="projectionBand90" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a72e8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#4a72e8" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="projectionBand50" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ddb84a" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#ddb84a" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = yFor(tick)
            return (
              <g key={`y-${tick}`}>
                <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="var(--border)" strokeDasharray="3 4" />
                <text x={margin.left - 10} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize="11" fontFamily="DM Mono, monospace">
                  {formatCurrency(tick, true)}
                </text>
              </g>
            )
          })}

          {xTicks.map((index) => (
            <text key={`x-${index}`} x={xFor(index)} y={height - 8} textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="DM Mono, monospace">
              Yr {data[index]?.year}
            </text>
          ))}

          {retireX != null && (
            <g>
              <line x1={retireX} y1={margin.top} x2={retireX} y2={height - margin.bottom} stroke="rgba(196,154,44,0.55)" strokeDasharray="4 4" />
              <text x={retireX - 6} y={margin.top + 12} textAnchor="end" fill="var(--gold-light)" fontSize="10" fontFamily="DM Mono, monospace">
                Retire
              </text>
            </g>
          )}

          {p90Band && <path d={p90Band} fill="url(#projectionBand90)" />}
          {p50Band && <path d={p50Band} fill="url(#projectionBand50)" />}
          <path d={linePath(data, 'p95', xFor, yFor)} fill="none" stroke="#1eb87a" strokeWidth="1.4" />
          <path d={linePath(data, 'p75', xFor, yFor)} fill="none" stroke="#c49a2c" strokeWidth="1.2" opacity="0.7" />
          <path d={linePath(data, 'p25', xFor, yFor)} fill="none" stroke="#4a72e8" strokeWidth="1.2" opacity="0.7" />
          <path d={linePath(data, 'p50', xFor, yFor)} fill="none" stroke="#ddb84a" strokeWidth="2.8" />
          <path d={linePath(data, 'p5', xFor, yFor)} fill="none" stroke="rgba(230,69,69,0.85)" strokeWidth="1.4" strokeDasharray="5 4" />
        </svg>
      </div>
    </div>
  )
}
