import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function numberOrNull(value) {
  if (value == null || value === '') return null
  if (typeof value === 'boolean' || typeof value === 'object') return null
  const cleaned = typeof value === 'string'
    ? value.replace(/[$,%\s,]/g, '')
    : value
  if (cleaned === '') return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

export function formatCurrency(value, compact = false) {
  const amount = numberOrNull(value)
  if (amount == null) return '—'

  if (compact) {
    const sign = amount < 0 ? '-' : ''
    const absolute = Math.abs(amount)
    if (absolute >= 1_000_000) {
      return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`
    }
    if (absolute >= 1_000) {
      return `${sign}$${(absolute / 1_000).toFixed(0)}K`
    }
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

// Expects a whole-number percent: 12.3 renders as "12.3%".
export function formatPercent(value, signed = false) {
  const percent = numberOrNull(value)
  if (percent == null) return '—'

  const sign = signed && percent > 0 ? '+' : ''
  return `${sign}${percent.toFixed(1)}%`
}
