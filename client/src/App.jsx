import { useState, useEffect } from 'react'
import { MessageCircle, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import GreenlightFlow from './components/greenlight/GreenlightFlow'
import AuthScreen from './components/AuthScreen'
import OnboardingChat from './components/OnboardingChat'
import AdvisorChat from './components/AdvisorChat'
import AccountsTab from './components/AccountsTab'
import PortfolioView from './components/greenlight/PortfolioView'
import RiskView from './components/RiskView'
import AlertsView from './components/AlertsView'
import SettingsView from './components/SettingsView'
import LearnView from './components/learn/LearnView'
import { TourProvider } from './components/tour/TourProvider'
import { DUMMY_USER, DUMMY_ONBOARD_RESULT } from './data/dummyProfile'
import { getProfile } from './api/greenlightClient'

const PAGES_WITH_CONTENT = ['dashboard', 'greenlight', 'learn', 'accounts', 'portfolio', 'risk', 'alerts', 'settings']
const AUTH_LOCAL_STORAGE_KEYS = []

export default function App() {
  const [user, setUser] = useState(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [onboardResult, setOnboardResult] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [askMallardOpen, setAskMallardOpen] = useState(false)
  const [askMallardMounted, setAskMallardMounted] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    if (askMallardOpen) {
      setAskMallardMounted(true)
      return undefined
    }

    const timeout = window.setTimeout(() => {
      setAskMallardMounted(false)
    }, 260)

    return () => window.clearTimeout(timeout)
  }, [askMallardOpen])

  // When user logs in, try to fetch their existing profile
  useEffect(() => {
    if (user && !onboardResult) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingProfile(true)
      getProfile(user.email).then(profile => {
        if (profile && profile.status !== 'no_profile') {
          setOnboardResult(profile)
          setOnboardingDone(true)
        }
      }).finally(() => {
        setLoadingProfile(false)
      })
    }
  }, [user, onboardResult])

  function handleLogout() {
    AUTH_LOCAL_STORAGE_KEYS.forEach(key => window.localStorage.removeItem(key))
    setAskMallardOpen(false)
    setUser(null)
    setOnboardResult(null)
    setOnboardingDone(false)
    setActivePage('dashboard')
  }

  // Stage 1: not logged in
  if (!user) {
    return (
      <AuthScreen
        onAuth={(u) => {
          setUser(u)
        }}
        onDevSkip={() => {
          // Developer shortcut: bypass login + onboarding, land in the app with demo data
          setOnboardResult(DUMMY_ONBOARD_RESULT)
          setOnboardingDone(true)
          setUser(DUMMY_USER)
        }}
      />
    )
  }

  // Loading state while checking for profile
  if (loadingProfile) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>Mallard</div>
          <div style={{ fontSize: 13 }}>Retrieving your financial profile...</div>
        </div>
      </div>
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
    <TourProvider onNavigate={setActivePage}>
      <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}>
        <Sidebar
          active={activePage}
          onNavigate={setActivePage}
          user={user}
          onboardResult={onboardResult}
        />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activePage === 'dashboard' && <Dashboard onboardResult={onboardResult} />}
          {activePage === 'greenlight' && <GreenlightFlow onboardResult={onboardResult} />}
          {activePage === 'learn' && <LearnView onboardResult={onboardResult} onAskMallard={() => setAskMallardOpen(true)} />}
          {activePage === 'accounts' && <AccountsTab onboardResult={onboardResult} />}
          {activePage === 'portfolio' && <PortfolioView onboardResult={onboardResult} onApplied={setOnboardResult} />}
          {activePage === 'risk' && <RiskView onboardResult={onboardResult} />}
          {activePage === 'alerts' && <AlertsView onboardResult={onboardResult} />}
          {activePage === 'settings' && <SettingsView onboardResult={onboardResult} user={user} onLogout={handleLogout} />}

          {!PAGES_WITH_CONTENT.includes(activePage) && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 64, color: 'var(--text-muted)', lineHeight: 1 }}>
                {activePage}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Coming soon</div>
            </div>
          )}
        </main>

        {!askMallardOpen && (
          <button
            type="button"
            aria-label="Open Ask Mallard"
            onClick={() => setAskMallardOpen(true)}
            style={{
              position: 'fixed',
              right: 24,
              bottom: 24,
              zIndex: 1000,
              width: 56,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: 0,
              background: '#C9A84C',
              color: '#fff',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.28)',
              cursor: 'pointer',
              transition: 'filter 160ms ease, transform 160ms ease',
            }}
            onMouseEnter={event => {
              event.currentTarget.style.filter = 'brightness(0.9)'
              event.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={event => {
              event.currentTarget.style.filter = 'none'
              event.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <MessageCircle size={25} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}

        <div
          aria-hidden={!askMallardOpen}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            pointerEvents: askMallardOpen ? 'auto' : 'none',
          }}
        >
          <button
            type="button"
            aria-label="Close Ask Mallard"
            onClick={() => setAskMallardOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 0,
              padding: 0,
              background: 'rgba(7, 9, 16, 0.56)',
              opacity: askMallardOpen ? 1 : 0,
              transition: 'opacity 240ms ease',
              cursor: 'default',
            }}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Ask Mallard"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 'min(420px, 100vw)',
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-gold)',
              boxShadow: '-24px 0 60px rgba(0, 0, 0, 0.35)',
              transform: askMallardOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 260ms ease',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base))',
                flexShrink: 0,
              }}
            >
              <div>
                <div
                  className="font-display"
                  style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 600, lineHeight: 1 }}
                >
                  Ask Mallard
                </div>
                <div style={{ color: 'var(--gold-light)', fontSize: 11, letterSpacing: '0.10em', marginTop: 5 }}>
                  FINANCIAL ADVISOR
                </div>
              </div>
              <button
                type="button"
                aria-label="Close Ask Mallard"
                onClick={() => setAskMallardOpen(false)}
                style={{
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  border: '1px solid var(--border-bright)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--gold-light)',
                  cursor: 'pointer',
                }}
              >
                <X size={17} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {askMallardMounted && (
                <AdvisorChat context={onboardResult} user={user} />
              )}
            </div>
          </aside>
        </div>
      </div>
    </TourProvider>
  )
}
