import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from './Footer';
import Button from './Button';
import { useAppStore } from '../store/appStore';

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountIntent, setAccountIntent] = useState<'explore' | 'promote'>('explore');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { signUp, addToast } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await signUp({ displayName, email, password, accountIntent });
      addToast({ message: 'Account created. Check your email to confirm your address before logging in.', type: 'success' });
      navigate('/login', { state: { confirmationSent: true } });
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      addToast({ message: err.message || 'Failed to create account.', type: 'error' });
    }
    setIsLoading(false);
  };

  return (
    <main className="ss-bg-geometric flex-grow overflow-y-auto flex flex-col">
      <div className="flex-grow flex items-center justify-center py-20">
        <div className="container mx-auto px-6 lg:px-8 max-w-md w-full">
          <div className="ss-glass-surface p-8 rounded-lg">
            <h1 className="text-3xl font-bold tracking-tighter text-center mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              Create an Account
            </h1>
            <p className="text-gray-400 text-center mb-8">Choose how you plan to use SWINGSPHERE. We’ll email you a confirmation link.</p>

            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-sm text-center mb-6">{error}</p>}

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">I’m joining to…</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setAccountIntent('explore')}
                    className={`rounded-xl border p-4 text-left transition ${accountIntent === 'explore' ? 'border-red-400 bg-red-500/10 text-white' : 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-600'}`}
                  >
                    <span className="block font-semibold">Explore</span>
                    <span className="mt-1 block text-xs leading-5 text-gray-400">Discover clubs, events, and community listings.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountIntent('promote')}
                    className={`rounded-xl border p-4 text-left transition ${accountIntent === 'promote' ? 'border-red-400 bg-red-500/10 text-white' : 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-600'}`}
                  >
                    <span className="block font-semibold">Promote or host</span>
                    <span className="mt-1 block text-xs leading-5 text-gray-400">Manage a club, organization, or recurring events.</span>
                  </button>
                </div>
                {accountIntent === 'promote' && (
                  <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100/80">
                    Promoter access is reviewed before activation. Your account starts as a standard user until an organization and permissions are verified.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Screen Name</label>
                <input
                  type="text"
                  placeholder="YourPublicHandle"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  required
                />
              </div>
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
                  minLength={8}
                />
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-gray-300">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  required
                  className="mt-1 h-4 w-4 accent-red-500"
                />
                <span>
                  I confirm that I am 21 years of age or older and agree to the{' '}
                  <button type="button" onClick={() => navigate('/tos')} className="font-semibold text-red-400 hover:underline">
                    Terms of Service
                  </button>
                  .
                </span>
              </label>
              <Button size="large" variant="primary" type="submit" disabled={isLoading}>
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-8">
              Already have an account?{' '}
              <button type="button" onClick={() => navigate('/login')} className="font-semibold text-red-400 hover:underline bg-transparent p-0">
                Log In
              </button>
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default SignUp;
