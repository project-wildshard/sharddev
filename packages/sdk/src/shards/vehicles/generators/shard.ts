// MIRROR-SALT-ZONE MSZ5: two vehicle kinds (`world.vehicle`) and their docks (`world.dock`) on a salt flat.
import { defineShard } from '@wildshard/sdk/scene/shard';
import { buildVehicles } from './world';

export const vehicles = defineShard({ slug: 'vehicles-example', name: 'Vehicles Example', author: 'Wildshard', revision: 1, seed: 459 }, buildVehicles);
