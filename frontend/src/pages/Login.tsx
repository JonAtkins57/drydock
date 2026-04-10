import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-drydock-bg">
      <div className="w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <img
            src="/assets/drydock-logo.svg"
            alt="DryDock"
            className="w-48 mx-auto mb-4 drop-shadow-[0_0_30px_rgba(78,205,196,0.15)]"
          />
          <p className="text-drydock-steel text-sm tracking-[3px] uppercase">
            Operational Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg p-8">
          <h2 className="text-xl font-medium text-drydock-text mb-6">Sign in</h2>

          {error && (
            <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm text-drydock-text-dim mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-2.5 bg-drydock-bg border border-drydock-border rounded-md
                  text-drydock-text placeholder-drydock-steel
                  focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30
                  transition-colors"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-drydock-text-dim mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-drydock-bg border border-drydock-border rounded-md
                  text-drydock-text placeholder-drydock-steel
                  focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30
                  transition-colors"
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-drydock-steel text-xs mt-8 tracking-wide">
          Thrasoz / Atkins Professional Services
        </p>
      </div>
    </div>
  );
}
