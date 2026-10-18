/**
 * Abstract Channel Adapter Interface
 * All alert delivery channels must extend this base contract.
 */
export class AlertChannelAdapter {
  constructor(name) {
    if (new.target === AlertChannelAdapter) {
      throw new TypeError('Cannot construct AlertChannelAdapter instances directly');
    }
    this.name = name;
  }

  /**
   * Broadcast an alert through this channel.
   * @param {Object} payload
   * @param {number|null} payload.caseId
   * @param {'case_new'|'case_update'|'system_test'} payload.type
   * @param {'High'|'Medium'|'Low'} payload.band
   * @param {string} payload.headline
   * @param {string} payload.body
   * @param {number|null} payload.lat
   * @param {number|null} payload.lon
   * @param {string|null} payload.sector
   * @param {number|null} payload.score
   * @param {string|null} payload.caseCreatedAt
   * @returns {Promise<{ success: boolean, id?: number, broadcastLatencyMs?: number, error?: string }>}
   */
  async send(payload) {
    throw new Error(`send() must be implemented by adapter ${this.name}`);
  }
}

export default AlertChannelAdapter;
