import { AlertTriangle, CheckCircle, Route } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

function statusLabel(status) {
  if (!status) return 'No gate status returned'
  return status === 'greenlight' ? 'Greenlight' : status.replace(/_/g, ' ')
}

export default function AlertsView({ onboardResult }) {
  const gate = onboardResult?.gate_result ?? {}
  const steps = onboardResult?.financial_analysis?.path_to_greenlight?.steps ?? []
  const status = gate.status
  const checks = gate.checks ? Object.entries(gate.checks) : []

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
          {status === 'greenlight'
            ? <CheckCircle size={24} style={{ color: 'var(--emerald)' }} />
            : <AlertTriangle size={24} style={{ color: 'var(--ruby)' }} />}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Gate Status</div>
            <div className="font-display font-semibold text-2xl capitalize" style={{ color: 'var(--text-primary)' }}>
              {statusLabel(status)}
            </div>
          </div>
        </div>

        <section className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <Route size={14} style={{ color: 'var(--gold-light)' }} />
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Path To Greenlight
            </div>
          </div>
          {steps.length > 0 ? steps.map(item => (
            <div key={`${item.step}-${item.action}`} className="py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex justify-between gap-4">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.action}</div>
                {item.target_amount != null && (
                  <div className="font-mono text-sm" style={{ color: 'var(--gold-light)' }}>
                    {formatCurrency(Number(item.target_amount))}
                  </div>
                )}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
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

        <section className="card-premium p-5">
          <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
            Gate Checks
          </div>
          {checks.length > 0 ? checks.map(([key, check]) => (
            <div key={key} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-sm capitalize" style={{ color: 'var(--text-secondary)' }}>{key.replace(/_/g, ' ')}</span>
              <span style={{ color: check?.passed ? 'var(--emerald)' : 'var(--ruby)' }}>
                {check?.passed ? 'Passed' : 'Needs attention'}
              </span>
            </div>
          )) : (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No gate checks were returned.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
