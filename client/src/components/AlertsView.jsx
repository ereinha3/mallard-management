import { AlertTriangle, CheckCircle, Route } from 'lucide-react'
import { formatMoneyOrNull } from '../lib/utils'

function statusLabel(status) {
  if (!status) return 'Gate status pending'
  return status === 'greenlight' ? 'Greenlight' : status.replace(/_/g, ' ')
}

export default function AlertsView({ onboardResult }) {
  const gate = onboardResult?.gate_result ?? {}
  const steps = onboardResult?.financial_analysis?.path_to_greenlight?.steps ?? []
  const status = gate.status
  const alertChecks = Array.isArray(gate.checks)
    ? gate.checks.filter(check => check?.status === 'fail' || check?.status === 'warn')
    : []
  const hasGateStatus = !!status

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <header className="px-8 py-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)' }}>Alerts</h1>
        <p className="text-xs text-muted mt-2 uppercase tracking-wide font-semibold">
          Gate and path-to-greenlight notifications
        </p>
      </header>

      <div className="p-8 space-y-6 max-w-5xl">
        <div className="card-premium p-5 flex items-center gap-4">
          {!hasGateStatus
            ? <Route size={24} style={{ color: 'var(--text-muted)' }} />
            : status === 'greenlight'
            ? <CheckCircle size={24} style={{ color: 'var(--emerald)' }} />
            : <AlertTriangle size={24} style={{ color: 'var(--ruby)' }} />}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Gate Status</div>
            <div className="font-display font-semibold text-2xl capitalize" style={{ color: 'var(--text-primary)' }}>
              {statusLabel(status)}
            </div>
            {!hasGateStatus && (
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Complete analysis has not returned a gate status yet.
              </div>
            )}
          </div>
        </div>

        <section className="card-premium p-5">
          <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
            Attention Required
          </div>
          {alertChecks.length > 0 ? alertChecks.map((check, index) => (
            <div key={check.key ?? `alert-${index}`} className="py-3" style={{ borderBottom: index === alertChecks.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <div className="flex justify-between gap-4">
                <div className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                  {String(check.key ?? 'gate check').replace(/_/g, ' ')}
                </div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: check.status === 'fail' ? 'var(--ruby)' : 'var(--gold-light)' }}>
                  {check.status}
                </div>
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {check.detail || 'No detail returned for this check.'}
              </div>
            </div>
          )) : (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No failed or warning gate checks were returned.
            </div>
          )}
        </section>

        <section className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <Route size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Path To Greenlight
            </div>
          </div>
          {steps.length > 0 ? steps.map((item, index) => (
            <div key={`${item.step ?? index}-${item.action ?? 'step'}`} className="py-3" style={{ borderBottom: index === steps.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <div className="flex justify-between gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--emerald)' }} />
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {item.action ?? `Step ${index + 1}`}
                  </div>
                </div>
                {item.target_amount != null && (
                  <div className="font-mono text-sm" style={{ color: 'var(--gold-light)' }}>
                    {formatMoneyOrNull(item.target_amount, { fallback: 'Target not returned' })}
                  </div>
                )}
              </div>
              <div className="text-xs mt-1 ml-7" style={{ color: 'var(--text-muted)' }}>
                {item.months_estimated != null ? `${item.months_estimated} months estimated` : 'No timeline returned'}
                {item.note ? ` · ${item.note}` : ''}
              </div>
            </div>
          )) : (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No path-to-greenlight steps were returned.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
