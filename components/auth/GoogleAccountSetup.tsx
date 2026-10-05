import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Footer from '../Footer';
import Button from '../Button';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/appStore';

const GoogleAccountSetup: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, isAuthLoading } = useAppStore();
  const [displayName, setDisplayName] = useState('');
  const [accountIntent, setAccountIntent] = useState<'explore' | 'promote'>('explore');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const nextPath = useMemo(() => {
    const stored = window.sessionStorage.getItem('swingsphere:oauth-next') || '/account';
    return stored.startsWith('/') && !stored.startsWith('//') ? stored : '/account';
  }, []);

  useEffect(() => {
    if (!isAuthLoading && currentUser && displayName.length === 0 && currentUser.displayName !== 'SwingSphere User') {
      setDisplayName(currentUser.displayName);
    }
  }, [currentUser, displayName.length, isAuthLoading]);

  if (!isAuthLoading && !currentUser) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser) return;
    if (!ageConfirmed) {
      setError('Please confirm that you are 21 or older before creating your SwingSphere account.');
      return;
    }

    const cleanName = displayName.trim();
    if (!cleanName) {
      setError('Choose a screen name for SwingSphere.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const { error: profileError } = await supabase.rpc('set_my_profile_identity', {
        p_display_name: cleanName,
        p_account_intent: accountIntent,
      });
      if (profileError) throw profileError;

      const now = new Date().toISOString();
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          swingsphere_onboarding_completed_at: now,
          age_confirmed_at: now,
        },
      });
      if (metadataError) throw metadataError;

      window.sessionStorage.removeItem('swingsphere:oauth-next');
      navigate(nextPath, { replace: true });
    } catch (err: any) {
      setError(err.message || 'SwingSphere could not finish your Google account setup.');
      setIsSaving(false);
    }
  };

  return (
    <main className="ss-bg-geometric flex min-h-screen flex-col overflow-y-auto">
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="container mx-auto w-full max-w-md px-6 lg:px-8">
          <div className="ss-glass-surface rounded-lg p-8">
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Google verified</p>
            <h1 className="text-center text-3xl font-bold tracking-tighter text-white">Finish your SwingSphere profile</h1>
            <p className="mt-3 text-center text-sm leading-6 text-gray-400">
              Your Google email stays private. Choose the name SwingSphere members will see when you participate.
            </p>

            {error && <p className="mt-6 rounded-md bg-red-900/50 p-3 text-center text-sm text-red-300">{error}</p>}

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Screen Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="YourPublicName"
                  maxLength={80}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">I’m joining to…</label>
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
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-gray-300">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(event) => setAgeConfirmed(event.target.checked)}
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

              <Button size="large" variant="primary" type="submit" disabled={isSaving || !currentUser}>
                {isSaving ? 'Finishing Setup…' : 'Finish Setup'}
              </Button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default GoogleAccountSetup;
