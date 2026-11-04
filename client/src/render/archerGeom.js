/**
 * Archer (Kelly) bow geometry, expressed in the BOW-ARM local frame:
 *   arm direction = local -y (towards the enemy when aiming), "up" = local +x, thickness = local z.
 * In the aim pose the arm group is rotated about z by +90deg, so local -y -> character +x ("forward" after the
 * side-on stance yaw) and local +x -> up.
 *
 *   enemy  <---- forward (-y)                            archer body ---->  (+y)
 *        grip (y = gripY)  <- the OUTER curve (bow back) points at the enemy
 *        limb tips (y = tipY, nearer to the archer); the STRING joins the tips on the archer's side
 *        arrow: nock on the string, tip points forward (-y), feathers (fletching) sit next to the nock
 */
export const BOW = {
  gripY: -0.48,                          // forward-most point of the bow (held in the extended hand)
  tipY: -0.10, tipX: 0.72,               // limb tips: closer to the archer than the grip, +-tipX up/down
  limb: [[0.13, -0.48], [0.40, -0.40], [0.72, -0.10]], // upper limb polyline (lower limb mirrors x)
  draw: 0.42,                            // max pull distance towards the archer (+y)
  arrowLen: 0.95, arrowTipLen: 0.16,
  armReach: 0.48,                        // shoulder -> hand centre of the arm mesh
  release: 0.6,                          // fraction of the swing at which the string is released
};

/** Key points (bow-arm frame) for a given pull distance d (0..draw). */
export function bowPoints(d = 0) {
  const nockY = BOW.tipY + d;
  return {
    grip: [0, BOW.gripY], tipU: [BOW.tipX, BOW.tipY], tipL: [-BOW.tipX, BOW.tipY], nock: [0, nockY],
    arrowTip: [0, nockY - BOW.arrowLen - BOW.arrowTipLen / 2],
    fletch: [0, nockY - 0.13],
  };
}
