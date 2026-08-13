import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from './Button';
import Footer from './Footer';
import { useAppStore } from '../store/appStore';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { requestPasswordReset } = useAppStore();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    setMessage('');
    try {
      await requestPasswordReset(email);
      setMessage('Check your email for a password reset link.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send the reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="ss-bg-geometric flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="ss-glass-surface w-full max-w-md rounded-lg p-8">
          <h1 className="mb-2 text-center text-3xl font-bold text-white">Reset your password</h1>
          <p className="mb-8 text-center text-gray-400">We’ll email you a secure reset link.</p>
          {message && <p className="mb-6 rounded-md bg-emerald-900/40 p-3 text-center text-sm text-emerald-300">{message}</p>}
          {error && <p className="mb-6 rounded-md bg-red-900/50 p-3 text-center text-sm text-red-400">{error}</p>}
          <form className="space-y-6" onSubmit={submit}>
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
            <Button size="large" variant="primary" type="submit" disabled={isLoading}>{isLoading ? 'Sending…' : 'Send reset link'}</Button>
          </form>
          <button type="button" onClick={() => navigate('/login')} className="mt-6 w-full text-sm font-semibold text-red-400 hover:underline">Back to login</button>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default ForgotPassword;
