/**
 * Navigation structure — used by sidebar and mobile nav.
 */

import { MarketArea } from '@/core/types/common';

export interface NavItem {
  label: string;
  href: string;
  area?: MarketArea;
  icon?: string;
  badge?: string;
}

export const mainNavigation: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Polymarket', href: '/polymarket', area: MarketArea.PREDICTION },
  { label: 'Betfair', href: '/betfair', area: MarketArea.EXCHANGE_BETTING },
  { label: 'Azioni', href: '/stocks', area: MarketArea.STOCKS },
  { label: 'Forex', href: '/forex', area: MarketArea.FOREX },
  { label: 'Crypto', href: '/crypto', area: MarketArea.CRYPTO },
];

export const secondaryNavigation: NavItem[] = [
  { label: 'Journal', href: '/journal' },
  { label: 'Impostazioni', href: '/settings' },
];

export const authNavigation: NavItem[] = [
  { label: 'Login', href: '/login' },
  { label: 'Registrati', href: '/register' },
];
