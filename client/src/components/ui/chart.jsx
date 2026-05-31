import { ResponsiveContainer } from 'recharts'
import { cn } from '../../lib/utils'

/**
 * Lightweight shadcn-style chart primitives, themed to the Greenlight
 * warm-dark palette (gold / emerald / ruby on near-black). Built on Recharts.
 *
 * ChartContainer       — responsive sizing wrapper (single Recharts child).
 * ChartTooltipContent  — glass hover card; pass as Recharts <Tooltip content={...} />.
 */

export function ChartContainer({ className, height = 280, children }) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

// Theme-adaptive shell: --bg-elevated flips with light/dark so the hover card
// matches the active theme instead of being hardcoded dark.
const tooltipShell = {
  background: 'var(--bg-elevated)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid var(--border-gold)',
  borderRadius: 12,
  padding: '10px 13px',
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
  minWidth: 208,
  pointerEvents: 'none',
}

/**
 * Custom Recharts tooltip. Reads the hovered row off payload[0].payload and
 * renders the configured `series` (so ranged-area dataKeys don't pollute it).
 *
 * @param series  [{ key, label, color }] — rows to display, in order
 * @param labelPrefix  prefix for the axis label (e.g. "Year ")
 * @param formatValue  (number) => string
 * @param formatSecondary  (value, row) => { text, positive } | null — optional
 *        secondary metric per row (e.g. % ROI), sign-colored green/red.
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  series = [],
  labelPrefix = '',
  formatValue = (value) => value,
  formatSecondary,
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload ?? {}

  return (
    <div style={tooltipShell}>
      <div
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {labelPrefix}
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {series.map((entry) => {
          const value = Number(row[entry.key])
          if (!Number.isFinite(value)) return null
          const secondary = formatSecondary ? formatSecondary(value, row) : null
          return (
            <div
              key={entry.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: entry.color,
                  flexShrink: 0,
                  boxShadow: `0 0 8px ${entry.color}`,
                }}
              />
              <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{entry.label}</span>
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                {formatValue(value)}
              </span>
              {secondary && (
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10.5,
                    minWidth: 52,
                    textAlign: 'right',
                    color: secondary.positive ? 'var(--green-light)' : 'var(--ruby)',
                  }}
                >
                  {secondary.text}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
