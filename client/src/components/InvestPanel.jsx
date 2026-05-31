import { useCallback, useEffect, useMemo, useState } from 'react'
import { Wallet, Landmark, TrendingUp, CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react'
import {
  getFundingAccount,
  postBrokerageAccount,
  postBrokerageJournal,
  postExecutionPreview,
  postExecutionSubmit,
  getPositions,
} from '../api/greenlightClient'
import { formatCurrency, numberOrNull } from '../lib/utils'

const SANDBOX_FUNDING_CAP = 1000

// US equity market regular session is 09:30–16:00 ET, Mon–Fri. Notional market
// orders only fill during the session, so outside it we tell the user their
// order is queued for the next open rather than implying an instant fill.
function marketIsOpen(now = new Date()) {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  if (day === 0 || day === 6) return false
  const minutes = et.getHours() * 60 + et.getMinutes()
  return minutes >= 570 && minutes < 960
}

function StatusNote({ tone = 'muted', icon: Icon, children }) {
  const color = tone === 'error' ? 'var(--ruby)' : tone === 'ok' ? 'var(--emerald)' : 'var(--text-muted)'
  return (
    <div className="flex items-start gap-2 text-xs mt-3" style={{ color }}>
      {Icon && <Icon size={14} className="shrink-0 mt-0.5" />}
      <span className="leading-relaxed">{children}</span>
    </div>
  )
}

function PrimaryButton({ onClick, disabled, busy, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: 'var(--gold)', color: 'var(--bg-base)' }}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
    </button>
  )
}

export default function InvestPanel({ userEmail, portfolio }) {
  const weights = portfolio?.weights ?? null

  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null) // 'open' | 'fund' | 'preview' | 'invest'
  const [error, setError] = useState(null)
  const [amount, setAmount] = useState(SANDBOX_FUNDING_CAP)
  const [plan, setPlan] = useState(null)
  const [positions, setPositions] = useState(null)
  const [queued, setQueued] = useState(false)

  const cash = numberOrNull(account?.cash_available) ?? 0
  const hasAccount = Boolean(account?.alpaca_account_id)
  const invested = useMemo(
    () => (positions?.items ?? []).reduce((sum, item) => sum + (numberOrNull(item.market_value) ?? 0), 0),
    [positions],
  )
  const open = marketIsOpen()

  const refreshAccount = useCallback(async () => {
    if (!userEmail) return null
    const acct = await getFundingAccount(userEmail)
    setAccount(acct)
    return acct
  }, [userEmail])

  const refreshPositions = useCallback(async () => {
    if (!userEmail) return
    try {
      const pos = await getPositions(userEmail)
      setPositions(pos)
    } catch {
      // Positions read fails before any account/holdings exist — non-fatal.
    }
  }, [userEmail])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!userEmail) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const acct = await refreshAccount()
        if (!cancelled && acct?.alpaca_account_id) await refreshPositions()
      } catch (e) {
        if (!cancelled) setError(e?.message ?? 'Could not load account.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userEmail, refreshAccount, refreshPositions])

  async function run(kind, fn) {
    setBusy(kind)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e?.message ?? 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const handleOpen = () => run('open', async () => {
    await postBrokerageAccount({ user_email: userEmail })
    await refreshAccount()
  })

  const handleFund = () => run('fund', async () => {
    const amt = Math.min(SANDBOX_FUNDING_CAP, Math.max(1, Number(amount) || 0))
    const res = await postBrokerageJournal({ user_email: userEmail, amount: amt })
    setAccount((prev) => ({ ...(prev ?? {}), cash_available: res.cash_available }))
  })

  const handlePreview = () => run('preview', async () => {
    const p = await postExecutionPreview({ user_email: userEmail, weights })
    setPlan(p)
  })

  const handleInvest = () => run('invest', async () => {
    const res = await postExecutionSubmit({ user_email: userEmail, weights })
    setPositions(res.positions)
    setPlan(null)
    const filledValue = (res.positions?.items ?? []).reduce((s, i) => s + (numberOrNull(i.market_value) ?? 0), 0)
    setQueued(filledValue <= 0) // orders accepted but not yet filled (market closed)
    await refreshAccount()
  })

  if (!weights) {
    return (
      <div className="card-premium p-5 anim-fade-up d375">
        <PanelHeader />
        <StatusNote icon={AlertCircle}>
          Build a portfolio first — the invest flow deploys cash into your computed allocation.
        </StatusNote>
      </div>
    )
  }

  return (
    <div data-tour="invest" className="card-premium p-5 anim-fade-up d375">
      <PanelHeader cash={cash} hasAccount={hasAccount} invested={invested} />

      {loading ? (
        <StatusNote icon={Loader2}>Loading your brokerage account…</StatusNote>
      ) : !userEmail ? (
        <StatusNote icon={AlertCircle}>Sign in to open a brokerage account.</StatusNote>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Step 1 — open account */}
          {!hasAccount && (
            <div>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                Open an Alpaca <span style={{ color: 'var(--gold-light)' }}>sandbox</span> brokerage account
                to invest in your allocation. No real money — paper trading only.
              </p>
              <PrimaryButton onClick={handleOpen} busy={busy === 'open'}>
                <Landmark size={15} /> Open sandbox account
              </PrimaryButton>
            </div>
          )}

          {/* Step 2 — fund */}
          {hasAccount && cash <= 0 && (
            <div>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                Add funds to invest. Instantly journaled from the firm sweep account
                (sandbox cap {formatCurrency(SANDBOX_FUNDING_CAP)}).
              </p>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center flex-1 rounded-lg px-3"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>$</span>
                  <input
                    type="number" min={1} max={SANDBOX_FUNDING_CAP} value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-transparent py-2.5 px-2 text-sm font-mono outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
              <PrimaryButton onClick={handleFund} busy={busy === 'fund'}>
                <Wallet size={15} /> Add {formatCurrency(Math.min(SANDBOX_FUNDING_CAP, Math.max(1, Number(amount) || 0)))}
              </PrimaryButton>
            </div>
          )}

          {/* Step 3 — invest */}
          {hasAccount && cash > 0 && !plan && (
            <div>
              <div className="flex items-center justify-between rounded-lg p-3 mb-3"
                style={{ background: 'var(--bg-elevated)' }}>
                <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Cash available
                </span>
                <span className="font-mono font-semibold" style={{ color: 'var(--emerald)' }}>
                  {formatCurrency(cash, true)}
                </span>
              </div>
              <PrimaryButton onClick={handlePreview} busy={busy === 'preview'}>
                <TrendingUp size={15} /> Invest into this allocation
              </PrimaryButton>
            </div>
          )}

          {/* Step 3b — order preview / confirm */}
          {plan && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                Order preview · {plan.method === 'dca' ? 'Dollar-cost averaged' : 'Lump sum'}
              </div>
              <div className="rounded-lg divide-y" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                {plan.buys.map((buy) => (
                  <div key={buy.ticker} className="flex items-center justify-between px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                    <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{buy.ticker}</span>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {formatCurrency(buy.dollars)} · {Number(buy.shares).toFixed(3)} sh
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => setPlan(null)} disabled={busy === 'invest'}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
                <div className="flex-1">
                  <PrimaryButton onClick={handleInvest} busy={busy === 'invest'}>
                    <CheckCircle2 size={15} /> Confirm & buy
                  </PrimaryButton>
                </div>
              </div>
              {!open && (
                <StatusNote icon={Clock}>
                  Market is closed — orders will be accepted now and fill at the next open.
                </StatusNote>
              )}
            </div>
          )}

          {/* Positions */}
          {positions?.items?.length > 0 && !plan && (
            <div className="pt-1">
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                Holdings
              </div>
              <div className="rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                {positions.items.map((item) => (
                  <div key={item.ticker} className="flex items-center justify-between px-3 py-2 text-sm"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{item.ticker}</span>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {Number(item.shares).toFixed(3)} sh · {formatCurrency(numberOrNull(item.market_value) ?? 0)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Invested</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--emerald)' }}>
                    {formatCurrency(invested, true)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {queued && (
            <StatusNote tone="ok" icon={Clock}>
              Order submitted. Shares fill at the next market open — your holdings will appear then.
            </StatusNote>
          )}

          {error && <StatusNote tone="error" icon={AlertCircle}>{error}</StatusNote>}
        </div>
      )}
    </div>
  )
}

function PanelHeader({ cash, hasAccount, invested } = {}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
          Invest
        </div>
        <div className="font-display font-semibold text-lg" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Put your allocation to work
        </div>
      </div>
      {hasAccount && (
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {invested > 0 ? 'Invested' : 'Cash'}
          </div>
          <div className="font-mono font-semibold" style={{ color: 'var(--emerald)' }}>
            {formatCurrency(invested > 0 ? invested : (cash ?? 0), true)}
          </div>
        </div>
      )}
    </div>
  )
}
