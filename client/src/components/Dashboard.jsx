import { useState } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, Target,
  Calendar, ArrowUpRight, ArrowDownRight, Info,
  Home, Car, Briefcase, PiggyBank, CreditCard, Building,
} from 'lucide-react'
import { formatCurrency, formatPercent } from '../lib/utils'
import RetirementScore from './RetirementScore'
import ProjectionChart from './ProjectionChart'

function MetricCard({ label, value, suffix, delta, deltaLabel, icon: Icon, color, className = '', style = {}, delay = '' }) {
  const isPos = delta >= 0
  const displayValue = typeof value === 'number'
    ? (suffix ? value.toFixed(1) : formatCurrency(value))
    : value
  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-3 transition-all cursor-default card-glow anim-fade-up ${delay} ${className}`}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        ...style,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
        {Icon && (
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 32, height: 32,
              background: `${color || 'var(--gold)'}18`,
              color: color || 'var(--gold-light)',
            }}
          >
            <Icon size={15} />
          </div>
        )}
      </div>
      <div>
        <span
          className="font-display font-semibold"
          style={{ fontSize: 32, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
        >
          {displayValue}{suffix && <span className="font-display text-2xl" style={{ color: 'var(--text-secondary)' }}>{suffix}</span>}
        </span>
      </div>
      {delta !== undefined && (
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {isPos
            ? <ArrowUpRight size={13} style={{ color: 'var(--emerald)' }} />
            : <ArrowDownRight size={13} style={{ color: 'var(--ruby)' }} />
          }
          <span style={{ color: isPos ? 'var(--emerald)' : 'var(--ruby)' }}>
            {formatPercent(Math.abs(delta), true)}
          </span>
          {deltaLabel && (
            <span style={{ color: 'var(--text-muted)' }}>{deltaLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}

function AssetRow({ label, value, percent, icon: Icon, color }) {
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ width: 32, height: 32, background: `${color}18`, color, flexShrink: 0 }}
      >
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        <div className="mt-1.5 h-1 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${percent}%`, background: color }}
          />
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
          {formatCurrency(value, true)}
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {percent.toFixed(0)}%
        </div>
      </div>
    </div>
  )
}

function MilestoneItem({ label, date, amount, done }) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: done ? 'var(--emerald)' : 'var(--bg-elevated)',
          border: done ? 'none' : '1.5px solid var(--border-bright)',
        }}
      >
        {done && (
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <path d="M1 3l2 2 4-4" stroke="#070910" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{date}</div>
      </div>
      {amount && (
        <div className="text-sm font-mono font-medium shrink-0" style={{ color: 'var(--gold-light)' }}>
          {formatCurrency(amount, true)}
        </div>
      )}
    </div>
  )
}

const CHART_SCENARIOS = ['base', 'optimistic', 'conservative']

export default function Dashboard() {
  const [scenario, setScenario] = useState('base')

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 py-5 anim-fade-up"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}
      >
        <div>
          <h1 className="font-display font-semibold text-2xl" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Retirement Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Last updated: May 30, 2026 · All values in USD
          </p>
        </div>
        <div className="flex items-center gap-2">
          {CHART_SCENARIOS.map((s) => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
              style={{
                background: scenario === s ? 'var(--bg-elevated)' : 'transparent',
                color: scenario === s ? 'var(--gold-light)' : 'var(--text-muted)',
                border: scenario === s ? '1px solid var(--border-bright)' : '1px solid transparent',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-7 space-y-6">
        {/* Top metric cards row */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
          {/* Net Worth — wide */}
          <div
            className="rounded-2xl p-5 anim-fade-up d100 transition-all cursor-default"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute', top: 0, right: 0, width: 200, height: 200,
                background: 'radial-gradient(circle at 100% 0%, rgba(196,154,44,0.07) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Total Net Worth
                </div>
                <div
                  className="font-display font-semibold"
                  style={{ fontSize: 48, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}
                >
                  $1.24<span className="text-3xl" style={{ color: 'var(--text-secondary)' }}>M</span>
                </div>
              </div>
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ width: 40, height: 40, background: 'rgba(196,154,44,0.12)', color: 'var(--gold-light)' }}
              >
                <DollarSign size={18} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <ArrowUpRight size={13} style={{ color: 'var(--emerald)' }} />
                <span style={{ color: 'var(--emerald)' }}>+12.4%</span>
                <span style={{ color: 'var(--text-muted)' }}>YTD</span>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                +$136,800 since Jan
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Assets</div>
                <div className="font-mono font-medium" style={{ color: 'var(--emerald)', fontSize: 16 }}>$1,528,000</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Liabilities</div>
                <div className="font-mono font-medium" style={{ color: 'var(--ruby)', fontSize: 16 }}>$284,000</div>
              </div>
            </div>
          </div>

          {/* Score */}
          <div
            className="rounded-2xl p-4 anim-fade-up d150 transition-all cursor-default"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
              Retirement Score
            </div>
            <RetirementScore score={78} />
          </div>

          {/* Monthly Cash Flow */}
          <MetricCard
            label="Monthly Cash Flow"
            value={4820}
            delta={8.3}
            deltaLabel="vs last mo."
            icon={TrendingUp}
            color="var(--emerald)"
            delay="d200"
          />

          {/* Savings Rate */}
          <MetricCard
            label="Savings Rate"
            value={24.3}
            suffix="%"
            delta={2.1}
            deltaLabel="vs goal"
            icon={Target}
            color="var(--blue)"
            delay="d250"
          />
        </div>


        {/* Chart + Assets row */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Projection Chart */}
          <div
            className="rounded-2xl p-5 anim-fade-up d300"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Portfolio Projection
                </div>
                <div className="font-display font-semibold text-lg" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Retirement Wealth Forecast
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#1eb87a' }} />
                  Optimistic
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#ddb84a' }} />
                  Base
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#4a72e8' }} />
                  Conservative
                </div>
              </div>
            </div>
            <ProjectionChart />
          </div>

          {/* Asset Breakdown */}
          <div
            className="rounded-2xl p-5 anim-fade-up d350"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Asset Breakdown
            </div>
            <AssetRow label="401(k) / IRA"    value={680000} percent={44.5} icon={Briefcase} color="#ddb84a" />
            <AssetRow label="Primary Home"    value={480000} percent={31.4} icon={Home}      color="#4a72e8" />
            <AssetRow label="Brokerage"       value={240000} percent={15.7} icon={TrendingUp} color="#1eb87a" />
            <AssetRow label="Savings / Cash"  value={98000}  percent={6.4}  icon={PiggyBank}  color="#8b5cf6" />
            <AssetRow label="Vehicle"         value={30000}  percent={2.0}  icon={Car}        color="#6b7280" />
            <div className="mt-4 pt-3 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Total Assets</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>$1,528,000</span>
            </div>
          </div>
        </div>

        {/* Bottom row: Milestones + Liabilities + Monthly Breakdown */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {/* Milestones */}
          <div
            className="rounded-2xl p-5 anim-fade-up d400"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={13} style={{ color: 'var(--gold-light)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Milestones
              </div>
            </div>
            <MilestoneItem label="Max 401(k) contribution"   date="Completed Feb 2026"  amount={23000}  done />
            <MilestoneItem label="Emergency fund — 6 months" date="Completed Dec 2025"  amount={32000}  done />
            <MilestoneItem label="Pay off student loans"     date="Target Dec 2026"     amount={18400}  done={false} />
            <MilestoneItem label="Reach $1.5M net worth"     date="Projected Q3 2027"   amount={1500000} done={false} />
            <MilestoneItem label="Retire"                    date="Target Jan 2041"     amount={null}   done={false} />
          </div>

          {/* Liabilities */}
          <div
            className="rounded-2xl p-5 anim-fade-up d450"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={13} style={{ color: 'var(--ruby)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Liabilities
              </div>
            </div>
            {[
              { label: 'Mortgage', value: 238000, rate: 3.25, icon: Building, color: '#4a72e8' },
              { label: 'Auto Loan', value: 28000, rate: 5.10, icon: Car, color: '#8b5cf6' },
              { label: 'Student Loans', value: 18000, rate: 5.75, icon: Briefcase, color: '#e64545' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: 32, height: 32, background: `${item.color}18`, color: item.color }}
                >
                  <item.icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                  <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {item.rate}% APR
                  </div>
                </div>
                <div className="font-mono text-sm font-medium shrink-0" style={{ color: 'var(--ruby)' }}>
                  {formatCurrency(item.value, true)}
                </div>
              </div>
            ))}
            <div className="mt-4 pt-3 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Total Debt</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--ruby)' }}>$284,000</span>
            </div>
          </div>

          {/* Monthly Snapshot */}
          <div
            className="rounded-2xl p-5 anim-fade-up d500"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={13} style={{ color: 'var(--emerald)' }} />
              <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Monthly Snapshot
              </div>
            </div>
            {[
              { label: 'Gross Income',    value: 14200, positive: true },
              { label: 'Tax Withheld',    value: -3840, positive: false },
              { label: 'Housing',         value: -2100, positive: false },
              { label: 'Investments',     value: -2800, positive: false },
              { label: 'Food & Life',     value: -640,  positive: false },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                <span className="font-mono text-sm font-medium" style={{ color: row.positive ? 'var(--emerald)' : 'var(--text-primary)' }}>
                  {row.positive ? '+' : ''}{formatCurrency(row.value)}
                </span>
              </div>
            ))}
            <div className="mt-3 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Net Cash Flow</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--emerald)', fontSize: 16 }}>+$4,820</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
