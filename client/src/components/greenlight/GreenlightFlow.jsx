/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import IntakeChat from './IntakeChat'
import GateFixForm from './GateFixForm'
import GateScreen from './GateScreen'
import PortfolioView from './PortfolioView'
import RebalancePanel from './RebalancePanel'

// Steps: intake → gate-halt → (fix) → intake-fixed → gate-green → portfolio → rebalance
const STEPS = {
  INTAKE:     'intake',
  GATE_HALT:  'gate-halt',
  INTAKE_FIX: 'intake-fix',
  GATE_GREEN: 'gate-green',
  PORTFOLIO:  'portfolio',
  REBALANCE:  'rebalance',
}

function getUserEmail(result) {
  return result?.user?.email
    ?? result?.email
    ?? null
}

function hasPortfolio(result) {
  return Boolean(result?.portfolio)
}

function stepFromResult(result) {
  const status = result?.gate_result?.status ?? result?.status
  if (hasPortfolio(result) || status === 'greenlight') return STEPS.PORTFOLIO
  if (status) return STEPS.GATE_HALT
  return STEPS.INTAKE
}

function StepIndicator({ step }) {
  const labels = ['Intake', 'Gate', 'Portfolio', 'Rebalance']
  const activeIdx =
    step === STEPS.INTAKE || step === STEPS.INTAKE_FIX ? 0
    : step === STEPS.GATE_HALT || step === STEPS.GATE_GREEN ? 1
    : step === STEPS.PORTFOLIO ? 2
    : 3

  return (
    <div className="flex items-center gap-0">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center rounded-full text-xs font-mono font-medium transition-all"
              style={{
                width: 22, height: 22,
                background: i < activeIdx
                  ? 'var(--emerald)'
                  : i === activeIdx
                  ? 'var(--gold-light)'
                  : 'var(--bg-elevated)',
                color: i <= activeIdx ? '#070910' : 'var(--text-muted)',
                border: i > activeIdx ? '1px solid var(--border-bright)' : 'none',
              }}
            >
              {i < activeIdx ? '✓' : i + 1}
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: i === activeIdx ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              {label}
            </span>
          </div>
          {i < labels.length - 1 && (
            <div
              className="mx-3 h-px"
              style={{
                width: 32,
                background: i < activeIdx ? 'var(--emerald)' : 'var(--border-bright)',
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default function GreenlightFlow({ onboardResult, userEmail, onResult }) {
  const [step, setStep] = useState(() => stepFromResult(onboardResult))
  const [gateResult, setGateResult] = useState(onboardResult ?? null)
  const resolvedUserEmail = userEmail ?? getUserEmail(gateResult)

  useEffect(() => {
    setGateResult(onboardResult ?? null)
    setStep(stepFromResult(onboardResult))
  }, [onboardResult])

  function handleIntakeComplete(result) {
    setGateResult(result)
    onResult?.(result)
    setStep(stepFromResult(result))
  }

  function handlePortfolioApplied(result) {
    setGateResult(result)
    onResult?.(result)
  }

  const isFullscreen = step === STEPS.GATE_HALT || step === STEPS.GATE_GREEN

  return (
    <div
      className="flex flex-col"
      style={{ height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}
    >
      {/* Header bar */}
      {!isFullscreen && (
        <div
          className="flex items-center justify-between px-8 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 28, height: 28,
                background: 'linear-gradient(135deg, #1eb87a, #16a864)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L9.5 5.5H13L10 8.5L11 13L7 10.5L3 13L4 8.5L1 5.5H4.5L7 1Z" fill="#070910" />
              </svg>
            </div>
            <div>
              <span
                className="font-display font-semibold text-base"
                style={{ color: 'var(--text-primary)', letterSpacing: 0 }}
              >
                Greenlight
              </span>
              <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                Responsible Investing Agent
              </span>
            </div>
          </div>
          <div data-tour="greenlight-gate">
            <StepIndicator step={step} />
          </div>
          {(step === STEPS.PORTFOLIO || step === STEPS.REBALANCE) && (
            <button
              onClick={() => setStep(STEPS.INTAKE)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-bright)',
              }}
            >
              ↺ Re-run
            </button>
          )}
          {(step === STEPS.INTAKE || step === STEPS.INTAKE_FIX) && <div style={{ width: 80 }} />}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {step === STEPS.INTAKE && (
          <IntakeChat onComplete={handleIntakeComplete} userEmail={resolvedUserEmail} />
        )}
        {step === STEPS.GATE_HALT && (
          <GateScreen
            status={gateResult?.gate_result?.status}
            gateResult={gateResult}
            onFix={() => setStep(STEPS.INTAKE_FIX)}
          />
        )}
        {step === STEPS.INTAKE_FIX && (
          <GateFixForm gateResult={gateResult} userEmail={resolvedUserEmail} onComplete={handleIntakeComplete} />
        )}
        {step === STEPS.GATE_GREEN && (
          <GateScreen
            status={gateResult?.gate_result?.status}
            gateResult={gateResult}
            onContinue={() => setStep(STEPS.PORTFOLIO)}
          />
        )}
        {step === STEPS.PORTFOLIO && (
          <PortfolioView
            onboardResult={gateResult}
            userEmail={resolvedUserEmail}
            onRebalance={() => setStep(STEPS.REBALANCE)}
            onApplied={handlePortfolioApplied}
          />
        )}
        {step === STEPS.REBALANCE && (
          <RebalancePanel onboardResult={gateResult} userEmail={resolvedUserEmail} />
        )}
      </div>

      {/* Persistent disclaimer */}
      <div
        className="px-8 py-2 shrink-0 text-center text-xs"
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}
      >
        Demonstration only. <strong>Not</strong> financial, investment, tax, or legal advice. Not a registered investment adviser. Outputs are illustrative. Verify with a licensed professional.
      </div>
    </div>
  )
}
