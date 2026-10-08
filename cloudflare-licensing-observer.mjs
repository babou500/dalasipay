/* DalasiPay Cloudflare licensing observer v1.
 * NOT mounted to a route, NOT deployed, NOT an authorization/enforcement system.
 * Integrate only after verifying Cloudflare Worker authentication and workspace ownership.
 */
import { evaluateSubscription } from './licensing-observer-core.mjs';
export { evaluateSubscription };
export function createLicensingObserver({ loadWorkspaceSnapshot, authorizeWorkspace } = {}) {
  if (typeof loadWorkspaceSnapshot !== 'function' || typeof authorizeWorkspace !== 'function') {
    throw new TypeError('Authenticated workspace authorization and server-owned snapshot loaders are required');
  }
  return async function observe({ principal, workspaceId }) {
    if (!principal || typeof workspaceId !== 'string' || !/^[a-zA-Z0-9:_-]{1,200}$/.test(workspaceId)) {
      return { ok: false, reason: 'invalid_request' };
    }
    try {
      const authorized = await authorizeWorkspace({ principal, workspaceId });
      if (authorized !== true) return { ok: false, reason: 'not_authorized' };
      const snapshot = await loadWorkspaceSnapshot({ workspaceId });
      if (!snapshot || snapshot.workspaceId !== workspaceId) return { ok: false, reason: 'snapshot_unavailable' };
      return evaluateSubscription(snapshot);
    } catch (_error) {
      return { ok: false, reason: 'observation_unavailable' };
    }
  };
}
