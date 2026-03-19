/**
 * Dashboard layout — sidebar + topbar + main content area.
 */

import { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { AuthProvider } from '@/lib/providers/auth-provider';
import { ThemeProvider } from '@/lib/providers/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import { DisclaimerBanner } from '@/components/compliance/disclaimer-banner';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <DisclaimerBanner />
          <div className="min-h-screen bg-gray-950 text-gray-100">
            {/* Sidebar — hidden on mobile */}
            <div className="hidden md:block">
              <Sidebar />
            </div>

            {/* Main content area */}
            <div className="md:ml-64">
              <Topbar />
              <main className="p-6 pb-20 md:pb-6">
                {children}
              </main>
            </div>

            {/* Mobile nav — visible on mobile */}
            <MobileNav />
          </div>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
