import {
  LayoutDashboard, TrendingUp, PiggyBank, BarChart3,
  Settings, Bell, Shield, ChevronRight, Feather,
} from 'lucide-react'
import { cn } from '../lib/utils'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',    id: 'dashboard', active: true },
  { icon: TrendingUp,      label: 'Projections',  id: 'projections' },
  { icon: PiggyBank,       label: 'Accounts',     id: 'accounts' },
  { icon: BarChart3,       label: 'Portfolio',    id: 'portfolio' },
  { icon: Shield,          label: 'Risk',         id: 'risk' },
]

const bottomItems = [
  { icon: Bell,     label: 'Alerts',   id: 'alerts' },
  { icon: Settings, label: 'Settings', id: 'settings' },
]

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside
      className="flex flex-col h-full"
      style={{
        width: 220,
        minWidth: 220,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-6"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: 36,
            height: 36,
            background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
          }}
        >
          <Feather size={18} style={{ color: '#070910' }} />
        </div>
        <div>
          <div
            className="font-display font-semibold text-base leading-tight"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            Mallard
          </div>
          <div className="text-xs" style={{ color: 'var(--gold-light)', letterSpacing: '0.08em' }}>
            WEALTH
          </div>
        </div>
      </div>

      {/* User */}
      <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <div
            className="flex items-center justify-center rounded-full text-xs font-semibold font-mono"
            style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #1a3a6e, #2a4fa8)',
              color: '#a8c4f8',
              flexShrink: 0,
            }}
          >
            BT
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              Ben Tell
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              Premium Plan
            </div>
          </div>
          <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <div className="text-xs font-semibold px-3 pt-1 pb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.10em' }}>
          PLANNING
        </div>
        {navItems.map((item) => {
          const isActive = (active || 'dashboard') === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate?.(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative text-left',
                isActive ? 'nav-glow' : ''
              )}
              style={{
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
                color: isActive ? 'var(--gold-light)' : 'var(--text-secondary)',
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'
                if (!isActive) e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
                if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          )
        })}

        <div className="text-xs font-semibold px-3 pt-4 pb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.10em' }}>
          ACCOUNT
        </div>
        {bottomItems.map((item) => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate?.(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
              style={{
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
                color: isActive ? 'var(--gold-light)' : 'var(--text-secondary)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isActive ? 'var(--bg-elevated)' : 'transparent'
                e.currentTarget.style.color = isActive ? 'var(--gold-light)' : 'var(--text-secondary)'
              }}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Retirement date */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div
          className="rounded-xl p-3 text-center"
          style={{ background: 'rgba(196, 154, 44, 0.08)', border: '1px solid rgba(196, 154, 44, 0.2)' }}
        >
          <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Target Retirement</div>
          <div className="font-display font-semibold text-lg" style={{ color: 'var(--gold-light)', lineHeight: 1 }}>
            2041
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>15 years away</div>
        </div>
      </div>
    </aside>
  )
}
