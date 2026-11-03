/**
 * Asset manifest. The game runs with zero asset files (procedural low-poly models + WebAudio sounds).
 * To replace a model with a GLB: put the file in client/public/assets/models/ and add an entry, e.g.
 *   models: { tim: { url: '/assets/models/tim.glb', scale: 1, y: 0 } }
 * Keys: unit/worker ids (jack, tim, ...) or 'tower_crystal', 'tower_iron', 'tower_flame', 'tower_vein'.
 * A GLB replaces the whole procedural model (it is shown static with a gentle bob / sway).
 */
export const ASSETS = {
  models: {},
};
