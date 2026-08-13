import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from './Button';
import Footer from './Footer';
import { supabase } from '../lib/supabase';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate('/account', { replace: true });
  };

  return (
    <main className="ss-bg-geometric flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="ss-glass-surface w-full max-w-md rounded-lg p-8">
          <h1 className="mb-2 text-center text-3xl font-bold text-white">Choose a new password</h1>
          <p className="mb-8 text-center text-gray-400">Enter a new password for your SwingSphere account.</p>
          {error && <p className="mb-6 rounded-md bg-red-900/50 p-3 text-center text-sm text-red-400">{error}</p>}
          <form className="space-y-6" onSubmit={submit}>
            <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
            <input type="password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
            <Button size="large" variant="primary" type="submit" disabled={isLoading}>{isLoading ? 'Updating…' : 'Update password'}</Button>
          </form>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default ResetPassword;
