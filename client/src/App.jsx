import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import GreenlightFlow from './components/greenlight/GreenlightFlow'
import AuthScreen from './components/AuthScreen'
import OnboardingChat from './components/OnboardingChat'

const PAGES_WITH_CONTENT = ['dashboard', 'greenlight']

export default function App() {
  const [user, setUser] = useState(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [activePage, setActivePage] = useState('dashboard')

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
        onComplete={() => setOnboardingDone(true)}
      />
    )
  }

  // Stage 3: full app
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar active={activePage} onNavigate={setActivePage} user={user} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activePage === 'dashboard' && <Dashboard />}
        {activePage === 'greenlight' && <GreenlightFlow />}
        {!PAGES_WITH_CONTENT.includes(activePage) && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 64, color: 'var(--text-muted)', lineHeight: 1 }}>
              {activePage}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Coming soon</div>
          </div>
        )}
      </main>
    </div>
  )
}
