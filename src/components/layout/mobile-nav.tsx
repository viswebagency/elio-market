/**
 * Mobile navigation — bottom tab bar for mobile devices.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Home', href: '/dashboard', icon: 'home' },
  { label: 'Mercati', href: '/polymarket', icon: 'chart' },
  { label: 'Strategie', href: '/strategies', icon: 'zap' },
  { label: 'Journal', href: '/journal', icon: 'book' },
  { label: 'Altro', href: '/settings', icon: 'menu' },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950 md:hidden">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                flex flex-col items-center gap-1 px-3 py-2 text-xs
                ${isActive ? 'text-violet-400' : 'text-gray-500'}
              `}
            >
              <div className={`w-6 h-6 rounded-full ${isActive ? 'bg-violet-600/20' : ''} flex items-center justify-center`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-violet-400' : 'bg-gray-600'}`} />
              </div>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
