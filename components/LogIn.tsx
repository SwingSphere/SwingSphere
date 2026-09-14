import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Footer from './Footer';
import Button from './Button';
import { useAppStore } from '../store/appStore';

const LogIn: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // FIX: Destructure the login function directly from the useAppStore hook.
  const { login } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const user = await login(email, password);
      if (user) {
        const requestedPath = (location.state as { from?: string } | null)?.from;
        const targetPath = requestedPath || (user.role === 'Admin' || user.role === 'Host' ? '/admin' : '/');
        navigate(targetPath, { replace: true });
      } else {
        setError('Invalid email or password.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    }
    setIsLoading(false);
  };

  return (
    <div className="ss-bg-geometric fixed inset-0 z-50">
      <main className="flex-grow overflow-y-auto flex flex-col h-full">
        <div className="flex-grow flex items-center justify-center py-20">
          <div className="container mx-auto px-6 lg:px-8 max-w-md w-full">
            <div className="ss-glass-surface p-8 rounded-lg">
              <h1 className="text-3xl font-bold tracking-tighter text-center mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                Log In to SwingSphere
              </h1>
              <p className="text-gray-400 text-center mb-8">Log in to manage your listings.</p>

              {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm text-center mb-6">{error}</p>}
              
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:outline-none"
                    required
                  />
                </div>
                <Button size="large" variant="primary" type="submit" disabled={isLoading}>
                  {isLoading ? 'Logging In...' : 'Log In'}
                </Button>
              </form>

              <button type="button" onClick={() => navigate('/forgot-password')} className="mt-5 w-full text-center text-sm font-semibold text-red-400 hover:underline">
                Forgot your password?
              </button>

              <p className="text-center text-sm text-gray-500 mt-8">
                Don't have an account?{' '}
                <button type="button" onClick={() => navigate('/signup')} className="font-semibold text-red-400 hover:underline bg-transparent p-0">
                  Sign Up
                </button>
              </p>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    </div>
  );
};

export default LogIn;
