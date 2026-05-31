import { useState } from 'react'
import { AlertCircle, ArrowRight, Feather, MapPin, PiggyBank } from 'lucide-react'

const FILING_STATUSES = [
  { value: '', label: 'Select filing status' },
  { value: 'single', label: 'Single' },
  { value: 'married_filing_jointly', label: 'Married filing jointly' },
  { value: 'married_filing_separately', label: 'Married filing separately' },
  { value: 'head_of_household', label: 'Head of household' },
  { value: 'qualifying_surviving_spouse', label: 'Qualifying surviving spouse' },
]

const HSA_COVERAGE = [
  { value: 'self', label: 'Self' },
  { value: 'family', label: 'Family' },
]

let _uid = 0

function nextId(prefix) {
  _uid += 1
  return `${prefix}-${_uid}`
}

function Field({ label, value, onChange, type = 'text', placeholder, error, inputMode, autoComplete }) {
  const [id] = useState(() => nextId('tax-field'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        style={{
          ...controlStyle,
          borderColor: error ? 'rgba(217,64,64,0.65)' : 'var(--border-bright)',
        }}
        onFocus={handleFocus(error)}
        onBlur={handleBlur(error)}
      />
      {error && <FieldError id={`${id}-err`} message={error} />}
    </div>
  )
}

function SelectField({ label, value, onChange, options, error }) {
  const [id] = useState(() => nextId('tax-select'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        style={{
          ...controlStyle,
          appearance: 'none',
          backgroundImage:
            'linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%)',
          backgroundPosition: 'calc(100% - 18px) 50%, calc(100% - 13px) 50%',
          backgroundSize: '5px 5px, 5px 5px',
          backgroundRepeat: 'no-repeat',
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          borderColor: error ? 'rgba(217,64,64,0.65)' : 'var(--border-bright)',
        }}
        onFocus={handleFocus(error)}
        onBlur={handleBlur(error)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <FieldError id={`${id}-err`} message={error} />}
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  const [labelId] = useState(() => nextId('tax-toggle-label'))

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '12px 14px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-bright)',
      borderRadius: 8,
    }}>
      <div>
        <div id={labelId} style={labelStyle}>{label}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
          {checked ? 'Yes' : 'No'}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        onClick={() => onChange(!checked)}
        style={{
          width: 54,
          height: 30,
          border: `1px solid ${checked ? 'rgba(201,151,26,0.65)' : 'var(--border-bright)'}`,
          borderRadius: 999,
          background: checked ? 'rgba(176,128,16,0.18)' : 'var(--bg-surface)',
          cursor: 'pointer',
          padding: 3,
          transition: 'background 0.15s, border-color 0.15s',
          flexShrink: 0,
        }}
      >
        <span style={{
          display: 'block',
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: checked
            ? 'linear-gradient(135deg, var(--gold), var(--gold-bright))'
            : 'var(--text-muted)',
          transform: checked ? 'translateX(23px)' : 'translateX(0)',
          transition: 'transform 0.15s, background 0.15s',
        }} />
      </button>
    </div>
  )
}

function FieldError({ id, message }) {
  return (
    <div id={id} role="alert" style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ruby)', fontSize: 11.5 }}>
      <AlertCircle size={11} aria-hidden="true" />
      {message}
    </div>
  )
}

function Section({ icon, title, children }) {
  return (
    <section style={{
      padding: 18,
      border: '1px solid var(--border)',
      borderTopColor: 'var(--border-gold)',
      borderRadius: 10,
      background: 'var(--bg-surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(176,128,16,0.10)',
          color: 'var(--gold-light)',
          border: '1px solid rgba(176,128,16,0.18)',
        }}>
          {icon}
        </div>
        <h2 style={{
          margin: 0,
          color: 'var(--text-primary)',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: 0,
        }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function toNumber(value) {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isInvalidOptionalNumber(value) {
  if (String(value ?? '').trim() === '') return false
  return !Number.isFinite(Number(value))
}

function handleFocus(hasError) {
  return (event) => {
    event.target.style.borderColor = hasError ? 'var(--ruby)' : 'var(--gold-light)'
    event.target.style.boxShadow = '0 0 0 3px var(--focus-ring)'
  }
}

function handleBlur(hasError) {
  return (event) => {
    event.target.style.borderColor = hasError ? 'rgba(217,64,64,0.65)' : 'var(--border-bright)'
    event.target.style.boxShadow = 'none'
  }
}

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
}

const controlStyle = {
  width: '100%',
  minHeight: 42,
  boxSizing: 'border-box',
  padding: '11px 14px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-bright)',
  borderRadius: 7,
  color: 'var(--text-primary)',
  fontSize: 13.5,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

const initialForm = {
  state: '',
  filingStatus: '',
  annual401k: '',
  balance401k: '',
  employerMatchRate: '',
  employerMatchCap: '',
  traditionalIra: '',
  iraBalance: '',
  hsaEligible: false,
  hsaContribution: '',
  hsaBalance: '',
  hsaCoverage: 'self',
}

export default function TaxProfileForm({ onComplete, zip, homeValue }) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})

  const set = (field) => (event) => {
    setForm(prev => ({ ...prev, [field]: event.target.value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  const setStateCode = (event) => {
    const state = event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2)
    setForm(prev => ({ ...prev, state }))
    if (errors.state) setErrors(prev => ({ ...prev, state: null }))
  }

  function setHsaEligible(value) {
    setForm(prev => ({
      ...prev,
      hsaEligible: value,
      hsaContribution: value ? prev.hsaContribution : '',
      hsaBalance: value ? prev.hsaBalance : '',
      hsaCoverage: value ? prev.hsaCoverage : 'self',
    }))
  }

  function validate() {
    const nextErrors = {}
    const optionalNumericFields = [
      ['annual401k', 'Enter a valid 401k contribution.'],
      ['employerMatchRate', 'Enter a valid employer match rate.'],
      ['employerMatchCap', 'Enter a valid employer match cap.'],
      ['traditionalIra', 'Enter a valid IRA contribution.'],
    ]

    if (form.state.trim() && !/^[A-Z]{2}$/.test(form.state.trim())) {
      nextErrors.state = 'Enter a 2-letter uppercase state code.'
    }

    optionalNumericFields.forEach(([field, message]) => {
      if (isInvalidOptionalNumber(form[field])) nextErrors[field] = message
    })

    if (form.hsaEligible && isInvalidOptionalNumber(form.hsaContribution)) {
      nextErrors.hsaContribution = 'Enter a valid HSA contribution.'
    }

    if (!form.filingStatus) nextErrors.filingStatus = 'Filing status is required'
    return nextErrors
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validate()
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    onComplete({
      zip_code: zip?.trim() || null,
      home_value: homeValue ?? null,
      state: form.state.trim() || null,
      filing_status: form.filingStatus,
      balance_401k: toNumber(form.balance401k),
      ira_balance: toNumber(form.iraBalance),
      hsa_balance: toNumber(form.hsaBalance),
      pre_tax_contributions_annual: {
        traditional_401k: toNumber(form.annual401k),
        employer_match_rate_pct: toNumber(form.employerMatchRate),
        employer_match_cap_pct_salary: toNumber(form.employerMatchCap),
        traditional_ira: toNumber(form.traditionalIra),
        hsa_eligible: form.hsaEligible,
        hsa_contribution: form.hsaEligible ? toNumber(form.hsaContribution) : null,
        hsa_coverage: form.hsaEligible ? form.hsaCoverage : null,
      },
    })
  }

  return (
    <div className="tax-profile-screen" style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      display: 'grid',
      gridTemplateColumns: 'minmax(320px, 0.78fr) minmax(520px, 1fr)',
      overflow: 'hidden',
    }}>
      <aside className="tax-profile-brand" style={{
        position: 'relative',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        padding: '56px 64px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '100vh',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.04,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(var(--gold) 1px, transparent 1px), linear-gradient(90deg, var(--gold) 1px, transparent 1px)',
          backgroundSize: '68px 68px',
        }} />
        <div style={{
          position: 'absolute',
          right: -120,
          bottom: -120,
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(176,128,16,0.12) 0%, rgba(176,128,16,0.04) 48%, transparent 72%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
        }} />

        <div className="tax-profile-brand-footer" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold) 52%, #8c640d 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 24px rgba(176,128,16,0.28), inset 0 1px 1px rgba(255,255,255,0.35)',
            }}>
              <Feather size={23} color="#070604" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{
                fontFamily: 'Playfair Display, serif',
                fontWeight: 700,
                fontSize: 22,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
                lineHeight: 1.05,
              }}>
                Mallard
              </div>
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.28em',
                color: 'var(--gold-light)',
                fontFamily: 'JetBrains Mono, monospace',
                marginTop: 3,
              }}>
                MANAGEMENT
              </div>
            </div>
          </div>

          <div style={{
            marginTop: 86,
            maxWidth: 420,
            fontFamily: 'Playfair Display, serif',
            fontSize: 62,
            lineHeight: 1.02,
            fontWeight: 600,
            letterSpacing: '-0.045em',
            color: 'var(--text-primary)',
          }}>
            Sharpen your tax picture.
          </div>
          <p style={{
            maxWidth: 390,
            margin: '26px 0 0',
            color: 'var(--text-secondary)',
            fontSize: 15,
            lineHeight: 1.6,
          }}>
            Location and pre-tax contribution details help Mallard model take-home pay and tax-advantaged capacity with better precision.
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 18 }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            Demonstration only. Not financial or tax advice.
          </div>
        </div>
      </aside>

      <main style={{
        minHeight: '100vh',
        overflow: 'hidden auto',
        padding: '48px 56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <form onSubmit={handleSubmit} style={{
          width: '100%',
          maxWidth: 700,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          animation: 'taxFadeUp 0.28s ease both',
        }}>
          <div style={{ marginBottom: 8 }}>
            <div style={labelStyle}>Tax Profile</div>
            <h1 style={{
              margin: '6px 0 8px',
              color: 'var(--text-primary)',
              fontFamily: 'Playfair Display, serif',
              fontSize: 36,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}>
              A few tax inputs.
            </h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.5 }}>
              Filing status is required. Everything else can be added later.
            </p>
          </div>

          <Section title="Location & Filing" icon={<MapPin size={15} aria-hidden="true" />}>
            <div className="tax-profile-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field
                label="State"
                value={form.state}
                onChange={setStateCode}
                placeholder="CA"
                autoComplete="address-level1"
                error={errors.state}
              />
              <div style={{ gridColumn: '1 / -1' }}>
                <SelectField
                  label="Filing Status"
                  value={form.filingStatus}
                  onChange={set('filingStatus')}
                  options={FILING_STATUSES}
                  error={errors.filingStatus}
                />
              </div>
            </div>
          </Section>

          <Section title="Pre-Tax Contributions Annual" icon={<PiggyBank size={15} aria-hidden="true" />}>
            <div className="tax-profile-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field
                label="401k $"
                value={form.annual401k}
                onChange={set('annual401k')}
                placeholder="23000"
                inputMode="decimal"
                error={errors.annual401k}
              />
              <Field
                label="Current 401(k) balance"
                value={form.balance401k}
                onChange={set('balance401k')}
                placeholder="120000"
                inputMode="decimal"
              />
              <Field
                label="Employer Match Rate %"
                value={form.employerMatchRate}
                onChange={set('employerMatchRate')}
                placeholder="4"
                inputMode="decimal"
                error={errors.employerMatchRate}
              />
              <Field
                label="Employer Match Cap % of Salary"
                value={form.employerMatchCap}
                onChange={set('employerMatchCap')}
                placeholder="6"
                inputMode="decimal"
                error={errors.employerMatchCap}
              />
              <Field
                label="Traditional IRA $"
                value={form.traditionalIra}
                onChange={set('traditionalIra')}
                placeholder="7000"
                inputMode="decimal"
                error={errors.traditionalIra}
              />
              <Field
                label="Current IRA balance"
                value={form.iraBalance}
                onChange={set('iraBalance')}
                placeholder="38000"
                inputMode="decimal"
              />
              <div style={{ gridColumn: '1 / -1' }}>
                <Toggle
                  label="HSA Eligible"
                  checked={form.hsaEligible}
                  onChange={setHsaEligible}
                />
              </div>
              {form.hsaEligible && (
                <>
                  <Field
                    label="HSA Contribution $"
                    value={form.hsaContribution}
                    onChange={set('hsaContribution')}
                    placeholder="4150"
                    inputMode="decimal"
                    error={errors.hsaContribution}
                  />
                  <Field
                    label="Current HSA balance"
                    value={form.hsaBalance}
                    onChange={set('hsaBalance')}
                    placeholder="9500"
                    inputMode="decimal"
                  />
                  <SelectField
                    label="HSA Coverage"
                    value={form.hsaCoverage}
                    onChange={set('hsaCoverage')}
                    options={HSA_COVERAGE}
                  />
                </>
              )}
            </div>
          </Section>

          <button
            type="submit"
            style={{
              marginTop: 2,
              width: '100%',
              minHeight: 46,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
              color: '#070604',
              fontSize: 13.5,
              fontWeight: 700,
              fontFamily: 'DM Sans, sans-serif',
              letterSpacing: '0.03em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            Continue
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </form>
      </main>

      <style>{`
        .tax-profile-screen input::placeholder {
          color: var(--text-muted);
          opacity: 1;
        }

        .tax-profile-screen input:-webkit-autofill,
        .tax-profile-screen input:-webkit-autofill:hover,
        .tax-profile-screen input:-webkit-autofill:focus,
        .tax-profile-screen input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 100px var(--bg-elevated) inset !important;
          -webkit-text-fill-color: var(--text-primary) !important;
          transition: background-color 5000s ease-in-out 0s;
          caret-color: var(--text-primary);
        }

        @keyframes taxFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 980px) {
          .tax-profile-screen {
            grid-template-columns: 1fr !important;
            overflow: auto !important;
          }

          .tax-profile-brand {
            min-height: auto !important;
            border-right: none !important;
            border-bottom: 1px solid var(--border) !important;
            padding: 32px 28px !important;
          }

          .tax-profile-brand-footer {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .tax-profile-screen main {
            min-height: auto !important;
            padding: 28px 18px !important;
          }

          .tax-profile-grid {
            grid-template-columns: 1fr !important;
          }

          .tax-profile-grid > div {
            grid-column: auto !important;
          }
        }
      `}</style>
    </div>
  )
}
