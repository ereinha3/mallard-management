/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle, Loader, Save, Settings, SlidersHorizontal } from 'lucide-react'
import { postUpdateProfile } from '../api/greenlightClient'
import { formatCurrency, formatPercent, numberOrNull } from '../lib/utils'

const MONEY_FIELDS = new Set([
  'household_income',
  'monthly_expenses',
  'capital_on_hand',
  'emergency_fund',
  'home_value',
  'non_liquid_savings',
  'balance_401k',
  'ira_balance',
  'hsa_balance',
  'goal_target',
  'loss_aversion_probe',
  'pretax_401k',
  'pretax_ira',
  'pretax_hsa',
])
const FRACTION_PERCENT_FIELDS = new Set(['employer_match_rate', 'employer_match_cap_pct'])
const NUMBER_FIELDS = new Set([
  'age',
  'horizon_years',
  'dependents',
  'dohmen_risk',
  ...FRACTION_PERCENT_FIELDS,
  ...MONEY_FIELDS,
])
const BOOLEAN_FIELDS = new Set(['has_hsa_eligible_plan'])
const ARRAY_FIELDS = new Set(['goals', 'esg_exclusions', 'sector_theme_tilts'])
const TAG_OPTIONS = {
  goals: ['retirement', 'home purchase', 'education', 'emergency fund', 'wealth building', 'travel', 'other'],
  esg_exclusions: ['fossil_fuels', 'weapons', 'tobacco', 'gambling', 'none'],
  sector_theme_tilts: ['clean energy', 'healthcare', 'technology', 'real estate', 'international', 'small cap', 'dividends', 'bonds', 'none'],
}

const FINANCIAL_FIELDS = [
  { key: 'household_income', label: 'Household income', type: 'money' },
  { key: 'monthly_expenses', label: 'Monthly expenses', type: 'money' },
  { key: 'capital_on_hand', label: 'Liquid savings (investable)', type: 'money' },
  { key: 'emergency_fund', label: 'Emergency fund (set aside)', type: 'money' },
  { key: 'home_value', label: 'Home value', type: 'money' },
  { key: 'non_liquid_savings', label: 'Taxable brokerage / non-liquid savings', type: 'money' },
  { key: 'balance_401k', label: '401(k) balance', type: 'money' },
  { key: 'ira_balance', label: 'IRA balance', type: 'money' },
  { key: 'hsa_balance', label: 'HSA balance', type: 'money' },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'horizon_years', label: 'Goal horizon (years)', type: 'number' },
  { key: 'dependents', label: 'Dependents', type: 'number' },
]

const PREFERENCE_FIELDS = [
  { key: 'goals', label: 'Goals', type: 'tags', options: TAG_OPTIONS.goals },
  { key: 'goal_target', label: 'Goal target', type: 'money' },
  {
    key: 'universe_pref',
    label: 'Universe preference',
    type: 'pills',
    options: ['etf', 'stock', 'mix'],
  },
  { key: 'esg_exclusions', label: 'ESG exclusions', type: 'tags', options: TAG_OPTIONS.esg_exclusions },
  { key: 'sector_theme_tilts', label: 'Sector/theme tilts', type: 'tags', options: TAG_OPTIONS.sector_theme_tilts },
]

const RISK_SIGNAL_FIELDS = [
  { key: 'income_stability', label: 'Income stability', type: 'select', options: ['bond_like', 'mixed', 'stock_like'] },
  { key: 'dohmen_risk', label: 'Risk willingness (0-10)', type: 'number' },
  { key: 'loss_scenario_response', label: 'Market drop response', type: 'select', options: ['sell_all', 'sell_some', 'hold', 'buy_more'] },
  { key: 'loss_aversion_probe', label: 'Loss-aversion win threshold', type: 'money' },
]

const TAX_FIELDS = [
  { key: 'filing_status', label: 'Filing status', type: 'select', options: ['single', 'married_joint', 'married_separate', 'head_of_household'] },
  { key: 'pretax_401k', label: 'Annual 401(k) contribution', type: 'money' },
  { key: 'pretax_ira', label: 'Annual IRA contribution', type: 'money' },
  { key: 'pretax_hsa', label: 'Annual HSA contribution', type: 'money' },
  { key: 'employer_match_rate', label: 'Employer match rate', type: 'fraction_percent' },
  { key: 'employer_match_cap_pct', label: 'Employer match cap', type: 'fraction_percent' },
  { key: 'has_hsa_eligible_plan', label: 'HSA-eligible plan', type: 'boolean' },
  { key: 'hsa_coverage', label: 'HSA coverage', type: 'select', options: ['self_only', 'family'] },
]

function getProfile(onboardResult) {
  return onboardResult?.validated_profile ?? {}
}

function getUserEmail(onboardResult, userEmail) {
  return userEmail
    ?? onboardResult?.validated_profile?.email
    ?? onboardResult?.user?.email
    ?? onboardResult?.email
    ?? null
}

function labelize(value) {
  const label = String(value ?? '').replace(/_/g, ' ')
  return label.toLowerCase() === 'esg' ? 'ESG' : label
}

function serializeField(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function buildFormState(profile) {
  return [...FINANCIAL_FIELDS, ...PREFERENCE_FIELDS, ...RISK_SIGNAL_FIELDS, ...TAX_FIELDS].reduce((acc, field) => {
    acc[field.key] = serializeField(profile[field.key])
    return acc
  }, {})
}

function parseField(key, value) {
  const trimmed = String(value ?? '').trim()

  if (NUMBER_FIELDS.has(key)) {
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (BOOLEAN_FIELDS.has(key)) {
    if (trimmed === '') return null
    return trimmed === 'true'
  }

  if (ARRAY_FIELDS.has(key)) {
    if (!trimmed) return []
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed)
      } catch {
        return trimmed.split(',').map(item => item.trim()).filter(Boolean)
      }
    }
    return trimmed.split(',').map(item => item.trim()).filter(Boolean)
  }

  return trimmed
}

function normalizedOriginalValue(key, value) {
  if (NUMBER_FIELDS.has(key)) {
    if (value == null || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (ARRAY_FIELDS.has(key)) {
    if (value == null || value === '') return []
    return Array.isArray(value) ? value : parseField(key, value)
  }
  if (BOOLEAN_FIELDS.has(key)) {
    if (value == null || value === '') return null
    return Boolean(value)
  }
  return value == null ? '' : String(value)
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function buildPatch(profile, formState, fields) {
  return fields.reduce((patch, field) => {
    if (field.key === 'bracket') return patch
    const nextValue = parseField(field.key, formState[field.key])
    const currentValue = normalizedOriginalValue(field.key, profile[field.key])
    if (!sameValue(nextValue, currentValue)) patch[field.key] = nextValue
    return patch
  }, {})
}

function mergeProfileResult(onboardResult, patch, baseResult = onboardResult) {
  const profile = getProfile(baseResult)
  const nextProfile = { ...profile, ...patch }
  return {
    ...(baseResult ?? {}),
    validated_profile: {
      ...profile,
      ...patch,
    },
    optimizer_input: {
      ...(baseResult?.optimizer_input ?? {}),
      ...(patch.capital_on_hand != null ? { capital_on_hand: patch.capital_on_hand } : {}),
      ...(patch.monthly_surplus != null ? { monthly_surplus: patch.monthly_surplus } : {}),
    },
    _local_profile_patch: nextProfile,
  }
}

function getComputedTaxBracket(onboardResult) {
  const profileBracket = numberOrNull(onboardResult?.validated_profile?.bracket)
  if (profileBracket != null) return profileBracket

  const taxBreakdown = onboardResult?.tax_breakdown
  const candidates = [
    taxBreakdown?.marginal_tax_rate,
    taxBreakdown?.marginal_rate,
    taxBreakdown?.tax_rate_used,
    taxBreakdown?.effective_tax_rate,
  ]

  return candidates.map(numberOrNull).find(value => value != null) ?? null
}

function MultiSelectDropdown({ id, field, value, options, onChange, style }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const selectedValues = parseField(field.key, value)
  const selectedSet = new Set(selectedValues)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!dropdownRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggleOption(option) {
    const nextValues = selectedSet.has(option)
      ? selectedValues.filter(item => item !== option)
      : [...selectedValues, option]

    onChange(field.key, nextValues.join(', '))
  }

  return (
    <div ref={dropdownRef} id={id} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          ...style,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        {selectedValues.length > 0 ? selectedValues.join(', ') : 'Select...'}
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg-surface)',
            boxShadow: '0 16px 34px rgba(0,0,0,0.18)',
          }}
        >
          {options.map(option => {
            const isSelected = selectedSet.has(option)

            return (
              <div
                key={option}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => toggleOption(option)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleOption(option)
                  }
                }}
                className="transition-colors"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  border: 0,
                  background: 'transparent',
                  color: isSelected ? 'var(--gold-light)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                }}
                onMouseEnter={event => {
                  event.currentTarget.style.background = 'var(--bg-elevated)'
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.background = 'transparent'
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  style={{
                    width: 13,
                    height: 13,
                    margin: 0,
                    accentColor: 'var(--gold-light)',
                    cursor: 'pointer',
                    pointerEvents: 'none',
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    width: 14,
                    flex: '0 0 14px',
                    color: 'var(--gold-light)',
                    visibility: isSelected ? 'visible' : 'hidden',
                  }}
                >
                  ✓
                </span>
                <span>{labelize(option)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ field, value, onChange }) {
  const inputId = `profile-${field.key}`
  const fieldOptions = field.options ?? []
  const selectedValues = field.type === 'multi-select' ? parseField(field.key, value) : []
  const options = field.type === 'multi-select'
    ? [...new Set([...fieldOptions, ...selectedValues])]
    : fieldOptions
  const commonStyle = {
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--border-bright)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    padding: '10px 11px',
    fontSize: 13,
    outline: 'none',
  }

  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {field.label}
      </span>
      {field.type === 'boolean' ? (
        <select
          id={inputId}
          value={value}
          onChange={event => onChange(field.key, event.target.value)}
          style={commonStyle}
        >
          <option value="">Not provided</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : field.type === 'select' ? (
        <select
          id={inputId}
          value={value}
          onChange={event => onChange(field.key, event.target.value)}
          style={commonStyle}
        >
          <option value="">Not provided</option>
          {options.map(option => (
            <option key={option} value={option}>{labelize(option)}</option>
          ))}
        </select>
      ) : field.type === 'pills' ? (
        <div id={inputId} className="flex flex-wrap gap-2">
          {options.map(option => {
            const isSelected = value === option

            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(field.key, option)}
                className="font-semibold transition-all"
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: isSelected ? '1px solid var(--border-gold)' : '1px solid var(--border)',
                  background: isSelected ? 'rgba(201,168,76,0.1)' : 'var(--bg-elevated)',
                  color: isSelected ? 'var(--gold-light)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {labelize(option)}
              </button>
            )
          })}
        </div>
      ) : field.type === 'multi-select' ? (
        <select
          id={inputId}
          multiple
          size={Math.min(Math.max(options.length, 4), 7)}
          value={selectedValues}
          onChange={event => {
            const nextValues = Array.from(event.target.selectedOptions, option => option.value)
            onChange(field.key, nextValues.join(', '))
          }}
          style={{
            ...commonStyle,
            minHeight: 122,
            padding: 7,
            lineHeight: 1.5,
          }}
        >
          {options.map(option => (
            <option key={option} value={option}>{labelize(option)}</option>
          ))}
        </select>
      ) : field.type === 'tags' ? (
        <MultiSelectDropdown
          id={inputId}
          field={field}
          value={value}
          options={options}
          onChange={onChange}
          style={commonStyle}
        />
      ) : (
        <input
          id={inputId}
          type={field.type === 'money' || field.type === 'number' || field.type === 'fraction_percent' ? 'number' : 'text'}
          min={field.type === 'money' || field.type === 'number' || field.type === 'fraction_percent' ? '0' : undefined}
          max={field.type === 'fraction_percent' ? '1' : undefined}
          step={field.type === 'fraction_percent' ? '0.001' : field.type === 'money' || field.type === 'number' ? '1' : undefined}
          value={value}
          placeholder={field.placeholder}
          onChange={event => onChange(field.key, event.target.value)}
          style={commonStyle}
        />
      )}
      {field.type === 'money' && value !== '' && Number.isFinite(Number(value)) && (
        <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {formatCurrency(Number(value))}
        </span>
      )}
      {field.type === 'fraction_percent' && numberOrNull(value) != null && (
        <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {formatPercent(numberOrNull(value) * 100)}
        </span>
      )}
    </label>
  )
}

function FieldSection({ icon: Icon, title, fields, formState, onChange, dataTour }) {
  return (
    <section data-tour={dataTour} className="card-premium p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={14} style={{ color: 'var(--gold-light)' }} />
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {title}
        </div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {fields.map(field => (
          <Field
            key={field.key}
            field={field}
            value={formState[field.key] ?? ''}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  )
}

function ReadOnlyTaxBracket({ onboardResult }) {
  const computedBracket = getComputedTaxBracket(onboardResult)

  return (
    <section className="card-premium p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={14} style={{ color: 'var(--gold-light)' }} />
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Tax Bracket
        </div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <div>
          <span className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Tax bracket (auto-calculated)
          </span>
          <div
            className="font-semibold"
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--border-bright)',
              background: 'var(--bg-elevated)',
              color: computedBracket == null ? 'var(--text-muted)' : 'var(--text-primary)',
              padding: '10px 11px',
              fontSize: 13,
            }}
          >
            {computedBracket == null ? 'Auto-calculated' : formatPercent(computedBracket * 100)}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function ProfileView({ onboardResult, userEmail, onUpdated, embedded = false }) {
  const profile = useMemo(() => getProfile(onboardResult), [onboardResult])
  const resolvedUserEmail = getUserEmail(onboardResult, userEmail)
  const editableFields = useMemo(() => (
    [...FINANCIAL_FIELDS, ...PREFERENCE_FIELDS, ...RISK_SIGNAL_FIELDS, ...TAX_FIELDS]
  ), [])
  const [formState, setFormState] = useState(() => buildFormState(profile))
  const [saveState, setSaveState] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setFormState(buildFormState(profile))
  }, [profile])

  function handleChange(key, value) {
    setFormState(prev => ({ ...prev, [key]: value }))
    if (saveState !== 'saving') {
      setSaveState('idle')
      setMessage('')
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    const profilePatch = buildPatch(profile, formState, editableFields)

    if (Object.keys(profilePatch).length === 0) {
      setSaveState('success')
      setMessage('No changes to save.')
      return
    }

    setSaveState('saving')
    setMessage('')

    try {
      const updated = resolvedUserEmail && resolvedUserEmail !== 'demo@mallard.test'
        ? await postUpdateProfile({ user_email: resolvedUserEmail, profile_patch: profilePatch })
        : mergeProfileResult(onboardResult, profilePatch)
      const patchedUpdate = mergeProfileResult(onboardResult, profilePatch, updated)
      onUpdated?.(patchedUpdate)
      setSaveState(resolvedUserEmail && resolvedUserEmail !== 'demo@mallard.test' ? 'success' : 'local')
      setMessage(resolvedUserEmail && resolvedUserEmail !== 'demo@mallard.test' ? 'Saved and reweighted.' : 'Saved locally for this session.')
    } catch (error) {
      onUpdated?.(mergeProfileResult(onboardResult, profilePatch))
      setSaveState('local')
      setMessage(error?.message ? `Saved locally. Backend update failed: ${error.message}` : 'Saved locally. Backend update failed.')
    }
  }

  const isSaving = saveState === 'saving'

  return (
    <div className={embedded ? 'flex flex-col' : 'flex flex-col h-full overflow-y-auto'} style={{ background: embedded ? 'transparent' : 'var(--bg-base)' }}>
      <header className="px-8 py-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)' }}>Your Profile</h1>
            <p className="text-xs mt-2 uppercase tracking-wide font-semibold" style={{ color: 'var(--text-muted)' }}>
              Edit financial data and investing preferences used by Greenlight
            </p>
          </div>
          <button
            type="submit"
            form="profile-edit-form"
            data-tour="profile-save"
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: isSaving ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--green, var(--emerald)), var(--green-bright))',
              border: '1px solid var(--green-light, var(--green))',
              color: isSaving ? 'var(--text-muted)' : '#07120d',
              cursor: isSaving ? 'wait' : 'pointer',
              boxShadow: isSaving ? 'none' : '0 14px 34px rgba(30,184,122,0.20)',
            }}
          >
            {isSaving ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </header>

      <form id="profile-edit-form" data-tour="profile-edit" onSubmit={handleSave} className="p-8 grid gap-5 max-w-6xl" style={{ gridTemplateColumns: '1fr' }}>
        <FieldSection
          icon={Settings}
          title="Financial Profile"
          fields={FINANCIAL_FIELDS}
          formState={formState}
          onChange={handleChange}
        />

        <FieldSection
          icon={SlidersHorizontal}
          title="Investing Preferences"
          fields={PREFERENCE_FIELDS}
          formState={formState}
          onChange={handleChange}
          dataTour="profile-preferences"
        />

        <FieldSection
          icon={SlidersHorizontal}
          title="Risk Inputs"
          fields={RISK_SIGNAL_FIELDS}
          formState={formState}
          onChange={handleChange}
        />

        <FieldSection
          icon={Settings}
          title="Tax and Contributions"
          fields={TAX_FIELDS}
          formState={formState}
          onChange={handleChange}
        />

        <ReadOnlyTaxBracket onboardResult={onboardResult} />

        {message && (
          <div
            className="card-premium p-4 flex items-start gap-3 text-sm font-semibold"
            style={{ color: saveState === 'local' ? 'var(--gold-light)' : 'var(--green)' }}
          >
            {saveState === 'local' ? <AlertTriangle size={17} /> : <CheckCircle size={17} />}
            <span>{message}</span>
          </div>
        )}
      </form>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
