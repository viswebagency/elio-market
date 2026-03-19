/**
 * Sidebar — main navigation with 5 market areas.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MARKET_AREAS_LIST } from '@/core/constants/market-areas';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: 'grid' },
  ...MARKET_AREAS_LIST.map((area) => ({
    label: area.nameIt,
    href: `/${area.id === 'prediction' ? 'polymarket' : area.id === 'exchange_betting' ? 'betfair' : area.id}`,
    icon: area.icon,
    color: area.color,
  })),
  { label: 'Journal', href: '/journal', icon: 'book' },
  { label: 'Impostazioni', href: '/settings', icon: 'settings' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-800 bg-gray-950">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-gray-800">
        <Link href="/dashboard" className="text-xl font-bold text-white">
          Elio<span className="text-violet-500">.Market</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-violet-600/20 text-violet-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }
              `}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: 'color' in item ? item.color : (isActive ? '#8B5CF6' : '#6B7280') }}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
        <div className="text-xs text-gray-500 text-center">
          Elio.Market v0.1.0
        </div>
      </div>
    </aside>
  );
}
