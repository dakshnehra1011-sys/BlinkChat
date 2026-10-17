/**
 * API and WebSocket URL resolving helper.
 * Supports VITE_API_URL environment variable for cross-origin deployments
 * (e.g., Cloudflare Pages on *.pages.dev talking to Cloudflare Workers on *.workers.dev)
 * or falls back to relative paths / current host for custom domain reverse-proxy setups.
 */
const RAW_API_BASE: string = (import.meta.env.VITE_API_URL as string) || '';

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (RAW_API_BASE) {
    return `${RAW_API_BASE.replace(/\/$/, '')}${normalizedPath}`;
  }
  return normalizedPath;
}

export function getWsUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (RAW_API_BASE) {
    const wsBase = RAW_API_BASE.replace(/^https:/i, 'wss:')
      .replace(/^http:/i, 'ws:')
      .replace(/\/$/, '');
    return `${wsBase}${normalizedPath}`;
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}${normalizedPath}`;
}
