import { useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { getMe } from './lib/api/client'

function Protected({ children }: { children: JSX.Element }) {
  const [loading, setLoading] = useState(true)
  const [ok, setOk] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    getMe()
      .then(() => setOk(true))
      .catch(() => nav('/login'))
      .finally(() => setLoading(false))
  }, [nav])
  if (loading) return <p>Loading…</p>
  return ok ? children : null
}

function Home() {
  return (
    <div>
      <h1>Mosaic Life</h1>
      <nav>
        <Link to="/app">Enter App</Link>
      </nav>
    </div>
  )
}

function Login() {
  return (
    <div>
      <h2>Login</h2>
      <p>OIDC flow will start here.</p>
    </div>
  )
}

function Shell() {
  return (
    <div>
      <h2>App Shell</h2>
      <p>Protected content. User is authenticated.</p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/app"
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      />
    </Routes>
  )
}

