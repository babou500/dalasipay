// GitHub environment secrets can accidentally retain whitespace when pasted.
// Cloudflare API tokens and account IDs do not contain whitespace. Keep this
// preparation free from logging or error details containing the supplied values.
export function normalizeCloudflareCredentials(env) {
  const rawToken = env?.CLOUDFLARE_API_TOKEN;
  const rawAccountId = env?.CLOUDFLARE_ACCOUNT_ID;
  if (typeof rawToken !== 'string' || !rawToken.trim() ||
      typeof rawAccountId !== 'string' || !rawAccountId.trim()) {
    throw Error('Protected Cloudflare secrets required');
  }
  const token = rawToken.replace(/\s+/gu, '');
  const accountId = rawAccountId.replace(/\s+/gu, '');
  // Reject accidentally pasted commands, duplicate tokens, or other malformed data.
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(token) ||
      (token.match(/cfut_/g) || []).length > 1 ||
      /^Bearer/i.test(token) ||
      !/^[a-fA-F0-9]{32}$/.test(accountId)) {
    throw Error('Malformed Cloudflare credentials. Save one plain API token and the account ID in the protected GitHub environment.');
  }
  return { token, accountId };
}
