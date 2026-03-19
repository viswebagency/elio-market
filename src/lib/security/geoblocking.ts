/**
 * Geoblocking — restrict access by country based on regulatory requirements.
 */

/** Countries where prediction markets / exchange betting may be restricted */
export const RESTRICTED_COUNTRIES: Record<string, string[]> = {
  prediction_markets: [
    'US', // Polymarket restricted for US users (except with VPN)
  ],
  exchange_betting: [
    'US', // Betfair not available in US
    'TR', // Turkey
  ],
};

/** Check if a country is blocked for a specific service */
export function isCountryBlocked(countryCode: string, service: string): boolean {
  const restricted = RESTRICTED_COUNTRIES[service];
  if (!restricted) return false;
  return restricted.includes(countryCode.toUpperCase());
}

/** Get country from request headers (requires a CDN/proxy that sets this) */
export function getCountryFromHeaders(headers: Headers): string | null {
  // Vercel sets this header
  return headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry') ?? null;
}

/** Middleware check */
export function checkGeoblocking(
  countryCode: string | null,
  service: string
): { allowed: boolean; reason?: string } {
  if (!countryCode) {
    return { allowed: true }; // Allow if country unknown
  }

  if (isCountryBlocked(countryCode, service)) {
    return {
      allowed: false,
      reason: `Service "${service}" is not available in your country (${countryCode}).`,
    };
  }

  return { allowed: true };
}
