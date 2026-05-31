import { useEffect, useState } from 'react'
import { Bell, Check, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import GreenlightFlow from './components/greenlight/GreenlightFlow'
import AuthScreen from './components/AuthScreen'
import OnboardingChat from './components/OnboardingChat'
import AdvisorChat from './components/AdvisorChat'

const PAGES_WITH_CONTENT = ['dashboard', 'greenlight', 'advisor']
const PREFERENCES_KEY = 'mallard-preferences'

const DEFAULT_PREFERENCES = {
  displayName: '',
  theme: 'dark',
  notifications: {
    portfolio: true,
    cashFlow: true,
    deadlines: true,
  },
}

const SAMPLE_ALERTS = [
  { id: 'portfolio-drift', title: 'Your portfolio drifted 5% from target', time: 'Today' },
  { id: 'emergency-fund', title: 'Emergency fund below 3-month threshold', time: 'Yesterday' },
  { id: 'dining-spend', title: 'Unusual spending detected in Dining category', time: '2 days ago' },
  { id: 'tax-deadline', title: 'Tax deadline in 30 days', time: 'Upcoming' },
]

function loadPreferences() {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES

  try {
    const stored = window.localStorage.getItem(PREFERENCES_KEY)
    if (!stored) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(stored)

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      notifications: {
        ...DEFAULT_PREFERENCES.notifications,
        ...(parsed.notifications || {}),
      },
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function SettingsPanel({ user, preferences, onChange, onClose }) {
  const updateNotification = (key) => (event) => {
    onChange({
      ...preferences,
      notifications: {
        ...preferences.notifications,
        [key]: event.target.checked,
      },
    })
  }

  return (
    <div className="app-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-panel anim-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Preferences</div>
            <h2 id="settings-title" className="panel-title">Settings</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close settings" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <label className="field-stack">
          <span>Display Name</span>
          <input
            value={preferences.displayName}
            onChange={(event) => onChange({ ...preferences, displayName: event.target.value })}
            placeholder={user?.name || 'Your name'}
          />
        </label>

        <div className="preference-row">
          <div>
            <div className="preference-title">Theme</div>
            <div className="preference-copy">Switch between Mallard dark and light modes.</div>
          </div>
          <button
            className="toggle-button"
            type="button"
            aria-pressed={preferences.theme === 'light'}
            onClick={() => onChange({ ...preferences, theme: preferences.theme === 'light' ? 'dark' : 'light' })}
          >
            {preferences.theme === 'light' ? 'Light' : 'Dark'}
          </button>
        </div>

        <div className="notification-group">
          <div className="panel-kicker">Notifications</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.notifications.portfolio}
              onChange={updateNotification('portfolio')}
            />
            <span>Portfolio drift and rebalance alerts</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.notifications.cashFlow}
              onChange={updateNotification('cashFlow')}
            />
            <span>Cash flow and spending changes</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.notifications.deadlines}
              onChange={updateNotification('deadlines')}
            />
            <span>Tax and planning deadlines</span>
          </label>
        </div>
      </section>
    </div>
  )
}

function AlertsPanel({ alerts, onDismiss, onClose }) {
  return (
    <div className="alerts-popover anim-scale-in" role="dialog" aria-modal="false" aria-labelledby="alerts-title">
      <div className="panel-header">
        <div>
          <div className="panel-kicker">Notifications</div>
          <h2 id="alerts-title" className="panel-title">Alerts</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close alerts" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="alerts-list">
        {alerts.length > 0 ? alerts.map((alert) => (
          <div key={alert.id} className="alert-item">
            <div className="alert-icon">
              <Bell size={14} />
            </div>
            <div className="alert-copy">
              <div className="alert-title">{alert.title}</div>
              <div className="alert-time">{alert.time}</div>
            </div>
            <button
              className="dismiss-button"
              type="button"
              aria-label={`Dismiss ${alert.title}`}
              onClick={() => onDismiss(alert.id)}
            >
              <Check size={14} />
            </button>
          </div>
        )) : (
          <div className="empty-alerts">No active alerts</div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [onboardResult, setOnboardResult] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [openPanel, setOpenPanel] = useState(null)
  const [preferences, setPreferences] = useState(loadPreferences)
  const [alerts, setAlerts] = useState(SAMPLE_ALERTS)

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
    } catch {
      // Preferences remain in memory if localStorage is unavailable.
    }
  }, [preferences])

  const handleNavigate = (page) => {
    if (page === 'settings' || page === 'alerts') {
      setOpenPanel((current) => current === page ? null : page)
      return
    }

    setOpenPanel(null)
    setActivePage(page)
  }

  const userWithPreferences = {
    ...user,
    name: preferences.displayName || user?.name,
  }

  // Stage 1: not logged in
  if (!user) {
    return (
      <AuthScreen
        onAuth={(u) => {
          setUser(u)
          // Existing users skip onboarding
          if (!u.isNewUser) setOnboardingDone(true)
        }}
      />
    )
  }

  // Stage 2: new user goes through Mallard AI onboarding
  if (!onboardingDone) {
    return (
      <OnboardingChat
        user={user}
        onComplete={(result) => {
          setOnboardResult(result)
          setOnboardingDone(true)
        }}
      />
    )
  }

  // Stage 3: full app
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)', position: 'relative' }}>
      <Sidebar active={openPanel || activePage} onNavigate={handleNavigate} user={userWithPreferences} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activePage === 'dashboard' && <Dashboard />}
        {activePage === 'greenlight' && <GreenlightFlow />}
        {activePage === 'advisor' && <AdvisorChat context={onboardResult} />}
        {!PAGES_WITH_CONTENT.includes(activePage) && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 64, color: 'var(--text-muted)', lineHeight: 1 }}>
              {activePage}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Coming soon</div>
          </div>
        )}
      </main>
      {openPanel === 'settings' && (
        <SettingsPanel
          user={user}
          preferences={preferences}
          onChange={setPreferences}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'alerts' && (
        <AlertsPanel
          alerts={alerts}
          onDismiss={(id) => setAlerts((current) => current.filter((alert) => alert.id !== id))}
          onClose={() => setOpenPanel(null)}
        />
      )}
    </div>
  )
}
