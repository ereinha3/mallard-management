/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'

export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = () => setPrefersReducedMotion(media.matches)

    handleChange()
    media.addEventListener?.('change', handleChange)
    return () => media.removeEventListener?.('change', handleChange)
  }, [])

  return prefersReducedMotion
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

export function CountUpNumber({
  value,
  format = v => String(Math.round(v)),
  duration = 900,
  delay = 0,
  reducedMotion = false,
}) {
  const numericValue = Number(value)
  const [displayValue, setDisplayValue] = useState(() => (
    reducedMotion && Number.isFinite(numericValue) ? numericValue : 0
  ))

  useEffect(() => {
    if (!Number.isFinite(numericValue)) return undefined
    if (reducedMotion) return undefined

    let frame
    let timeout
    const startValue = 0
    const start = () => {
      setDisplayValue(startValue)
      const startedAt = performance.now()
      const tick = (now) => {
        const elapsed = now - startedAt
        const progress = Math.min(1, elapsed / duration)
        setDisplayValue(startValue + ((numericValue - startValue) * easeOutCubic(progress)))
        if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    timeout = window.setTimeout(start, delay)

    return () => {
      window.clearTimeout(timeout)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [delay, duration, numericValue, reducedMotion])

  const renderedValue = reducedMotion && Number.isFinite(numericValue) ? numericValue : displayValue

  if (!Number.isFinite(numericValue)) return '—'

  return format(renderedValue)
}

export function RevealItem({
  as: Component = 'div',
  children,
  className = '',
  index = 0,
  reducedMotion = false,
  style,
  ...props
}) {
  const revealStyle = useMemo(() => ({
    '--reveal-delay': reducedMotion ? '0ms' : `${120 + (index * 58)}ms`,
    ...style,
  }), [index, reducedMotion, style])

  return (
    <Component
      className={`portfolio-reveal-item ${reducedMotion ? 'portfolio-reveal-reduced' : ''} ${className}`.trim()}
      style={revealStyle}
      {...props}
    >
      {children}
    </Component>
  )
}

export function PortfolioRevealStyles() {
  return (
    <style>
      {`
        .portfolio-reveal-card {
          position: relative;
          overflow: hidden;
          animation: portfolioRevealLift 640ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .portfolio-reveal-card::after {
          content: '';
          position: absolute;
          inset: -1px;
          pointer-events: none;
          background: linear-gradient(115deg, transparent 0%, rgba(83, 226, 154, 0.20) 42%, rgba(240, 192, 96, 0.16) 50%, transparent 58%);
          opacity: 0;
          transform: translateX(-28%);
          animation: portfolioRevealGlint 980ms 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .portfolio-reveal-donut {
          animation: portfolioDonutArrive 820ms 170ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          transform-origin: center;
        }

        .portfolio-reveal-center {
          animation: portfolioCenterPop 620ms 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .portfolio-reveal-item {
          animation: portfolioRowReveal 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          animation-delay: var(--reveal-delay);
        }

        .portfolio-risk-fill {
          transform-origin: left center;
          animation: portfolioRiskGrow 780ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          animation-delay: var(--reveal-delay);
        }

        .portfolio-reveal-reduced,
        .portfolio-reveal-reduced .portfolio-risk-fill {
          animation-duration: 1ms !important;
          animation-delay: 0ms !important;
        }

        @keyframes portfolioRevealLift {
          from { opacity: 0; transform: translateY(14px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes portfolioRevealGlint {
          0% { opacity: 0; transform: translateX(-32%); }
          35% { opacity: 1; }
          100% { opacity: 0; transform: translateX(42%); }
        }

        @keyframes portfolioDonutArrive {
          from { opacity: 0; transform: scale(0.82) rotate(-18deg); filter: saturate(0.8); }
          to { opacity: 1; transform: scale(1) rotate(0deg); filter: saturate(1); }
        }

        @keyframes portfolioCenterPop {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.74); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @keyframes portfolioRowReveal {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes portfolioRiskGrow {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .portfolio-reveal-card,
          .portfolio-reveal-card::after,
          .portfolio-reveal-donut,
          .portfolio-reveal-center,
          .portfolio-reveal-item,
          .portfolio-risk-fill {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
          }
        }
      `}
    </style>
  )
}
