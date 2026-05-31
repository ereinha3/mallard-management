/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle, Loader, Save, Settings, SlidersHorizontal } from 'lucide-react'
import { postUpdateProfile } from '../api/greenlightClient'
import { formatCurrency } from '../lib/utils'

const MONEY_FIELDS = new Set(['household_income', 'monthly_expenses', 'capital_on_hand', 'emergency_fund', 'goal_target'])
const NUMBER_FIELDS = new Set(['age', 'horizon_years', 'target_volatility_pct', ...MONEY_FIELDS])
const ARRAY_FIELDS = new Set(['goals', 'esg_exclusions', 'sector_theme_tilts'])
const TAG_OPTIONS = {
  goals: ['retirement', 'home purchase', 'education', 'emergency fund', 'wealth building', 'travel', 'other'],
  esg_exclusions: ['fossil fuels', 'weapons', 'tobacco', 'gambling', 'alcohol', 'private prisons', 'none'],
  sector_theme_tilts: ['clean energy', 'healthcare', 'technology', 'real estate', 'international', 'small cap', 'dividends', 'bonds', 'none'],
}

const FINANCIAL_FIELDS = [
  { key: 'household_income', label: 'Household income', type: 'money' },
  { key: 'monthly_expenses', label: 'Monthly expenses', type: 'money' },
  { key: 'capital_on_hand', label: 'Liquid savings (investable)', type: 'money' },
  { key: 'emergency_fund', label: 'Emergency fund (set aside)', type: 'money' },
  { key: 'age', label: 'Age', type: 'number' },
]

const PREFERENCE_FIELDS = [
  { key: 'goals', label: 'Goals', type: 'tags', options: TAG_OPTIONS.goals },
  { key: 'goal_target', label: 'Goal target', type: 'money' },
  {
    key: 'universe_pref',
    label: 'Universe preference',
    type: 'pills',
    options: ['broad_market', 'esg', 'income', 'growth', 'custom'],
  },
  { key: 'esg_exclusions', label: 'ESG exclusions', type: 'tags', options: TAG_OPTIONS.esg_exclusions },
  { key: 'sector_theme_tilts', label: 'Sector/theme tilts', type: 'tags', options: TAG_OPTIONS.sector_theme_tilts },
]

const OPTIONAL_RISK_FIELDS = [
  { key: 'risk_tolerance', label: 'Risk tolerance', type: 'select', options: ['conservative', 'balanced', 'growth', 'aggressive'] },
  { key: 'loss_tolerance', label: 'Loss tolerance', type: 'select', options: ['low', 'medium', 'high'] },
  { key: 'risk_capacity', label: 'Risk capacity', type: 'select', options: ['low', 'medium', 'high'] },
  { key: 'income_stability', label: 'Income stability', type: 'select', options: ['low', 'medium', 'high', 'stable', 'variable'] },
  { key: 'target_volatility_pct', label: 'Target volatility %', type: 'number' },
]

function getProfile(onboardResult) {
  return onboardResult?.validated_profile ?? onboardResult?.profile ?? {}
}

function getUserEmail(onboardResult, userEmail) {
  return userEmail
    ?? onboardResult?.validated_profile?.email
    ?? onboardResult?.profile?.email
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
  return [...FINANCIAL_FIELDS, ...PREFERENCE_FIELDS, ...OPTIONAL_RISK_FIELDS].reduce((acc, field) => {
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
  return value == null ? '' : String(value)
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function buildPatch(profile, formState, fields) {
  return fields.reduce((patch, field) => {
    const nextValue = parseField(field.key, formState[field.key])
    const currentValue = normalizedOriginalValue(field.key, profile[field.key])
    if (!sameValue(nextValue, currentValue)) patch[field.key] = nextValue
    return patch
  }, {})
}

function mergeProfileResult(onboardResult, patch) {
  const profile = getProfile(onboardResult)
  const nextProfile = { ...profile, ...patch }
  return {
    ...(onboardResult ?? {}),
    profile: {
      ...(onboardResult?.profile ?? profile),
      ...patch,
    },
    validated_profile: {
      ...(onboardResult?.validated_profile ?? profile),
      ...patch,
    },
    optimizer_input: {
      ...(onboardResult?.optimizer_input ?? {}),
      ...(patch.capital_on_hand != null ? { capital_on_hand: patch.capital_on_hand } : {}),
      ...(patch.monthly_surplus != null ? { monthly_surplus: patch.monthly_surplus } : {}),
    },
    _local_profile_patch: nextProfile,
  }
}

function MultiSelectDropdown({ id, labelId, field, value, options, onChange, style }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const selectedValues = parseField(field.key, value)
  const selectedSet = new Set(selectedValues)
  const listboxId = `${id}-listbox`

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
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
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
          id={listboxId}
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
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setIsOpen(false)
                    buttonRef.current?.focus()
                    return
                  }
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
  const labelId = `${inputId}-label`
  const fieldOptions = field.options ?? []
  const selectedValues = field.type === 'multi-select' || field.type === 'tags' ? parseField(field.key, value) : []
  const options = field.type === 'multi-select' || field.type === 'tags'
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
      <span id={labelId} className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {field.label}
      </span>
      {field.type === 'select' ? (
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
                aria-pressed={isSelected}
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
          labelId={labelId}
          field={field}
          value={value}
          options={options}
          onChange={onChange}
          style={commonStyle}
        />
      ) : (
        <input
          id={inputId}
          type={field.type === 'money' || field.type === 'number' ? 'number' : 'text'}
          inputMode={field.type === 'money' ? 'decimal' : undefined}
          min={field.type === 'money' || field.type === 'number' ? '0' : undefined}
          step={field.type === 'money' || field.type === 'number' ? '1' : undefined}
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

export default function ProfileView({ onboardResult, userEmail, onUpdated, embedded = false }) {
  const profile = useMemo(() => getProfile(onboardResult), [onboardResult])
  const resolvedUserEmail = getUserEmail(onboardResult, userEmail)
  const riskFields = useMemo(() => (
    OPTIONAL_RISK_FIELDS.filter(field => profile[field.key] != null && profile[field.key] !== '')
  ), [profile])
  const editableFields = useMemo(() => (
    [...FINANCIAL_FIELDS, ...PREFERENCE_FIELDS, ...riskFields]
  ), [riskFields])
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
      const updated = resolvedUserEmail
        ? await postUpdateProfile({ user_email: resolvedUserEmail, profile_patch: profilePatch })
        : mergeProfileResult(onboardResult, profilePatch)
      onUpdated?.(updated)
      setSaveState(resolvedUserEmail ? 'success' : 'local')
      setMessage(resolvedUserEmail ? 'Saved and reweighted.' : 'Saved locally for this session.')
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

        {riskFields.length > 0 && (
          <FieldSection
            icon={SlidersHorizontal}
            title="Risk Preferences"
            fields={riskFields}
            formState={formState}
            onChange={handleChange}
          />
        )}

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
