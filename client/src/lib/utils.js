import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function formatCurrency(value, compact = false) {
  const number = numberOrNull(value)
  if (number === null) {
    return 'N/A'
  }

  if (compact) {
    if (Math.abs(number) >= 1_000_000) {
      return `$${(number / 1_000_000).toFixed(2)}M`
    }
    if (Math.abs(number) >= 1_000) {
      return `$${(number / 1_000).toFixed(0)}K`
    }
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(number)
}

export function formatPercent(value, signed = false) {
  const number = numberOrNull(value)
  if (number === null) {
    return 'N/A'
  }

  const sign = signed && number > 0 ? '+' : ''
  return `${sign}${number.toFixed(1)}%`
}

export function formatMoneyOrNull(value, options = {}) {
  const { compact = false, fallback = 'N/A' } = options
  const number = numberOrNull(value)

  if (number === null) {
    return fallback
  }

  return formatCurrency(number, compact)
}
