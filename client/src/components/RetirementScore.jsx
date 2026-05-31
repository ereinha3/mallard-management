import { useEffect, useState } from 'react'

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

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

export default function RetirementScore({ score = 78 }) {
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    let start = 0
    const step = score / 40
    const timer = setInterval(() => {
      start += step
      if (start >= score) { setDisplayed(score); clearInterval(timer); return }
      setDisplayed(Math.round(start))
    }, 18)
    return () => clearInterval(timer)
  }, [score])

  const offset = CIRCUMFERENCE - (displayed / 100) * CIRCUMFERENCE
  const color = getScoreColor(score)

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div style={{ position: 'relative', width: 140, height: 140 }}>
        <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="70" cy="70" r={RADIUS}
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth="10"
          />
          <circle
            cx="70" cy="70" r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
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
            style={{ fontSize: 42, lineHeight: 1, color, letterSpacing: '-0.03em' }}
          >
            {displayed}
          </span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
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
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
  )
}
