import { useEffect, useState } from 'react'
import { numberOrNull } from '../lib/utils'

function getScoreColor(score) {
  if (score >= 80) return '#1eb87a'
  if (score >= 60) return '#c49a2c'
  return '#e64545'
}

function getScoreLabel(score) {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'On Track'
  if (score >= 55) return 'Needs Work'
  return 'At Risk'
}

export default function RetirementScore({ score, size = 140 }) {
  const [displayed, setDisplayed] = useState(0)
  const parsedScore = numberOrNull(score)
  const hasScore = parsedScore != null
  const safeScore = hasScore ? Math.min(100, Math.max(0, parsedScore)) : 0

  // Geometry derived from `size` so the ring fits whatever column it lands in.
  const stroke = Math.max(7, Math.round(size * 0.072))
  const radius = (size - stroke) / 2 - 1
  const circumference = 2 * Math.PI * radius
  const center = size / 2
  const numberFont = Math.round(size * 0.3)

  useEffect(() => {
    if (!hasScore) {
      return undefined
    }
    let start = 0
    const step = safeScore / 40
    const timer = setInterval(() => {
      start += step
      if (start >= safeScore) { setDisplayed(Math.round(safeScore)); clearInterval(timer); return }
      setDisplayed(Math.round(start))
    }, 18)
    return () => clearInterval(timer)
  }, [hasScore, safeScore])

  const visibleScore = hasScore ? displayed : 0
  const offset = circumference - (visibleScore / 100) * circumference
  const color = hasScore ? getScoreColor(safeScore) : 'var(--text-muted)'

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth={stroke}
          />
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.05s linear, stroke 0.4s ease' }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ textAlign: 'center' }}
        >
          <span
            className="font-display font-semibold"
            style={{ fontSize: numberFont, lineHeight: 1, color, letterSpacing: '-0.03em' }}
          >
            {hasScore ? Math.round(displayed) : '—'}
          </span>
          <span className="font-mono" style={{ fontSize: Math.max(10, Math.round(size * 0.085)), color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            /100
          </span>
        </div>
      </div>
      <div>
        <span
          className="text-sm font-semibold px-3 py-1 rounded-full"
          style={{
            background: `${color}18`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {hasScore ? getScoreLabel(safeScore) : 'Unavailable'}
        </span>
      </div>
    </div>
  )
}
