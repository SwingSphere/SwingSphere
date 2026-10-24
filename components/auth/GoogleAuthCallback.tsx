import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { isTransientAuthOrNetworkError, withAuthDeadline } from '../../lib/authResilience';

const getSafeNextPath = () => {
  const stored = window.sessionStorage.getItem('swingsphere:oauth-next') || '/account';
  return stored.startsWith('/') && !stored.startsWith('//') ? stored : '/account';
};

const GoogleAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const [message, setMessage] = useState('Finishing Google sign-in…');
  const [recoverableError, setRecoverableError] = useState<string | null>(null);

  const finish = useCallback(async () => {
    if (handledRef.current) return;
    setRecoverableError(null);

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    const oauthError = queryParams.get('error_description') || hashParams.get('error_description');
    if (oauthError) {
      handledRef.current = true;
      navigate('/login', { replace: true, state: { oauthError } });
      return;
    }

    try {
      const { data, error } = await withAuthDeadline(
        supabase.auth.getSession(),
        'Google sign-in verification timed out.',
        10000,
      );
      if (error) {
        if (isTransientAuthOrNetworkError(error)) {
          setRecoverableError(
            'SwingSphere authentication is temporarily slow or unreachable. Your sign-in was not cancelled — click Retry below.',
          );
          setMessage('Waiting for authentication service…');
          return;
        }
        handledRef.current = true;
        navigate('/login', { replace: true, state: { oauthError: error.message } });
        return;
      }

      const user = data.session?.user;
      if (!user) return;

      handledRef.current = true;
      const nextPath = getSafeNextPath();
      const createdAt = new Date(user.created_at).getTime();
      const lastSignInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : createdAt;
      const isNewAccount =
        Number.isFinite(createdAt) &&
        Number.isFinite(lastSignInAt) &&
        Math.abs(lastSignInAt - createdAt) < 5 * 60 * 1000;
      const usedGoogle =
        user.app_metadata?.provider === 'google' ||
        user.identities?.some((identity) => identity.provider === 'google');

      if (usedGoogle && isNewAccount && !user.user_metadata?.swingsphere_onboarding_completed_at) {
        setMessage('Google verified. Opening your private SwingSphere setup…');
        navigate('/signup/google', { replace: true });
        return;
      }

      window.sessionStorage.removeItem('swingsphere:oauth-next');
      navigate(nextPath, { replace: true });
    } catch (err) {
      if (isTransientAuthOrNetworkError(err)) {
        setRecoverableError(
          'SwingSphere authentication timed out while completing sign-in. Click Retry to continue without starting over.',
        );
        return;
      }
      handledRef.current = true;
      navigate('/login', {
        replace: true,
        state: { oauthError: err instanceof Error ? err.message : 'Unable to complete Google sign-in.' },
      });
    }
  }, [navigate]);

  useEffect(() => {
    void finish();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void finish();
    });

    const timeout = window.setTimeout(() => {
      if (!handledRef.current) {
        setMessage('Google sign-in is taking longer than expected. You can retry below or return to the login page.');
        setRecoverableError(
          'Connection to SwingSphere is taking longer than expected.',
        );
      }
    }, 8000);

    return () => {
      listener.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [finish]);

  return (
    <main className="ss-bg-geometric min-h-screen px-6 py-20">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-black/40 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div
          className="mx-auto mb-5 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-red-400"
          aria-hidden="true"
        />
        <h1 className="text-xl font-semibold text-white">Signing you in</h1>
        <p className="mt-3 text-sm leading-6 text-gray-400">{recoverableError || message}</p>
        {recoverableError && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void finish()}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              Retry Sign-In
            </button>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-gray-200 transition hover:bg-white/[0.1]"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </main>
  );
};

export default GoogleAuthCallback;
