import { useState } from 'react'
import { NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import './App.css'
import NebulaBackdrop from './components/metis-core/NebulaBackdrop.jsx'
import ParentalToggle from './components/metis-core/ParentalToggle.jsx'
import Lander from './pages/Lander.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Shield from './pages/Shield.jsx'
import Agora from './pages/Agora.jsx'
import { pageVariants } from './lib/motion.js'

function Nav({ parental, setParental }) {
  return (
    <nav className="metis-nav">
      <NavLink to="/" className="metis-logo" end>
        <span className="metis-logo__mark" aria-hidden>
          <svg viewBox="0 0 32 32" width="22" height="22">
            <defs>
              <linearGradient id="metis-logo-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#a06bf0" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="6" fill="url(#metis-logo-grad)" />
            <circle cx="16" cy="16" r="11" fill="none" stroke="url(#metis-logo-grad)" strokeWidth="1.2" opacity="0.6" />
            <circle cx="16" cy="16" r="15" fill="none" stroke="url(#metis-logo-grad)" strokeWidth="0.7" opacity="0.3" />
          </svg>
        </span>
        <span className="metis-logo__word">Metis</span>
      </NavLink>

      <div className="metis-nav__links">
        <NavLink to="/dashboard" className={({ isActive }) => `metis-nav__link ${isActive ? 'is-active' : ''}`}>
          Dashboard
        </NavLink>
        <NavLink to="/agora" className={({ isActive }) => `metis-nav__link ${isActive ? 'is-active' : ''}`}>
          Agora
        </NavLink>
        <NavLink to="/shield" className={({ isActive }) => `metis-nav__link ${isActive ? 'is-active' : ''}`}>
          Active Shield
        </NavLink>
      </div>

      <div className="metis-nav__cta">
        <ParentalToggle enabled={parental} onChange={setParental} />
      </div>
    </nav>
  )
}

function Layout({ ctx }) {
  const location = useLocation()
  return (
    <div className={`metis-app ${ctx.parental ? 'is-parental' : ''}`}>
      <NebulaBackdrop />

      <Nav parental={ctx.parental} setParental={ctx.setParental} />

      <main className="metis-main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            <Outlet context={ctx} />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="metis-foot">
        <p>
          Metis · A cognitive sanctuary. Pipeline runs locally; inference on Modal. No feed data
          leaves your machine.
        </p>
      </footer>
    </div>
  )
}

export default function App() {
  const [result, setResult] = useState(null)
  const [parental, setParental] = useState(false)

  const ctx = { result, setResult, parental, setParental }

  return (
    <Routes>
      <Route element={<Layout ctx={ctx} />}>
        <Route index element={<Lander />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/shield" element={<Shield />} />
        <Route path="/agora" element={<Agora />} />
        <Route path="*" element={<Lander />} />
      </Route>
    </Routes>
  )
}
