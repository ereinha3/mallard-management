import { useState } from 'react'

const GOLD = '#C9A84C'

const FIELDS = [
  { name: 'income', label: 'Annual household income', type: 'currency', placeholder: '120,000' },
  { name: 'expenses', label: 'Total monthly expenses', type: 'currency', placeholder: '6,500' },
  { name: 'liquidCapital', label: 'Liquid capital / savings', type: 'currency', placeholder: '45,000' },
  { name: 'emergencyFund', label: 'Emergency fund balance', type: 'currency', placeholder: '20,000' },
  { name: 'age', label: 'Age', type: 'number', placeholder: '38' },
]

const EMPLOYMENT_FIELDS = [
  { name: 'employerCompany', label: 'Employer / Company name', type: 'text', placeholder: 'Acme Capital' },
  { name: 'jobTitle', label: 'Your role / job title', type: 'text', placeholder: 'Product Director' },
  {
    name: 'companyTenure',
    label: 'How long have you been at this company?',
    type: 'select',
    options: ['Less than 1 year', '1-2 years', '3-5 years', '6-10 years', '10+ years'],
  },
  {
    name: 'companySize',
    label: 'Company size',
    type: 'select',
    options: ['Just me (self-employed)', '2-10 people', '11-50 people', '51-200 people', '201-1,000 people', '1,000+ people'],
  },
  {
    name: 'employmentType',
    label: 'Employment type',
    type: 'select',
    options: ['Full-time employee', 'Part-time employee', 'Self-employed / freelance', 'Contract', 'Other'],
  },
]

const DEBT_TYPE_OPTIONS = [
  { label: 'Credit Card', kind: 'credit_card' },
  { label: 'Student Loan', kind: 'student' },
  { label: 'Mortgage', kind: 'mortgage' },
  { label: 'Auto Loan', kind: 'auto' },
  { label: 'Personal Loan', kind: 'personal' },
  { label: 'Other', kind: 'other' },
]

const ASSET_FIELDS = [
  { name: 'checking_savings', label: 'Checking / savings accounts' },
  { name: 'brokerage', label: 'Investment accounts / brokerage' },
  { name: 'retirement_401k', label: '401(k) / 403(b) balance' },
  { name: 'traditional_ira', label: 'Traditional IRA balance' },
  { name: 'roth_ira', label: 'Roth IRA balance' },
  { name: 'home_value', label: 'Home value (0 if renter)' },
  { name: 'other_real_estate', label: 'Other real estate' },
  { name: 'vehicle_value', label: 'Vehicle value' },
  { name: 'other_assets', label: 'Other assets' },
]

function parsePositiveNumber(value) {
  const cleaned = String(value).replace(/,/g, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseCurrency(value) {
  const cleaned = String(value).replace(/,/g, '').trim()
  if (!cleaned) return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

const inputBaseStyle = {
  width: '100%',
  height: 48,
  boxSizing: 'border-box',
  background: '#FFF9EC',
  borderRadius: 12,
  color: '#2B261B',
  fontSize: 16,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
}

function inputStyle(hasError) {
  return {
    ...inputBaseStyle,
    border: `1px solid {hasError ? '#B94545' : 'rgba(89, 73, 35, 0.22)'}`,
    padding: '0 15px',
  }
}

function makeFocusHandlers(hasError) {
  return {
    onFocus: (e) => {
      e.target.style.borderColor = GOLD
      e.target.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.22)'
      e.target.style.background = '#FFFFFF'
    },
    onBlur: (e) => {
      e.target.style.borderColor = hasError ? '#B94545' : 'rgba(89, 73, 35, 0.22)'
      e.target.style.boxShadow = 'none'
      e.target.style.background = '#FFF9EC'
    },
  }
}

const STEP_TITLES = [
  'Tell us about your finances',
  'Tell us about your debts',
  'Tell us about your assets',
  'Tell us about your work',
]

const STEP_SUBTITLES = [
  'This takes about 30 seconds',
  "We'll factor these into your financial plan",
  'A complete picture helps us optimize your plan',
  'Helps us understand your income stability',
]

export default function IntakeForm({ onSubmit }) {
  const [step, setStep] = useState(1)
  const [financialData, setFinancialData] = useState(null)
  const [debtsData, setDebtsData] = useState(null)
  const [assetsData, setAssetsData] = useState(null)

  const [values, setValues] = useState({
    income: '',
    expenses: '',
    liquidCapital: '',
    emergencyFund: '',
    age: '',
  })
  const [errors, setErrors] = useState({})

  const [debtRows, setDebtRows] = useState([])
  const [noDebts, setNoDebts] = useState(false)
  const [debtsError, setDebtsError] = useState(null)

  const [assetValues, setAssetValues] = useState(
    Object.fromEntries(ASSET_FIELDS.map((f) => [f.name, '']))
  )

  const [employmentValues, setEmploymentValues] = useState({
    employerCompany: '',
    jobTitle: '',
    companyTenure: '',
    companySize: '',
    employmentType: '',
  })
  const [employmentErrors, setEmploymentErrors] = useState({})

  function handleChange(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: null }))
  }

  function handleFinancialSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    const parsedValues = {}
    FIELDS.forEach((field) => {
      const parsed = parsePositiveNumber(values[field.name])
      if (parsed === null) {
        nextErrors[field.name] = 'Enter a positive number.'
      } else {
        parsedValues[field.name] = parsed
      }
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setFinancialData(parsedValues)
    setStep(2)
  }

  function addDebtRow() {
    setDebtRows((prev) => [...prev, { kind: 'credit_card', balance: '', apr: '' }])
    setNoDebts(false)
    setDebtsError(null)
  }

  function removeDebtRow(index) {
    setDebtRows((prev) => prev.filter((_, i) => i !== index))
    setDebtsError(null)
  }

  function updateDebtRow(index, field, value) {
    setDebtRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
    setDebtsError(null)
  }

  function handleDebtsSubmit(event) {
    event.preventDefault()
    if (debtRows.length === 0 && !noDebts) {
      setDebtsError('Add at least one debt or check "I have no debts".')
      return
    }
    const debts = debtRows.map((row) => {
      const balance = parseFloat(String(row.balance).replace(/,/g, '')) || 0
      const aprRaw = parseFloat(String(row.apr).replace(/,/g, '')) || 0
      return { kind: row.kind, balance, apr: aprRaw / 100 }
    })
    setDebtsData(debts)
    setStep(3)
  }

  function handleAssetChange(name, value) {
    setAssetValues((prev) => ({ ...prev, [name]: value }))
  }

  function handleAssetsSubmit(event) {
    event.preventDefault()
    const parsed = {}
    ASSET_FIELDS.forEach((f) => {
      parsed[f.name] = parseCurrency(assetValues[f.name])
    })
    setAssetsData(parsed)
    setStep(4)
  }

  function handleEmploymentChange(name, value) {
    setEmploymentValues((prev) => ({ ...prev, [name]: value }))
    setEmploymentErrors((prev) => ({ ...prev, [name]: null }))
  }

  function handleEmploymentSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    const parsedEmploymentValues = {}
    EMPLOYMENT_FIELDS.forEach((field) => {
      const value = employmentValues[field.name].trim()
      if (!value) {
        nextErrors[field.name] = 'This field is required.'
      } else {
        parsedEmploymentValues[field.name] = value
      }
    })
    setEmploymentErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    onSubmit({
      ...financialData,
      debts: debtsData,
      ...assetsData,
      ...parsedEmploymentValues,
    })
  }

  function getSubmitHandler() {
    if (step === 1) return handleFinancialSubmit
    if (step === 2) return handleDebtsSubmit
    if (step === 3) return handleAssetsSubmit
    return handleEmploymentSubmit
  }

  const debtInputStyle = {
    height: 42,
    boxSizing: 'border-box',
    background: '#FFFFFF',
    border: '1px solid rgba(89, 73, 35, 0.22)',
    borderRadius: 10,
    color: '#2B261B',
    fontSize: 14,
    fontFamily: 'DM Sans, sans-serif',
    outline: 'none',
    padding: '0 10px',
  }

  const debtFocusOn = (e) => {
    e.target.style.borderColor = GOLD
    e.target.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.22)'
  }
  const debtFocusOff = (e) => {
    e.target.style.borderColor = 'rgba(89, 73, 35, 0.22)'
    e.target.style.boxShadow = 'none'
  }

  return (
    <div
      className="h-full overflow-y-auto px-5 py-10"
      style={{ background: '#F8F2E6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <form
        onSubmit={getSubmitHandler()}
        noValidate
        style={{
          width: 'min(100%, 560px)',
          background: '#FFFDF8',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 18,
          boxShadow: '0 22px 60px rgba(69, 55, 25, 0.12)',
          padding: '34px',
        }}
      >
        {/* Step indicator */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif' }}>
            Step {step} of 4
          </span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <h1 className="font-display" style={{ color: '#2B261B', fontFamily: "\"Playfair Display\", serif", fontSize: 34, fontWeight: 700, lineHeight: 1.12, letterSpacing: 0, margin: 0 }}>
            {STEP_TITLES[step - 1]}
          </h1>
          <p style={{ color: '#7A6D52', fontSize: 15, margin: '10px 0 0' }}>
            {STEP_SUBTITLES[step - 1]}
          </p>
        </div>

        {/* Step 1: Finances */}
        {step === 1 && (
          <div style={{ display: 'grid', gap: 18 }}>
            {FIELDS.map((field) => {
              const hasError = Boolean(errors[field.name])
              return (
                <label key={field.name} style={{ display: 'grid', gap: 7 }}>
                  <span style={{ color: '#3B3425', fontSize: 13, fontWeight: 700 }}>{field.label}</span>
                  <div style={{ position: 'relative' }}>
                    {field.type === 'currency' && (
                      <span aria-hidden="true" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: '#8A7B5B', fontSize: 15, fontWeight: 700 }}>
                        $
                      </span>
                    )}
                    <input
                      value={values[field.name]}
                      onChange={(e) => handleChange(field.name, e.target.value)}
                      type="number"
                      inputMode={field.type === 'currency' ? 'decimal' : 'numeric'}
                      min="0"
                      step={field.type === 'currency' ? '0.01' : '1'}
                      required
                      aria-invalid={hasError}
                      aria-describedby={hasError ? `{field.name}-error` : undefined}
                      placeholder={field.placeholder}
                      style={{ ...inputStyle(hasError), padding: field.type === 'currency' ? '0 15px 0 34px' : '0 15px' }}
                      {...makeFocusHandlers(hasError)}
                    />
                  </div>
                  {hasError && (
                    <span id={`{field.name}-error`} style={{ color: '#B94545', fontSize: 12 }}>{errors[field.name]}</span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {/* Step 2: Debts */}
        {step === 2 && (
          <div style={{ display: 'grid', gap: 18 }}>
            {debtRows.map((row, index) => (
              <div
                key={index}
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end', background: '#FFF9EC', border: '1px solid rgba(201,168,76,0.18)', borderRadius: 12, padding: '14px' }}
              >
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: '#3B3425', fontSize: 12, fontWeight: 700 }}>Type</span>
                  <select value={row.kind} onChange={(e) => updateDebtRow(index, 'kind', e.target.value)} style={debtInputStyle} onFocus={debtFocusOn} onBlur={debtFocusOff}>
                    {DEBT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.kind} value={opt.kind}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: '#3B3425', fontSize: 12, fontWeight: 700 }}>Balance ($)</span>
                  <input type="number" min="0" step="0.01" value={row.balance} onChange={(e) => updateDebtRow(index, 'balance', e.target.value)} placeholder="5,000" style={debtInputStyle} onFocus={debtFocusOn} onBlur={debtFocusOff} />
                </label>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: '#3B3425', fontSize: 12, fontWeight: 700 }}>APR (%)</span>
                  <input type="number" min="0" max="100" step="0.01" value={row.apr} onChange={(e) => updateDebtRow(index, 'apr', e.target.value)} placeholder="22" style={debtInputStyle} onFocus={debtFocusOn} onBlur={debtFocusOff} />
                </label>
                <button
                  type="button"
                  onClick={() => removeDebtRow(index)}
                  aria-label="Remove debt"
                  style={{ height: 42, width: 42, border: '1px solid rgba(185, 69, 69, 0.3)', borderRadius: 10, background: 'rgba(185,69,69,0.06)', color: '#B94545', cursor: 'pointer', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'end', flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addDebtRow}
              style={{ height: 44, border: '2px dashed rgba(201,168,76,0.45)', borderRadius: 12, background: 'transparent', color: GOLD, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'DM Sans, sans-serif', transition: 'background 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,168,76,0.07)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              + Add a debt
            </button>

            {debtRows.length === 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: '#3B3425', fontSize: 14, fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>
                <input
                  type="checkbox"
                  checked={noDebts}
                  onChange={(e) => { setNoDebts(e.target.checked); setDebtsError(null) }}
                  style={{ accentColor: GOLD, width: 16, height: 16, cursor: 'pointer' }}
                />
                I have no debts
              </label>
            )}

            {debtsError && <span style={{ color: '#B94545', fontSize: 13 }}>{debtsError}</span>}
          </div>
        )}

        {/* Step 3: Assets */}
        {step === 3 && (
          <div style={{ display: 'grid', gap: 18 }}>
            {ASSET_FIELDS.map((field) => (
              <label key={field.name} style={{ display: 'grid', gap: 7 }}>
                <span style={{ color: '#3B3425', fontSize: 13, fontWeight: 700 }}>{field.label}</span>
                <div style={{ position: 'relative' }}>
                  <span aria-hidden="true" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: '#8A7B5B', fontSize: 15, fontWeight: 700 }}>
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={assetValues[field.name]}
                    onChange={(e) => handleAssetChange(field.name, e.target.value)}
                    placeholder="0"
                    style={{ ...inputStyle(false), padding: '0 15px 0 34px' }}
                    {...makeFocusHandlers(false)}
                  />
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Step 4: Employment */}
        {step === 4 && (
          <div style={{ display: 'grid', gap: 18 }}>
            {EMPLOYMENT_FIELDS.map((field) => {
              const hasError = Boolean(employmentErrors[field.name])
              return (
                <label key={field.name} style={{ display: 'grid', gap: 7 }}>
                  <span style={{ color: '#3B3425', fontSize: 13, fontWeight: 700 }}>{field.label}</span>
                  {field.type === 'select' ? (
                    <select
                      value={employmentValues[field.name]}
                      onChange={(e) => handleEmploymentChange(field.name, e.target.value)}
                      required
                      aria-invalid={hasError}
                      aria-describedby={hasError ? `{field.name}-error` : undefined}
                      style={inputStyle(hasError)}
                      {...makeFocusHandlers(hasError)}
                    >
                      <option value="">Select one</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={employmentValues[field.name]}
                      onChange={(e) => handleEmploymentChange(field.name, e.target.value)}
                      type="text"
                      required
                      aria-invalid={hasError}
                      aria-describedby={hasError ? `{field.name}-error` : undefined}
                      placeholder={field.placeholder}
                      style={inputStyle(hasError)}
                      {...makeFocusHandlers(hasError)}
                    />
                  )}
                  {hasError && (
                    <span id={`{field.name}-error`} style={{ color: '#B94545', fontSize: 12 }}>{employmentErrors[field.name]}</span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {/* Submit / Continue button */}
        <button
          type="submit"
          style={{ width: '100%', height: 50, marginTop: 28, border: 'none', borderRadius: 12, background: GOLD, color: '#FFFFFF', cursor: 'pointer', fontSize: 15, fontWeight: 800, fontFamily: 'DM Sans, sans-serif', boxShadow: '0 12px 24px rgba(201,168,76,0.3)', transition: 'filter 0.15s, transform 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.96)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
          onFocus={(e) => { e.currentTarget.style.outline = '3px solid rgba(201,168,76,0.3)'; e.currentTarget.style.outlineOffset = '3px' }}
          onBlur={(e) => (e.currentTarget.style.outline = 'none')}
        >
          {step < 4 ? 'Continue' : 'Submit'}
        </button>

        {/* Back button */}
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            style={{ display: 'block', margin: '16px auto 0', padding: 0, border: 'none', background: 'transparent', color: '#7A6D52', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'DM Sans, sans-serif', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            Back
          </button>
        )}
      </form>
    </div>
  )
}
