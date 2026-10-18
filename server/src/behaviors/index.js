import darkVesselBehavior from './dark-vessel.js';
import possibleTransshipmentBehavior from './possible-transshipment.js';

const behaviors = new Map();
behaviors.set(darkVesselBehavior.id, darkVesselBehavior);
behaviors.set(possibleTransshipmentBehavior.id, possibleTransshipmentBehavior);

export function getBehavior(id) {
  return behaviors.get(id) || darkVesselBehavior;
}

export function listBehaviors() {
  return Array.from(behaviors.values());
}

export { darkVesselBehavior, possibleTransshipmentBehavior };
export default { getBehavior, listBehaviors };
