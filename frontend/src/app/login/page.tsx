'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Card, Input } from '@/components/ui';

type LoginMethod = 'email' | 'phone';

export default function LoginPage() {
  const { login, loading: authLoading } = useAuth();
  const router = useRouter();

  const [method, setMethod] = useState<LoginMethod>('email');
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function switchMethod(m: LoginMethod) {
    setMethod(m);
    setCredential('');
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(credential, password, method);
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(msg || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-4xl">🛍️</span>
          <h1 className="text-2xl font-bold text-emerald-700 mt-2">KasiConnect</h1>
          <p className="text-slate-500 text-sm mt-1">Vendor Dashboard Login</p>
        </div>

        <Card padding="lg" className="rounded-xl">
          {/* Toggle between email and phone login */}
          <div className="flex rounded-lg bg-slate-100 p-1 mb-4">
            <button
              type="button"
              onClick={() => switchMethod('email')}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                method === 'email'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => switchMethod('phone')}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                method === 'phone'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Phone
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="credential" className="block text-sm font-medium text-slate-700 mb-1">
                {method === 'email' ? 'Email' : 'Phone Number'}
              </label>
              <Input
                id="credential"
                type={method === 'email' ? 'email' : 'tel'}
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder={method === 'email' ? 'you@example.com' : '27731234567'}
                required
                autoComplete={method === 'email' ? 'email' : 'tel'}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
