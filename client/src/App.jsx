import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar active={activePage} onNavigate={setActivePage} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activePage === 'dashboard' && <Dashboard />}
        {activePage !== 'dashboard' && (
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
