import { AlertChannelAdapter } from './adapter.js';
import onsiteAdapter from './onsite.js';
import broker from './broker.js';
import logger from '../logger.js';

// Adapter registry with ONLY "onsite" implemented
const adapters = new Map();
adapters.set('onsite', onsiteAdapter);

/**
 * Get a channel adapter by name.
 * Only 'onsite' is implemented per Change Request v3.
 * @param {string} name
 * @returns {AlertChannelAdapter}
 */
export function getAlertAdapter(name = 'onsite') {
  const adapter = adapters.get(name);
  if (!adapter) {
    throw new Error(`Alert adapter "${name}" is not supported. Only "onsite" is enabled.`);
  }
  return adapter;
}

/**
 * Dispatch an alert through the on-site notification system.
 * @param {Object} payload
 * @returns {Promise<{ success: boolean, id?: number, broadcastLatencyMs?: number, error?: string }>}
 */
export async function dispatchAlert(payload) {
  const adapter = getAlertAdapter('onsite');
  return adapter.send(payload);
}

export { broker };
export default { getAlertAdapter, dispatchAlert, broker };
