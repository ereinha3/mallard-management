import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { formatCurrency } from '../lib/utils'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
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
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, textTransform: 'capitalize' }}>
              {p.dataKey}
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

export default function ProjectionChart({ data: liveData, retirementYear }) {
  const data = Array.isArray(liveData) ? liveData : []

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ width: '100%', height: 280, color: 'var(--text-muted)' }}
      >
        No projection data was returned by the onboarding analysis.
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradOptimistic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1eb87a" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#1eb87a" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#c49a2c" stopOpacity={0.30} />
              <stop offset="95%" stopColor="#c49a2c" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradConservative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4a72e8" stopOpacity={0.20} />
              <stop offset="95%" stopColor="#4a72e8" stopOpacity={0} />
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
          {retirementYear && (
            <ReferenceLine
              x={String(retirementYear)}
              stroke="rgba(196,154,44,0.5)"
              strokeDasharray="4 4"
              label={{ value: 'Retire', position: 'top', fill: 'var(--gold-light)', fontSize: 10, fontFamily: 'DM Mono' }}
            />
          )}
          <Area
            type="monotone"
            dataKey="optimistic"
            stroke="#1eb87a"
            strokeWidth={1.5}
            fill="url(#gradOptimistic)"
            dot={false}
            activeDot={{ r: 4, fill: '#1eb87a' }}
          />
          <Area
            type="monotone"
            dataKey="base"
            stroke="#ddb84a"
            strokeWidth={2}
            fill="url(#gradBase)"
            dot={false}
            activeDot={{ r: 4, fill: '#ddb84a' }}
          />
          <Area
            type="monotone"
            dataKey="conservative"
            stroke="#4a72e8"
            strokeWidth={1.5}
            fill="url(#gradConservative)"
            dot={false}
            activeDot={{ r: 4, fill: '#4a72e8' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
