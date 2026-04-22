import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const navigate = useNavigate()
  
  useEffect(() => {
    document.title = 'Login'
  }, [])
  
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    
    if (!username || !password) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const body = { username, password }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(data.message)
        if (isLogin) {
          await checkPortfolio()
        } else {
          setIsLogin(true)
          setUsername('')
          setPassword('')
        }
      } else {
        setError(data.message || 'Something went wrong')
      }
    } catch {
      setError('Network error. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const checkPortfolio = async () => {
    const response = await fetch(`/api/portfolio/exists`, {
      method: 'GET',
      credentials: "include",
    })
    const hasPortfolio = await response.json()

    console.log('Has portfolio:', hasPortfolio) // TODO: REMOVE
    
    if(hasPortfolio) {
      navigate('/dashboard')
    } else {
      navigate('/portfolio')
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-12 px-5">
      <h2 className="text-2xl font-150 mb-4">{isLogin ? 'Login' : 'Register'}</h2>

      <div className="mb-4 space-y-2">
        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 bg-surface border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
        />
        
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 bg-surface border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

       {/* User is logging in */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full px-3 py-2 bg-primary text-primary-foreground rounded-md cursor-pointer disabled:cursor-not-allowed mb-4 hover:bg-primary-hover transition-colors"
      >
        {loading ? 'Loading...' : (isLogin ? 'Login' : 'Register')}
      </button>

      {/* User is registering */}
      <button
        onClick={() => {
          setIsLogin(!isLogin) 
          setError('')
          setSuccess('')
        }}
        className="w-full px-2 py-2 bg-transparent text-primary border border-primary rounded-md cursor-pointer hover:bg-primary/10 transition-colors"
      >
        {isLogin ? 'Register' : 'Login'}
      </button>

      {error && (
        <div className="mt-4 p-2 text-error">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-2 text-success">
          {success}
        </div>
      )}
    </div>
  )
}
