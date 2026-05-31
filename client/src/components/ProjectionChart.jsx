import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatPercent, numberOrNull } from '../lib/utils'
import { ChartContainer, ChartTooltipContent } from './ui/chart'

// Percentile series shown in the hover tooltip (ranged bands stay out of it).
const TOOLTIP_SERIES = [
  { key: 'p95', label: 'Optimistic · 95th', color: 'var(--emerald)' },
  { key: 'p75', label: '75th', color: 'var(--gold-light)' },
  { key: 'p50', label: 'Median', color: 'var(--gold-bright)' },
  { key: 'p25', label: '25th', color: 'var(--gold)' },
  { key: 'p5', label: 'Downside · 5th', color: 'var(--ruby)' },
]

function getProjectionInputs(onboardResult) {
  const optimizer = onboardResult?.optimizer_input ?? {}
  const profile = onboardResult?.validated_profile ?? {}
  const snapshot = onboardResult?.financial_analysis?.snapshot ?? {}
  const horizonYears = numberOrNull(optimizer.horizon_years ?? profile.horizon_years)
  const monthlyContribution = numberOrNull(optimizer.monthly_surplus ?? snapshot.monthly_surplus ?? profile.monthly_surplus)
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

  return Array.from({ length }, (_, i) => {
    const p5 = numberOrNull(paths.p5?.[i])
    const p25 = numberOrNull(paths.p25?.[i])
    const p50 = numberOrNull(paths.p50?.[i])
    const p75 = numberOrNull(paths.p75?.[i])
    const p95 = numberOrNull(paths.p95?.[i])
    return {
      year: i + 1,
      p5: p5 ?? undefined,
      p25: p25 ?? undefined,
      p50: p50 ?? undefined,
      p75: p75 ?? undefined,
      p95: p95 ?? undefined,
      // Ranged areas for Recharts (rendered as shaded confidence bands).
      band90: p5 != null && p95 != null ? [p5, p95] : undefined,
      band50: p25 != null && p75 != null ? [p25, p75] : undefined,
    }
  })
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
  const projectionInputs = useMemo(() => getProjectionInputs(onboardResult), [onboardResult])
  const referenceYear = numberOrNull(projection?.horizon_years ?? projectionInputs?.horizon_years ?? retirementYear)
  const scale = useMemo(() => projectionScale(data), [data])
  const successPercent = numberOrNull(projection?.p_success)
  const medianTerminal = numberOrNull(projection?.median_terminal)
  const badCaseTerminal = numberOrNull(projection?.bad_case_terminal)

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

  if (!projection && !projectionInputs) {
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

  const height = projection ? 240 : 290
  const retireYear =
    referenceYear && Number(referenceYear) >= 1 && Number(referenceYear) <= data.length
      ? Number(referenceYear)
      : null
  const axisTick = { fontSize: 11, fontFamily: 'DM Mono, monospace', fill: 'var(--text-muted)' }

  return (
    <div>
      {projection && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Success Probability</div>
            <div className="font-display font-semibold" style={{ color: 'var(--emerald)', fontSize: 24, lineHeight: 1 }}>
              {successPercent == null ? '—' : formatPercent(successPercent * 100)}
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Median Terminal</div>
            <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)', fontSize: 16 }}>
              {formatCurrency(medianTerminal, true)}
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(230,69,69,0.08)', border: '1px solid rgba(230,69,69,0.16)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Bad Case</div>
            <div className="font-mono font-semibold" style={{ color: 'var(--ruby)', fontSize: 16 }}>
              {formatCurrency(badCaseTerminal, true)}
            </div>
          </div>
        </div>
      )}
      <ChartContainer height={height} className="anim-fade-up">
        <ComposedChart data={data} margin={{ top: 10, right: 14, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="projectionBand90" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--emerald)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--emerald)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="projectionBand50" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold-bright)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--gold-bright)" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false} />
          <XAxis
            dataKey="year"
            tickFormatter={(year) => `Yr ${year}`}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            minTickGap={44}
            dy={6}
          />
          <YAxis
            domain={[scale.min, scale.max]}
            tickFormatter={(value) => formatCurrency(value, true)}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={62}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border-bright)', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={
              <ChartTooltipContent
                series={TOOLTIP_SERIES}
                labelPrefix="Year "
                formatValue={(value) => formatCurrency(value, true)}
              />
            }
          />

          {/* 5th–95th and 25th–75th confidence bands */}
          <Area
            dataKey="band90"
            stroke="none"
            fill="url(#projectionBand90)"
            connectNulls
            isAnimationActive
            animationDuration={650}
          />
          <Area
            dataKey="band50"
            stroke="none"
            fill="url(#projectionBand50)"
            connectNulls
            isAnimationActive
            animationDuration={650}
          />

          {/* Downside (5th) and the median path */}
          <Line
            dataKey="p5"
            stroke="var(--ruby)"
            strokeWidth={1.4}
            strokeDasharray="5 4"
            dot={false}
            opacity={0.8}
            connectNulls
            isAnimationActive
            animationDuration={650}
          />
          <Line
            dataKey="p50"
            stroke="var(--gold-bright)"
            strokeWidth={2.6}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--gold-bright)', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
            connectNulls
            isAnimationActive
            animationDuration={650}
          />

          {retireYear != null && (
            <ReferenceLine
              x={retireYear}
              stroke="rgba(201, 151, 26, 0.5)"
              strokeDasharray="4 4"
              label={{
                value: 'Retire',
                position: 'insideTopRight',
                fill: 'var(--gold-light)',
                fontSize: 10,
                fontFamily: 'DM Mono, monospace',
              }}
            />
          )}
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
