/**
 * Auth layout — centered card layout for login/register/onboarding.
 */

import { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            Elio<span className="text-violet-500">.Market</span>
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Piattaforma multi-area di trading intelligente
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
