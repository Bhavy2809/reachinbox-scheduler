'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const ERRORS: Record<string, string> = {
  invalid_state: 'Login session expired. Please try again.',
  oauth_failed: 'Google login failed. Please try again.',
  backend_unreachable: 'Cannot reach the backend. Is it running on port 4000?',
};

function GoogleLogo() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const error = params.get('error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Already logged in? Go straight to the inbox.
  useEffect(() => {
    api
      .me()
      .then(() => router.replace('/dashboard'))
      .catch(() => undefined);
  }, [router]);

  function onEmailLogin(e: FormEvent) {
    e.preventDefault();
    // The assignment requires Google OAuth; email/password is part of the design only.
    toast('info', 'Email sign-in is not enabled for this demo - please use Login with Google.');
  }

  return (
    <div className="w-full max-w-[400px] rounded-2xl border border-gray-200 bg-white px-10 py-10 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <h1 className="text-center text-[28px] font-semibold tracking-tight text-gray-900">Login</h1>

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-700">
          {ERRORS[error] ?? `Login error: ${error}`}
        </p>
      )}

      <a
        href={api.googleLoginUrl}
        className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-50 text-sm font-medium text-gray-800 transition hover:bg-brand-100"
      >
        <GoogleLogo />
        Login with Google
      </a>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-2xs text-gray-400">or sign up through email</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <form onSubmit={onEmailLogin} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email ID"
          className="h-11 w-full rounded-lg bg-surface-100 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="h-11 w-full rounded-lg bg-surface-100 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          type="submit"
          className="mt-3 h-10 w-full rounded-lg bg-brand-600 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          Login
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-4">
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
