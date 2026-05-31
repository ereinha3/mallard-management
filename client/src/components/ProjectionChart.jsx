import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { formatCurrency } from '../lib/utils'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const visiblePayload = payload.filter(p => ['p5', 'p25', 'p50', 'p75', 'p95'].includes(p.dataKey))
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-bright)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        minWidth: 200,
      }}
    >
      <div className="font-semibold mb-2" style={{ color: 'var(--text-secondary)', letterSpacing: '0.05em', fontSize: 11 }}>
        Year {label}
      </div>
      {visiblePayload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {p.dataKey.toUpperCase()}
            </span>
          </div>
          <span className="font-mono font-medium" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            {formatCurrency(p.value, true)}
          </span>
        </div>
      ))}
    </div>
  )
}

const tickStyle = {
  fill: 'var(--text-muted)',
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
}

function numberOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function getProjectionInputs(onboardResult) {
  const optimizer = onboardResult?.optimizer_input ?? {}
  const profile = onboardResult?.validated_profile ?? onboardResult?.profile ?? {}
  const horizonYears = numberOrNull(optimizer.horizon_years ?? profile.horizon_years) ?? 1
  const monthlyContribution = Math.max(0, numberOrNull(optimizer.monthly_surplus ?? profile.monthly_contribution ?? profile.monthly_savings) ?? 0)
  const capitalOnHand = Math.max(0, numberOrNull(optimizer.capital_on_hand ?? profile.capital_on_hand) ?? 0)
  const goalTarget = Math.max(0, numberOrNull(optimizer.goal_target ?? profile.goal_target) ?? 0)

  return {
    horizon_years: Math.max(1, Math.round(horizonYears)),
    monthly_contribution: monthlyContribution,
    capital_on_hand: capitalOnHand,
    goal_target: goalTarget,
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

function legacyRows(data) {
  return Array.isArray(data)
    ? data.map((row, i) => ({
        year: row.year ?? i + 1,
        p5: row.conservative ?? row.p5,
        p25: row.p25,
        p50: row.base ?? row.p50,
        p75: row.p75,
        p95: row.optimistic ?? row.p95,
      }))
    : []
}

export default function ProjectionChart({ data: liveData, projection: providedProjection, onboardResult, retirementYear }) {
  const [fetchedProjection, setFetchedProjection] = useState(null)
  const [loadingProjection, setLoadingProjection] = useState(false)
  const [projectionError, setProjectionError] = useState(null)
  const portfolio = onboardResult?.portfolio ?? null

  useEffect(() => {
    let cancelled = false

    async function loadProjection() {
      if (providedProjection || Array.isArray(liveData)) {
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
          ...getProjectionInputs(onboardResult),
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
  }, [providedProjection, liveData, onboardResult, portfolio])

  const projection = providedProjection ?? fetchedProjection
  const data = useMemo(() => (
    projection ? rowsFromProjection(projection) : legacyRows(liveData)
  ), [projection, liveData])
  const referenceYear = projection?.horizon_years ?? retirementYear

  if (!portfolio?.weights && !projection && !Array.isArray(liveData)) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
      >
        Portfolio weights are required before a Monte Carlo projection can run.
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

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
      >
        {projectionError ?? 'No projection data was returned.'}
      </div>
    )
  }

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
      <div style={{ width: '100%', height: projection ? 230 : 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradP95" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1eb87a" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#1eb87a" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradP75" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c49a2c" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#c49a2c" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="gradP25" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4a72e8" stopOpacity={0.16} />
                <stop offset="95%" stopColor="#4a72e8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCurrency(v, true)}
              width={58}
            />
            <Tooltip content={<CustomTooltip />} />
            {referenceYear && (
              <ReferenceLine
                x={String(referenceYear)}
                stroke="rgba(196,154,44,0.5)"
                strokeDasharray="4 4"
                label={{ value: 'Retire', position: 'top', fill: 'var(--gold-light)', fontSize: 10, fontFamily: 'DM Mono' }}
              />
            )}
            <Area type="monotone" dataKey="p95" stroke="#1eb87a" strokeWidth={1} fill="url(#gradP95)" dot={false} activeDot={false} />
            <Area type="monotone" dataKey="p75" stroke="#c49a2c" strokeWidth={1} fill="url(#gradP75)" dot={false} activeDot={false} />
            <Area type="monotone" dataKey="p25" stroke="#4a72e8" strokeWidth={1} fill="url(#gradP25)" dot={false} activeDot={false} />
            <Line type="monotone" dataKey="p50" stroke="#ddb84a" strokeWidth={2.25} dot={false} activeDot={{ r: 4, fill: '#ddb84a' }} />
            <Line type="monotone" dataKey="p5" stroke="rgba(230,69,69,0.8)" strokeWidth={1.25} dot={false} strokeDasharray="4 3" activeDot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
