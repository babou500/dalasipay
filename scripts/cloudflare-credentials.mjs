// Never include supplied values, fragments, lengths, or hashes in diagnostics.
// Local format checks cannot establish token validity or account authorization.
export function normalizeCloudflareCredentials(env) {
  const issues = [];
  const rawToken = env?.CLOUDFLARE_API_TOKEN;
  const rawAccountId = env?.CLOUDFLARE_ACCOUNT_ID;
  const token = typeof rawToken === 'string' ? rawToken.replace(/\s+/gu, '') : '';
  // Unlike a wrapped token, an account ID should be copied as one identifier.
  const accountId = typeof rawAccountId === 'string' ? rawAccountId.trim() : '';
  if (!token) {
    issues.push('CLOUDFLARE_API_TOKEN: missing');
  } else if (/^Bearer\s/i.test(rawToken.trim())) {
    issues.push('CLOUDFLARE_API_TOKEN: authorization scheme pasted; save only the token');
  } else if ((token.match(/cf(?:ut|at)_/g) || []).length > 1 ||
             /^(?:[A-Za-z0-9_-]{40}){2,}$/.test(token) && !/^cf(?:ut|at)_/.test(token)) {
    issues.push('CLOUDFLARE_API_TOKEN: multiple tokens suspected; save one token');
  } else if (!/^[A-Za-z0-9_-]{20,256}$/.test(token) || /^cfk_/.test(token)) {
    issues.push('CLOUDFLARE_API_TOKEN: invalid format; save a plain API token, not a key, command or quoted value');
  }
  if (!accountId) {
    issues.push('CLOUDFLARE_ACCOUNT_ID: missing');
  } else if (!/^[a-fA-F0-9]{32}$/.test(accountId)) {
    issues.push('CLOUDFLARE_ACCOUNT_ID: invalid format; save the 32-character hexadecimal account ID, not a URL or account name');
  }
  if (issues.length) {
    throw Error('Protected Cloudflare secrets required in GitHub environment cloudflare-production. ' + issues.join('. '));
  }
  return { token, accountId };
}
