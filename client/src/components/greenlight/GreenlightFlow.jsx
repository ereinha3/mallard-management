import { useState } from 'react'
import IntakeForm from './IntakeForm'
import IntakeChat from './IntakeChat'
import GateScreen from './GateScreen'
import PortfolioView from './PortfolioView'
import RebalancePanel from './RebalancePanel'

// Steps: intake-form → intake → gate-halt → (fix) → intake-fixed → gate-green → portfolio → rebalance
const STEPS = {
  INTAKE_FORM: 'intake-form',
  INTAKE:     'intake',
  GATE_HALT:  'gate-halt',
  INTAKE_FIX: 'intake-fix',
  GATE_GREEN: 'gate-green',
  PORTFOLIO:  'portfolio',
  REBALANCE:  'rebalance',
}

function getUserEmail(result) {
  return result?.validated_profile?.email
    ?? result?.profile?.email
    ?? result?.user?.email
    ?? result?.email
    ?? null
}

function gateStepFromStatus(status) {
  return status === 'greenlight' ? STEPS.GATE_GREEN : STEPS.GATE_HALT
}

function StepIndicator({ step }) {
  const labels = ['Intake', 'Gate', 'Portfolio', 'Rebalance']
  const activeIdx =
    step === STEPS.INTAKE_FORM || step === STEPS.INTAKE || step === STEPS.INTAKE_FIX ? 0
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

export default function GreenlightFlow({ onboardResult }) {
  const initialStatus = onboardResult?.gate_result?.status
  const [step, setStep] = useState(
    initialStatus ? gateStepFromStatus(initialStatus)
    : STEPS.INTAKE_FORM
  )
  const [gateResult, setGateResult] = useState(onboardResult ?? null)
  const [prefillData, setPrefillData] = useState(null)
  const userEmail = getUserEmail(gateResult)

  function handleIntakeFormSubmit(data) {
    setPrefillData(data)
    setStep(STEPS.INTAKE)
  }

  function handleIntakeComplete(result) {
    setGateResult(result)
    setStep(gateStepFromStatus(result?.gate_result?.status))
  }

  function handlePortfolioApplied(result) {
    setGateResult(result)
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
          <StepIndicator step={step} />
          {(step === STEPS.PORTFOLIO || step === STEPS.REBALANCE) && (
            <button
              onClick={() => setStep(STEPS.INTAKE_FORM)}
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
          {(step === STEPS.INTAKE_FORM || step === STEPS.INTAKE || step === STEPS.INTAKE_FIX) && <div style={{ width: 80 }} />}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {step === STEPS.INTAKE_FORM && (
          <IntakeForm onSubmit={handleIntakeFormSubmit} />
        )}
        {step === STEPS.INTAKE && (
          <IntakeChat onComplete={handleIntakeComplete} userEmail={userEmail} prefillData={prefillData} />
        )}
        {step === STEPS.GATE_HALT && (
          <GateScreen
            status={gateResult?.gate_result?.status}
            gateResult={gateResult}
            onFix={() => setStep(STEPS.INTAKE_FIX)}
          />
        )}
        {step === STEPS.INTAKE_FIX && (
          <IntakeChat onComplete={handleIntakeComplete} userEmail={userEmail} />
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
            onRebalance={() => setStep(STEPS.REBALANCE)}
            onApplied={handlePortfolioApplied}
          />
        )}
        {step === STEPS.REBALANCE && (
          <RebalancePanel onboardResult={gateResult} />
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
