import { EventEmitter } from 'node:events';
import logger from '../logger.js';

class AlertBroker extends EventEmitter {
  constructor() {
    super();
    // Allow high number of SSE listeners on single Node process
    this.setMaxListeners(200);
    this.connectedClientsCount = 0;
  }

  /**
   * Broadcast an event to all connected SSE clients.
   * @param {string} event - Event name (e.g. 'notification', 'case_update', 'status', 'ais_tick')
   * @param {any} data - Event payload
   */
  publish(event, data) {
    logger.debug({ event, dataSummary: typeof data === 'object' ? data?.headline || data?.id : data }, 'Broker broadcasting event');
    this.emit(event, data);
  }

  incrementClients() {
    this.connectedClientsCount++;
    return this.connectedClientsCount;
  }

  decrementClients() {
    this.connectedClientsCount = Math.max(0, this.connectedClientsCount - 1);
    return this.connectedClientsCount;
  }

  getClientCount() {
    return this.connectedClientsCount;
  }
}

export const broker = new AlertBroker();
export default broker;
