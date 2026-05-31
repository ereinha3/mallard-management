import { useState, useEffect } from 'react'
import { MessageCircle, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import GreenlightFlow from './components/greenlight/GreenlightFlow'
import AuthScreen from './components/AuthScreen'
import OnboardingChat from './components/OnboardingChat'
import AdvisorChat from './components/AdvisorChat'
import AccountsTab from './components/AccountsTab'
import RiskView from './components/RiskView'
import AlertsView from './components/AlertsView'
import SettingsView from './components/SettingsView'
import ProfileView from './components/ProfileView'
import LearnView from './components/learn/LearnView'
import PageTransition from './components/visual/PageTransition'
import TopoBackground from './components/visual/TopoBackground'
import { TourProvider } from './components/tour/TourProvider'
import { DUMMY_USER, DUMMY_ONBOARD_RESULT } from './data/dummyProfile'
import { getProfile, getActiveOnboarding } from './api/greenlightClient'

const PAGES_WITH_CONTENT = ['dashboard', 'greenlight', 'learn', 'profile', 'accounts', 'risk', 'alerts', 'settings']
const AUTH_STORAGE_KEY = 'mallard.auth'

// Rehydrate the logged-in user from localStorage so a refresh mid-enrollment
// doesn't drop the session and bounce the user back to the login screen.
function readStoredUser() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function App() {
  const [user, setUser] = useState(readStoredUser)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [onboardResult, setOnboardResult] = useState(null)
  const [resumeSession, setResumeSession] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [askMallardOpen, setAskMallardOpen] = useState(false)
  const [askMallardMounted, setAskMallardMounted] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)
  // If a session was rehydrated from storage, skip the landing animation.
  const [topoPhase, setTopoPhase] = useState(() => (readStoredUser() ? 'idle' : 'enter'))

  // Keep localStorage in sync with the logged-in user (persist on login, clear on logout).
  useEffect(() => {
    try {
      if (user) window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
      else window.localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      // localStorage unavailable (private mode / SSR) — non-fatal.
    }
  }, [user])

  useEffect(() => {
    if (askMallardOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAskMallardMounted(true)
      return undefined
    }

    const timeout = window.setTimeout(() => {
      setAskMallardMounted(false)
    }, 260)

    return () => window.clearTimeout(timeout)
  }, [askMallardOpen])

  // When the user (re)appears, restore their state from the backend:
  //  1. a completed profile -> go straight to the dashboard, OR
  //  2. an interrupted onboarding -> resume the elicitation chat from the DB.
  useEffect(() => {
    if (user && !onboardResult) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingProfile(true)
      getProfile(user.email).then(profile => {
        if (profile && profile.status !== 'no_profile') {
          setOnboardResult(profile)
          setOnboardingDone(true)
          return null
        }
        // No finished profile — check for an in-progress onboarding to resume.
        return getActiveOnboarding(user.email).then(resume => {
          if (resume && resume.found && resume.session) {
            setResumeSession(resume.session)
          }
        })
      }).finally(() => {
        // Set last, so OnboardingChat only mounts once resumeSession is known.
        setLoadingProfile(false)
      })
    }
  }, [user, onboardResult])

  useEffect(() => {
    if (topoPhase !== 'exit') return undefined

    const timeout = window.setTimeout(() => {
      setTopoPhase('idle')
    }, 3500)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [topoPhase])

  function handleLogout() {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      // ignore
    }
    setAskMallardOpen(false)
    setUser(null)
    setOnboardResult(null)
    setOnboardingDone(false)
    setResumeSession(null)
    setActivePage('dashboard')
    setTopoPhase('enter')
  }

  const activeContent = (
    <>
      {activePage === 'dashboard' && <Dashboard onboardResult={onboardResult} />}
      {activePage === 'greenlight' && (
        <GreenlightFlow
          onboardResult={onboardResult}
          userEmail={user?.email}
          onResult={setOnboardResult}
        />
      )}
      {activePage === 'learn' && <LearnView onboardResult={onboardResult} onAskMallard={() => setAskMallardOpen(true)} />}
      {activePage === 'profile' && (
        <ProfileView
          onboardResult={onboardResult}
          userEmail={user?.email}
          onUpdated={setOnboardResult}
        />
      )}
      {activePage === 'accounts' && <AccountsTab onboardResult={onboardResult} />}
      {activePage === 'risk' && <RiskView onboardResult={onboardResult} />}
      {activePage === 'alerts' && <AlertsView onboardResult={onboardResult} />}
      {activePage === 'settings' && <SettingsView onboardResult={onboardResult} user={user} onLogout={handleLogout} />}

      {!PAGES_WITH_CONTENT.includes(activePage) && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: 'transparent' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 64, color: 'var(--text-muted)', lineHeight: 1 }}>
            {activePage}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Coming soon</div>
        </div>
      )}
    </>
  )

  function renderAskMallard() {
    return (
      <>
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
            pointerEvents: 'none',
          }}
        >
          <div
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
              pointerEvents: 'none',
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
              pointerEvents: 'auto',
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
      </>
    )
  }

  let screen

  // Stage 1: not logged in
  if (!user) {
    screen = (
      <AuthScreen
        onAuth={(u) => {
          setTopoPhase('exit')
          setUser(u)
        }}
        onDevSkip={() => {
          // Developer shortcut: bypass login + onboarding, land in the app with demo data
          setTopoPhase('exit')
          setOnboardResult(DUMMY_ONBOARD_RESULT)
          setOnboardingDone(true)
          setUser(DUMMY_USER)
        }}
      />
    )
  } else if (loadingProfile) {
    screen = (
      <div className="mallard-loading-screen" style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>Mallard</div>
          <div style={{ fontSize: 13 }}>Retrieving your financial profile...</div>
        </div>
      </div>
    )
  } else if (!onboardingDone) {
    screen = (
      <div className="mallard-onboarding-shell" style={{ height: '100vh', width: '100vw' }}>
        <OnboardingChat
          user={user}
          resumeSession={resumeSession}
          onComplete={(result) => {
            setResumeSession(null)
            setOnboardResult(result)
            setOnboardingDone(true)
          }}
        />
      </div>
    )
  } else {
    screen = (
      <TourProvider onNavigate={setActivePage}>
        <div className="mallard-app-frame" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'transparent' }}>
          <Sidebar
            active={activePage}
            onNavigate={setActivePage}
            user={user}
            onboardResult={onboardResult}
          />
          <main className="mallard-main-surface" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
            <PageTransition key={activePage} pageKey={activePage}>
              {activeContent}
            </PageTransition>
          </main>
          {renderAskMallard()}
        </div>
      </TourProvider>
    )
  }

  return (
    <>
      <TopoBackground phase={topoPhase} />
      {screen}
    </>
  )
}
