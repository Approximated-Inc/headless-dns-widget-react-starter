export const cnameTarget = import.meta.env.VITE_CNAME_TARGET || 'domains.example.com';
export function createClient(options) {
  if (!window.apxDnsHeadless) throw new Error('The DNS client did not load. Reload this page to try again.');
  return window.apxDnsHeadless.createClient(options);
}
