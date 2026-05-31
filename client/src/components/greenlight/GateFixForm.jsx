import { useEffect, useMemo, useState } from 'react'
import { getUserRecord, postOnboard } from '../../api/greenlightClient'
import { formatCurrency, formatPercent } from '../../lib/utils'

const HIGH_APR_FALLBACK = 0.08

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseNonNegativeNumber(value) {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 ? parsed : null
}

function formatEditableNumber(value) {
  const parsed = numberOrNull(value)
  return parsed == null ? '' : String(parsed)
}

function formatMoney(value) {
  const parsed = numberOrNull(value)
  if (parsed == null) return 'Not available'
  return formatCurrency(parsed)
}

function normalizeApr(value) {
  const parsed = numberOrNull(value)
  if (parsed == null) return null
  return parsed > 1 ? parsed / 100 : parsed
}

function formatApr(value) {
  const normalized = normalizeApr(value)
  if (normalized == null) return 'APR not available'
  return `${formatPercent(normalized * 100)} APR`
}

function getProfile(gateResult) {
  return gateResult?.validated_profile ?? {}
}

function normalizeChecks(gateResult) {
  const rawChecks = gateResult?.gate_result?.checks ?? {}

  if (Array.isArray(rawChecks)) {
    return Object.fromEntries(rawChecks.map((check, index) => [
      check?.key ?? `check_${index + 1}`,
      {
        ...check,
        passed: check?.passed ?? (check?.status === 'pass' ? true : check?.status === 'fail' ? false : undefined),
      },
    ]))
  }

  return Object.fromEntries(Object.entries(rawChecks).map(([key, check]) => [
    key,
    {
      ...check,
      passed: check?.passed ?? (check?.status === 'pass' ? true : check?.status === 'fail' ? false : undefined),
    },
  ]))
}

function checkFailed(check) {
  return check?.passed === false || check?.status === 'fail'
}

function getCheck(checks, keys) {
  return keys.map(key => checks?.[key]).find(Boolean)
}

function flattenText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(flattenText).join(' ')
  if (typeof value === 'object') return Object.values(value).map(flattenText).join(' ')
  return ''
}

function getGateText(gateResult) {
  return [
    gateResult?.gate_result?.reason,
    gateResult?.gate_result?.reasons,
    gateResult?.gate_result?.halt_reasons,
    gateResult?.gate_result?.recommended_action,
    gateResult?.gate_result?.preview_next_checks,
    gateResult?.financial_analysis?.path_to_greenlight?.steps,
  ].map(flattenText).join(' ').toLowerCase()
}

function normalizeThreshold(value) {
  const parsed = numberOrNull(value)
  if (parsed == null) return null
  return parsed > 1 ? parsed / 100 : parsed
}

function getHighAprThreshold(gateResult, checks) {
  const candidates = []

  for (const candidate of candidates) {
    const normalized = normalizeThreshold(candidate)
    if (normalized != null) return normalized
  }

  const highAprCheck = getCheck(checks, ['high_interest_debt'])
  const detail = String(highAprCheck?.detail ?? '')
  const match = detail.match(/threshold is\s+([\d.]+)%/i)
  const parsedDetailThreshold = match ? normalizeThreshold(match[1]) : null
  return parsedDetailThreshold ?? HIGH_APR_FALLBACK
}

function isHighAprDebt(debt, threshold) {
  const apr = normalizeApr(debt?.apr)
  return apr != null && apr > threshold
}

function getBlockers(gateResult) {
  const profile = getProfile(gateResult)
  const snapshot = gateResult?.financial_analysis?.snapshot ?? {}
  const checks = normalizeChecks(gateResult)
  const gateText = getGateText(gateResult)

  const monthlyExpenses = numberOrNull(profile?.monthly_expenses ?? snapshot.monthly_expenses)
  const emergencyFundCheck = getCheck(checks, ['emergency_fund'])
  const highAprCheck = getCheck(checks, ['high_interest_debt'])
  const efMath = gateResult?.gate_result?.math?.emergency_fund
    ?? {}
  const efTarget = numberOrNull(
    efMath.target_balance
    ?? gateResult?.financial_analysis?.emergency_fund?.target_balance
    ?? (monthlyExpenses != null ? monthlyExpenses * 3 : null)
  )
  const efCurrent = numberOrNull(profile?.emergency_fund)
  const efShortfall = numberOrNull(
    efMath.shortfall
    ?? gateResult?.financial_analysis?.emergency_fund?.shortfall
    ?? gateResult?.financial_analysis?.snapshot?.emergency_fund_shortfall
    ?? (efTarget != null && efCurrent != null ? Math.max(0, efTarget - efCurrent) : null)
  )
  const emergencyTextFailed = /emergency fund (is )?(below|short|shortfall)|build[^.]*emergency fund|build[^.]*liquid reserves/.test(gateText)
  const emergencyFundFailed = checkFailed(emergencyFundCheck)
    || (efTarget != null && efCurrent != null && efCurrent < efTarget)
    || emergencyTextFailed

  const highAprThreshold = getHighAprThreshold(gateResult, checks)
  const debts = Array.isArray(profile?.debts) ? profile.debts : []
  const highAprDebts = debts.filter(debt => isHighAprDebt(debt, highAprThreshold))
  const debtTextFailed = /high-interest debt|credit card debt|credit card[^.]*block|pay off[^.]*debt|pay down[^.]*debt|high[-\s]?apr[^.]*debt[^.]*block/.test(gateText)
  const debtsFailed = checkFailed(highAprCheck) || highAprDebts.length > 0 || debtTextFailed

  return {
    emergencyFund: emergencyFundFailed ? { target: efTarget, current: efCurrent, shortfall: efShortfall } : null,
    debts: debtsFailed ? { threshold: highAprThreshold } : null,
  }
}

function getDebtLabel(debt, index) {
  return debt?.kind ?? `Debt ${index + 1}`
}

function getDebtBalance(debt) {
  return numberOrNull(debt?.balance)
}

function hydrateDebtRows(debts) {
  return Array.isArray(debts)
    ? debts.map(debt => ({ debt, balanceInput: formatEditableNumber(getDebtBalance(debt)) }))
    : []
}

function patchDebtBalance(debt, balance) {
  return { ...debt, balance }
}

const inputStyle = hasError => ({
  width: '100%',
  height: 48,
  boxSizing: 'border-box',
  background: 'var(--bg-base)',
  border: `1px solid ${hasError ? 'var(--ruby)' : 'var(--border-bright)'}`,
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontSize: 16,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  padding: '0 15px 0 34px',
  transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
})

function focusControl(event) {
  event.target.style.borderColor = 'var(--gold)'
  event.target.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.22)'
  event.target.style.background = 'var(--bg-surface)'
}

function blurControl(hasError) {
  return event => {
    event.target.style.borderColor = hasError ? 'var(--ruby)' : 'var(--border-bright)'
    event.target.style.boxShadow = 'none'
    event.target.style.background = 'var(--bg-base)'
  }
}

function LoadingState() {
  return (
    <div
      className="h-full overflow-y-auto px-5 py-10"
      style={{ background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        Loading your saved profile...
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div
      className="h-full overflow-y-auto px-5 py-10"
      style={{ background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        style={{
          width: 'min(100%, 520px)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-bright)',
          borderRadius: 18,
          padding: 28,
          textAlign: 'center',
        }}
      >
        <div className="font-display" style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
          We couldn't load your profile
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            height: 44,
            padding: '0 20px',
            border: 'none',
            borderRadius: 12,
            background: 'var(--gold)',
            color: '#070910',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 800,
            fontFamily: 'DM Sans, sans-serif',
            boxShadow: '0 12px 24px rgba(201,168,76,0.24)',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )
}

export default function GateFixForm({ gateResult, userEmail, onComplete }) {
  const blockers = useMemo(() => getBlockers(gateResult), [gateResult])
  const [profileInput, setProfileInput] = useState(null)
  const [emergencyFundInput, setEmergencyFundInput] = useState('')
  const [debtRows, setDebtRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      setLoading(true)
      setLoadError('')
      setSubmitError('')
      setSubmitSuccess('')

      if (!userEmail) {
        setLoading(false)
        setLoadError('We could not find the email for this saved onboarding record. Please return to intake and try again.')
        return
      }

      try {
        const record = await getUserRecord(userEmail)
        if (cancelled) return

        const nextProfileInput = record?.profile_input
        if (!nextProfileInput || typeof nextProfileInput !== 'object') {
          throw new Error('Missing profile input')
        }

        setProfileInput(nextProfileInput)
        setEmergencyFundInput(formatEditableNumber(nextProfileInput.emergency_fund))
        setDebtRows(hydrateDebtRows(nextProfileInput.debts))
      } catch {
        if (!cancelled) {
          setLoadError('Your saved answers are still safe, but we could not fetch them for editing. Try again in a moment.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProfile()
    return () => { cancelled = true }
  }, [retryKey, userEmail])

  function updateDebtBalance(index, value) {
    setDebtRows(prev => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, balanceInput: value } : row
    )))
    setErrors(prev => ({ ...prev, [`debt_${index}`]: null }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!profileInput || submitting) return

    const nextErrors = {}
    let nextEmergencyFund = profileInput.emergency_fund

    if (blockers.emergencyFund) {
      const parsedEmergencyFund = parseNonNegativeNumber(emergencyFundInput)
      if (parsedEmergencyFund === null) {
        nextErrors.emergency_fund = 'Enter a balance of zero or more.'
      } else {
        nextEmergencyFund = parsedEmergencyFund
      }
    }

    const patchedDebts = blockers.debts
      ? debtRows.map((row, index) => {
        const parsedBalance = parseNonNegativeNumber(row.balanceInput)
        if (parsedBalance === null) {
          nextErrors[`debt_${index}`] = 'Enter a balance of zero or more.'
          return row.debt
        }
        return patchDebtBalance(row.debt, parsedBalance)
      })
      : (Array.isArray(profileInput.debts) ? profileInput.debts : [])

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')

    try {
      const patched = {
        ...profileInput,
        emergency_fund: nextEmergencyFund,
        debts: patchedDebts,
      }
      const result = await postOnboard(patched, userEmail)
      setSubmitSuccess('Eligibility re-checked. Updating your flow...')
      onComplete?.(result)
    } catch {
      setSubmitError('We could not re-check eligibility with those updates. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState message={loadError} onRetry={() => setRetryKey(prev => prev + 1)} />

  const emergencyCurrent = numberOrNull(profileInput?.emergency_fund)
  const hasAnyBlocker = Boolean(blockers.emergencyFund || blockers.debts)

  return (
    <div
      className="h-full overflow-y-auto px-5 py-10"
      style={{
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        style={{
          width: 'min(100%, 720px)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-bright)',
          borderRadius: 18,
          boxShadow: '0 22px 60px rgba(0,0,0,0.24)',
          padding: '34px',
        }}
      >
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <h1
            className="font-display"
            style={{
              color: 'var(--text-primary)',
              fontSize: 34,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: 0,
              margin: 0,
            }}
          >
            You're almost there — here's what's left
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '10px 0 0' }}>
            Update only the field blocking your greenlight.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          {blockers.emergencyFund && (
            <section
              style={{
                border: '1px solid rgba(196,154,44,0.28)',
                borderRadius: 14,
                background: 'rgba(196,154,44,0.06)',
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Emergency fund
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                    Bring your reserve up to the gate target
                  </div>
                </div>
                {blockers.emergencyFund.shortfall != null && (
                  <div style={{ color: 'var(--ruby)', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    Shortfall {formatMoney(blockers.emergencyFund.shortfall)}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>Engine target</div>
                  <div className="font-mono" style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                    {formatMoney(blockers.emergencyFund.target)}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>Current saved balance</div>
                  <div className="font-mono" style={{ color: emergencyCurrent != null && blockers.emergencyFund.target != null && emergencyCurrent < blockers.emergencyFund.target ? 'var(--ruby)' : 'var(--text-primary)', fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                    {formatMoney(emergencyCurrent)}
                  </div>
                </div>
              </div>

              <label style={{ display: 'grid', gap: 7 }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 800 }}>
                  Update your emergency fund balance
                </span>
                <div style={{ position: 'relative' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: 15,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                      fontSize: 15,
                      fontWeight: 800,
                    }}
                  >
                    $
                  </span>
                  <input
                    value={emergencyFundInput}
                    onChange={event => {
                      setEmergencyFundInput(event.target.value)
                      setErrors(prev => ({ ...prev, emergency_fund: null }))
                    }}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    required
                    aria-invalid={Boolean(errors.emergency_fund)}
                    aria-describedby={errors.emergency_fund ? 'emergency-fund-error' : undefined}
                    style={inputStyle(Boolean(errors.emergency_fund))}
                    onFocus={focusControl}
                    onBlur={blurControl(Boolean(errors.emergency_fund))}
                  />
                </div>
                {errors.emergency_fund && (
                  <span id="emergency-fund-error" style={{ color: 'var(--ruby)', fontSize: 12 }}>
                    {errors.emergency_fund}
                  </span>
                )}
              </label>
            </section>
          )}

          {blockers.debts && (
            <section
              style={{
                border: '1px solid rgba(230,69,69,0.26)',
                borderRadius: 14,
                background: 'rgba(230,69,69,0.05)',
                padding: 18,
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: 'var(--ruby)', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Debts
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                  Pay down any high-APR balances
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 5 }}>
                  Debts above {formatPercent(blockers.debts.threshold * 100)} APR are flagged by this gate.
                </div>
              </div>

              {debtRows.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                  No saved debts were returned on your profile.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {debtRows.map((row, index) => {
                    const apr = row.debt?.apr
                    const highApr = isHighAprDebt(row.debt, blockers.debts.threshold)
                    const debtError = errors[`debt_${index}`]

                    return (
                      <div
                        key={`${getDebtLabel(row.debt, index)}-${index}`}
                        style={{
                          background: 'var(--bg-base)',
                          border: `1px solid ${highApr ? 'rgba(230,69,69,0.45)' : 'var(--border)'}`,
                          borderRadius: 12,
                          padding: 14,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                          <div>
                            <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800 }}>
                              {getDebtLabel(row.debt, index)}
                            </div>
                            <div style={{ color: highApr ? 'var(--ruby)' : 'var(--text-muted)', fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                              {formatApr(apr)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="font-mono" style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 800 }}>
                              {formatMoney(getDebtBalance(row.debt))}
                            </div>
                            {highApr && (
                              <span
                                style={{
                                  border: '1px solid rgba(230,69,69,0.35)',
                                  borderRadius: 999,
                                  color: 'var(--ruby)',
                                  background: 'rgba(230,69,69,0.08)',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                }}
                              >
                                High APR
                              </span>
                            )}
                          </div>
                        </div>

                        <label style={{ display: 'grid', gap: 7 }}>
                          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 800 }}>
                            Balance
                          </span>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                            <div style={{ position: 'relative' }}>
                              <span
                                aria-hidden="true"
                                style={{
                                  position: 'absolute',
                                  left: 15,
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  color: 'var(--text-muted)',
                                  fontSize: 15,
                                  fontWeight: 800,
                                }}
                              >
                                $
                              </span>
                              <input
                                value={row.balanceInput}
                                onChange={event => updateDebtBalance(index, event.target.value)}
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                required
                                aria-invalid={Boolean(debtError)}
                                aria-describedby={debtError ? `debt-${index}-error` : undefined}
                                style={inputStyle(Boolean(debtError))}
                                onFocus={focusControl}
                                onBlur={blurControl(Boolean(debtError))}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => updateDebtBalance(index, '0')}
                              style={{
                                height: 48,
                                padding: '0 14px',
                                border: '1px solid var(--border-bright)',
                                borderRadius: 12,
                                background: 'var(--bg-elevated)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 800,
                                fontFamily: 'DM Sans, sans-serif',
                              }}
                            >
                              Mark paid off
                            </button>
                          </div>
                          {debtError && (
                            <span id={`debt-${index}-error`} style={{ color: 'var(--ruby)', fontSize: 12 }}>
                              {debtError}
                            </span>
                          )}
                        </label>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {!hasAnyBlocker && (
            <div
              style={{
                border: '1px solid var(--border-bright)',
                borderRadius: 14,
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 14,
                lineHeight: 1.6,
                padding: 18,
              }}
            >
              The gate did not return an emergency-fund or high-APR-debt field to edit. You can still re-check the saved profile.
            </div>
          )}
        </div>

        {submitError && (
          <div style={{ color: 'var(--ruby)', fontSize: 13, marginTop: 18, lineHeight: 1.5 }}>
            {submitError}
          </div>
        )}
        {submitSuccess && (
          <div style={{ color: 'var(--emerald)', fontSize: 13, marginTop: 18, lineHeight: 1.5 }}>
            {submitSuccess}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            height: 50,
            marginTop: 28,
            border: 'none',
            borderRadius: 12,
            background: 'var(--gold)',
            color: '#070910',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.72 : 1,
            fontSize: 15,
            fontWeight: 800,
            fontFamily: 'DM Sans, sans-serif',
            boxShadow: '0 12px 24px rgba(201,168,76,0.24)',
            transition: 'filter 0.15s, transform 0.15s',
          }}
          onMouseEnter={event => {
            if (!submitting) event.currentTarget.style.filter = 'brightness(0.96)'
          }}
          onMouseLeave={event => {
            event.currentTarget.style.filter = 'none'
          }}
          onFocus={event => {
            event.currentTarget.style.outline = '3px solid rgba(201,168,76,0.3)'
            event.currentTarget.style.outlineOffset = '3px'
          }}
          onBlur={event => {
            event.currentTarget.style.outline = 'none'
          }}
        >
          {submitting ? 'Re-checking...' : 'Re-check eligibility'}
        </button>
      </form>
    </div>
  )
}
