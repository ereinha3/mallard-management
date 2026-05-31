/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import tourSteps from './tourSteps'

const TourContext = createContext(null)
const STORAGE_KEY = 'mallard-tour-seen'
const SPOTLIGHT_PADDING = 8
const VIEWPORT_GAP = 18
const CARD_WIDTH = 340
const NAVIGATION_SETTLE_MS = 80

function getStepTarget(step) {
  if (!step?.selector) return null
  return document.querySelector(step.selector)
}

function getSpotlightRect(element) {
  const rect = element.getBoundingClientRect()
  const left = Math.max(VIEWPORT_GAP, rect.left - SPOTLIGHT_PADDING)
  const top = Math.max(VIEWPORT_GAP, rect.top - SPOTLIGHT_PADDING)
  const right = Math.min(window.innerWidth - VIEWPORT_GAP, rect.right + SPOTLIGHT_PADDING)
  const bottom = Math.min(window.innerHeight - VIEWPORT_GAP, rect.bottom + SPOTLIGHT_PADDING)

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

function getCoachmarkPosition(rect) {
  const estimatedHeight = 260
  const spaceBelow = window.innerHeight - (rect.top + rect.height)
  const spaceRight = window.innerWidth - (rect.left + rect.width)
  const placeBelow = spaceBelow >= estimatedHeight + VIEWPORT_GAP || rect.top < estimatedHeight
  const top = placeBelow
    ? rect.top + rect.height + 14
    : rect.top - estimatedHeight - 14

  let left
  if (spaceRight >= CARD_WIDTH + VIEWPORT_GAP) {
    left = rect.left
  } else {
    left = rect.left + rect.width - CARD_WIDTH
  }

  return {
    left: Math.min(Math.max(VIEWPORT_GAP, left), window.innerWidth - CARD_WIDTH - VIEWPORT_GAP),
    top: Math.min(Math.max(VIEWPORT_GAP, top), window.innerHeight - estimatedHeight - VIEWPORT_GAP),
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

function hasSeenTour() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function TourStyles() {
  return (
    <style>
      {`
        .mallard-tour-spotlight,
        .mallard-tour-ring,
        .mallard-tour-card {
          transition:
            left 220ms ease,
            top 220ms ease,
            width 220ms ease,
            height 220ms ease,
            opacity 180ms ease,
            transform 220ms ease;
        }

        .mallard-tour-spotlight {
          position: fixed;
          z-index: 10000;
          border-radius: 14px;
          box-shadow: 0 0 0 9999px rgba(3, 8, 6, 0.74);
          pointer-events: none;
        }

        .mallard-tour-ring {
          position: fixed;
          z-index: 10001;
          border: 2px solid var(--green, var(--emerald));
          border-radius: 14px;
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--green, var(--emerald)) 35%, transparent),
            0 0 24px color-mix(in srgb, var(--green-bright, var(--emerald)) 52%, transparent),
            inset 0 0 18px color-mix(in srgb, var(--green, var(--emerald)) 18%, transparent);
          pointer-events: none;
          animation: mallard-tour-glow 1.8s ease-in-out infinite;
        }

        .mallard-tour-card {
          position: fixed;
          z-index: 10002;
          width: min(${CARD_WIDTH}px, calc(100vw - ${VIEWPORT_GAP * 2}px));
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow:
            0 26px 80px rgba(0, 0, 0, 0.48),
            0 0 0 1px color-mix(in srgb, var(--green, var(--emerald)) 12%, transparent);
          color: var(--text-primary);
          padding: 18px;
        }

        .mallard-tour-eyebrow {
          color: var(--green, var(--emerald));
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .mallard-tour-title {
          color: var(--text-primary);
          font-size: 24px;
          line-height: 1.1;
          margin-top: 6px;
        }

        .mallard-tour-body {
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.55;
          margin-top: 10px;
        }

        .mallard-tour-keys {
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.45;
          margin-top: 12px;
        }

        .mallard-tour-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 18px;
        }

        .mallard-tour-button {
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-primary);
          background: var(--bg-elevated);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          min-height: 38px;
          padding: 0 14px;
          transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
        }

        .mallard-tour-button:hover {
          background: var(--bg-hover);
          border-color: var(--border-bright);
        }

        .mallard-tour-button:active {
          transform: translateY(1px);
        }

        .mallard-tour-button-primary {
          background: color-mix(in srgb, var(--green, var(--emerald)) 22%, var(--bg-elevated));
          border-color: color-mix(in srgb, var(--green, var(--emerald)) 48%, var(--border));
          color: var(--green-bright, var(--emerald));
        }

        .mallard-tour-skip {
          border: 0;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          margin-left: auto;
          padding: 8px 0;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .mallard-tour-skip:hover {
          color: var(--text-secondary);
        }

        @keyframes mallard-tour-glow {
          0%, 100% {
            box-shadow:
              0 0 0 1px color-mix(in srgb, var(--green, var(--emerald)) 30%, transparent),
              0 0 20px color-mix(in srgb, var(--green-bright, var(--emerald)) 42%, transparent),
              inset 0 0 16px color-mix(in srgb, var(--green, var(--emerald)) 14%, transparent);
          }
          50% {
            box-shadow:
              0 0 0 3px color-mix(in srgb, var(--green, var(--emerald)) 18%, transparent),
              0 0 34px color-mix(in srgb, var(--green-bright, var(--emerald)) 68%, transparent),
              inset 0 0 22px color-mix(in srgb, var(--green, var(--emerald)) 20%, transparent);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mallard-tour-spotlight,
          .mallard-tour-ring,
          .mallard-tour-card {
            animation: none;
            transition: none;
          }
        }
      `}
    </style>
  )
}

export function TourProvider({ children, onNavigate }) {
  const [isActive, setIsActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [spotlightRect, setSpotlightRect] = useState(null)
  const [coachmarkPosition, setCoachmarkPosition] = useState(null)
  const onNavigateRef = useRef(null)
  const skippedStepsRef = useRef(new Set())
  const navigationTimerRef = useRef(null)
  const rafRef = useRef(null)
  const coachmarkRef = useRef(null)
  const focusedStepRef = useRef(null)

  const stopTour = useCallback(() => {
    markTourSeen()
    setIsActive(false)
    setSpotlightRect(null)
    setCoachmarkPosition(null)
    skippedStepsRef.current = new Set()
    focusedStepRef.current = null
  }, [])

  const completeTour = useCallback(() => {
    markTourSeen()
    setIsActive(false)
    setSpotlightRect(null)
    setCoachmarkPosition(null)
    skippedStepsRef.current = new Set()
    focusedStepRef.current = null
  }, [])

  const moveToStep = useCallback((nextIndex) => {
    if (nextIndex < 0) return
    if (nextIndex >= tourSteps.length) {
      completeTour()
      return
    }
    skippedStepsRef.current = new Set()
    setStepIndex(nextIndex)
  }, [completeTour])

  const startTour = useCallback((options = {}) => {
    onNavigateRef.current = options.onNavigate || null
    skippedStepsRef.current = new Set()
    focusedStepRef.current = null
    setStepIndex(0)
    setIsActive(true)
  }, [])

  const goForward = useCallback(() => {
    moveToStep(stepIndex + 1)
  }, [moveToStep, stepIndex])

  const goBack = useCallback(() => {
    moveToStep(stepIndex - 1)
  }, [moveToStep, stepIndex])

  const measureCurrentStep = useCallback(() => {
    if (!isActive) return

    const step = tourSteps[stepIndex]
    const target = getStepTarget(step)

    if (!target) {
      if (!skippedStepsRef.current.has(stepIndex) && import.meta.env.DEV) {
        console.warn('Mallard tour target not found.', {
          stepIndex,
          title: step?.title,
          selector: step?.selector,
        })
      }
      if (skippedStepsRef.current.has(stepIndex)) {
        completeTour()
        return
      }
      skippedStepsRef.current.add(stepIndex)
      moveToStep(stepIndex + 1)
      return
    }

    skippedStepsRef.current.delete(stepIndex)
    target.scrollIntoView({ block: 'center', inline: 'nearest' })
    const nextSpotlightRect = getSpotlightRect(target)
    setSpotlightRect(nextSpotlightRect)
    setCoachmarkPosition(getCoachmarkPosition(nextSpotlightRect))
  }, [completeTour, isActive, moveToStep, stepIndex])

  useEffect(() => {
    if (!isActive) return undefined

    const step = tourSteps[stepIndex]
    window.clearTimeout(navigationTimerRef.current)
    window.cancelAnimationFrame(rafRef.current)

    if (step?.page && onNavigateRef.current) {
      onNavigateRef.current(step.page)
    }

    navigationTimerRef.current = window.setTimeout(() => {
      rafRef.current = window.requestAnimationFrame(measureCurrentStep)
    }, step?.page ? NAVIGATION_SETTLE_MS : 0)

    return () => {
      window.clearTimeout(navigationTimerRef.current)
      window.cancelAnimationFrame(rafRef.current)
    }
  }, [isActive, measureCurrentStep, stepIndex])

  useLayoutEffect(() => {
    if (!isActive) return undefined

    const update = () => {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = window.requestAnimationFrame(measureCurrentStep)
    }

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.cancelAnimationFrame(rafRef.current)
    }
  }, [isActive, measureCurrentStep])

  useEffect(() => {
    if (!isActive) return undefined

    const handleKeyDown = (event) => {
      const target = event.target
      const isInteractiveEnter = event.key === 'Enter'
        && target instanceof Element
        && target.closest('button, a, input, textarea, select')

      if (event.key === 'Escape') {
        event.preventDefault()
        stopTour()
      }
      if (event.key === 'ArrowRight' || (event.key === 'Enter' && !isInteractiveEnter)) {
        event.preventDefault()
        goForward()
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goBack()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goBack, goForward, isActive, stopTour])

  useEffect(() => {
    if (!hasSeenTour()) {
      const timer = window.setTimeout(() => startTour({ onNavigate }), 350)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [startTour, onNavigate])

  useEffect(() => {
    if (!isActive || !spotlightRect || !coachmarkPosition || focusedStepRef.current === stepIndex) return

    focusedStepRef.current = stepIndex
    coachmarkRef.current?.focus({ preventScroll: true })
  }, [coachmarkPosition, isActive, spotlightRect, stepIndex])

  const value = useMemo(() => ({
    startTour,
    stopTour,
    isActive,
  }), [isActive, startTour, stopTour])

  const currentStep = tourSteps[stepIndex]
  const isLastStep = stepIndex === tourSteps.length - 1
  const titleId = `mallard-tour-title-${stepIndex}`
  const bodyId = `mallard-tour-body-${stepIndex}`
  const keysId = `mallard-tour-keys-${stepIndex}`

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourStyles />
      {isActive && spotlightRect && coachmarkPosition && currentStep && (
        <>
          <div
            aria-hidden="true"
            className="mallard-tour-spotlight"
            style={{
              left: spotlightRect.left,
              top: spotlightRect.top,
              width: spotlightRect.width,
              height: spotlightRect.height,
            }}
          />
          <div
            aria-hidden="true"
            className="mallard-tour-ring"
            style={{
              left: spotlightRect.left,
              top: spotlightRect.top,
              width: spotlightRect.width,
              height: spotlightRect.height,
            }}
          />
          <section
            aria-live="polite"
            aria-labelledby={titleId}
            aria-describedby={`${bodyId} ${keysId}`}
            className="mallard-tour-card"
            ref={coachmarkRef}
            role="dialog"
            tabIndex={-1}
            style={{
              left: coachmarkPosition.left,
              top: coachmarkPosition.top,
            }}
          >
            <div className="mallard-tour-eyebrow">
              {stepIndex + 1} / {tourSteps.length}
            </div>
            <h2 className="mallard-tour-title font-display" id={titleId}>{currentStep.title}</h2>
            <p className="mallard-tour-body" id={bodyId}>{currentStep.body}</p>
            <p className="mallard-tour-keys" id={keysId}>
              Keyboard: Enter or Right for next, Left for back, Esc to skip.
            </p>
            <div className="mallard-tour-actions">
              <button
                className="mallard-tour-button"
                disabled={stepIndex === 0}
                onClick={goBack}
                type="button"
              >
                Back
              </button>
              <button
                className="mallard-tour-button mallard-tour-button-primary"
                onClick={goForward}
                type="button"
              >
                {isLastStep ? 'Finish' : 'Next'}
              </button>
              <button className="mallard-tour-skip" onClick={stopTour} type="button">
                Skip tour
              </button>
            </div>
          </section>
        </>
      )}
    </TourContext.Provider>
  )
}

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within a TourProvider')
  }
  return context
}
