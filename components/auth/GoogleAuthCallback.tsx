import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const getSafeNextPath = () => {
  const stored = window.sessionStorage.getItem('swingsphere:oauth-next') || '/account';
  return stored.startsWith('/') && !stored.startsWith('//') ? stored : '/account';
};

const GoogleAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const [message, setMessage] = useState('Finishing Google sign-in…');

  useEffect(() => {
    const finish = async () => {
      if (handledRef.current) return;

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const queryParams = new URLSearchParams(window.location.search);
      const oauthError = queryParams.get('error_description') || hashParams.get('error_description');
      if (oauthError) {
        handledRef.current = true;
        navigate('/login', { replace: true, state: { oauthError } });
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
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
      const isNewAccount = Number.isFinite(createdAt)
        && Number.isFinite(lastSignInAt)
        && Math.abs(lastSignInAt - createdAt) < 5 * 60 * 1000;
      const usedGoogle = user.app_metadata?.provider === 'google'
        || user.identities?.some((identity) => identity.provider === 'google');

      if (usedGoogle && isNewAccount && !user.user_metadata?.swingsphere_onboarding_completed_at) {
        setMessage('Google verified. Opening your private SwingSphere setup…');
        navigate('/signup/google', { replace: true });
        return;
      }

      window.sessionStorage.removeItem('swingsphere:oauth-next');
      navigate(nextPath, { replace: true });
    };

    void finish();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void finish();
    });

    const timeout = window.setTimeout(() => {
      if (!handledRef.current) {
        setMessage('Google sign-in is taking longer than expected. You can safely return to the login page and try again.');
      }
    }, 8000);

    return () => {
      listener.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <main className="ss-bg-geometric min-h-screen px-6 py-20">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-black/40 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-red-400" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-white">Signing you in</h1>
        <p className="mt-3 text-sm leading-6 text-gray-400">{message}</p>
      </div>
    </main>
  );
};

export default GoogleAuthCallback;
