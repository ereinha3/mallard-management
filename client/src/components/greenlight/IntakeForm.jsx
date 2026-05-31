import { useState } from 'react'

const GOLD = '#C9A84C'

const FIELDS = [
  { name: 'income', label: 'Annual household income', type: 'currency', placeholder: '120,000' },
  { name: 'expenses', label: 'Total monthly expenses', type: 'currency', placeholder: '6,500' },
  { name: 'liquidCapital', label: 'Liquid capital / savings', type: 'currency', placeholder: '45,000' },
  { name: 'emergencyFund', label: 'Emergency fund balance', type: 'currency', placeholder: '20,000' },
  { name: 'age', label: 'Age', type: 'number', placeholder: '38' },
]

function parsePositiveNumber(value) {
  const cleaned = String(value).replace(/,/g, '').trim()
  if (!cleaned) return null

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export default function IntakeForm({ onSubmit }) {
  const [values, setValues] = useState({
    income: '',
    expenses: '',
    liquidCapital: '',
    emergencyFund: '',
    age: '',
  })
  const [errors, setErrors] = useState({})

  function handleChange(name, value) {
    setValues(prev => ({ ...prev, [name]: value }))
    setErrors(prev => ({ ...prev, [name]: null }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const nextErrors = {}
    const parsedValues = {}

    FIELDS.forEach(field => {
      const parsed = parsePositiveNumber(values[field.name])
      if (parsed === null) {
        nextErrors[field.name] = 'Enter a positive number.'
      } else {
        parsedValues[field.name] = parsed
      }
    })

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    onSubmit(parsedValues)
  }

  return (
    <div
      className="h-full overflow-y-auto px-5 py-10"
      style={{
        background: '#F8F2E6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <form
        onSubmit={handleSubmit}
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
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <h1
            className="font-display"
            style={{
              color: '#2B261B',
              fontFamily: '"Playfair Display", serif',
              fontSize: 34,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: 0,
              margin: 0,
            }}
          >
            Tell us about your finances
          </h1>
          <p style={{ color: '#7A6D52', fontSize: 15, margin: '10px 0 0' }}>
            This takes about 30 seconds
          </p>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          {FIELDS.map(field => {
            const hasError = Boolean(errors[field.name])

            return (
              <label key={field.name} style={{ display: 'grid', gap: 7 }}>
                <span style={{ color: '#3B3425', fontSize: 13, fontWeight: 700 }}>
                  {field.label}
                </span>
                <div style={{ position: 'relative' }}>
                  {field.type === 'currency' && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 15,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#8A7B5B',
                        fontSize: 15,
                        fontWeight: 700,
                      }}
                    >
                      $
                    </span>
                  )}
                  <input
                    value={values[field.name]}
                    onChange={event => handleChange(field.name, event.target.value)}
                    type="number"
                    inputMode={field.type === 'currency' ? 'decimal' : 'numeric'}
                    min="0"
                    step={field.type === 'currency' ? '0.01' : '1'}
                    required
                    aria-invalid={hasError}
                    aria-describedby={hasError ? `${field.name}-error` : undefined}
                    placeholder={field.placeholder}
                    style={{
                      width: '100%',
                      height: 48,
                      boxSizing: 'border-box',
                      background: '#FFF9EC',
                      border: `1px solid ${hasError ? '#B94545' : 'rgba(89, 73, 35, 0.22)'}`,
                      borderRadius: 12,
                      color: '#2B261B',
                      fontSize: 16,
                      fontFamily: 'DM Sans, sans-serif',
                      outline: 'none',
                      padding: field.type === 'currency' ? '0 15px 0 34px' : '0 15px',
                      transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
                    }}
                    onFocus={event => {
                      event.target.style.borderColor = GOLD
                      event.target.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.22)'
                      event.target.style.background = '#FFFFFF'
                    }}
                    onBlur={event => {
                      event.target.style.borderColor = hasError ? '#B94545' : 'rgba(89, 73, 35, 0.22)'
                      event.target.style.boxShadow = 'none'
                      event.target.style.background = '#FFF9EC'
                    }}
                  />
                </div>
                {hasError && (
                  <span id={`${field.name}-error`} style={{ color: '#B94545', fontSize: 12 }}>
                    {errors[field.name]}
                  </span>
                )}
              </label>
            )
          })}
        </div>

        <button
          type="submit"
          style={{
            width: '100%',
            height: 50,
            marginTop: 28,
            border: 'none',
            borderRadius: 12,
            background: GOLD,
            color: '#FFFFFF',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 800,
            fontFamily: 'DM Sans, sans-serif',
            boxShadow: '0 12px 24px rgba(201,168,76,0.3)',
            transition: 'filter 0.15s, transform 0.15s',
          }}
          onMouseEnter={event => {
            event.currentTarget.style.filter = 'brightness(0.96)'
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
          Continue
        </button>
      </form>
    </div>
  )
}
