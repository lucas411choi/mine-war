/** Server settings. Every value has a default; no environment variable is required. */
const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3000),
  host: '0.0.0.0',
  maxRooms: num(process.env.MAX_ROOMS, 20),          // concurrent room cap
  roomIdleMs: 10 * 60 * 1000,                        // delete idle / empty waiting rooms after 10 min
  reconnectGraceMs: 30 * 1000,                       // 30 s to come back before forfeit
  maxPayload: 2048,                                  // bytes per ws message
  rateLimitPerSec: 40,                               // messages / second / connection
  pingIntervalMs: 30 * 1000,                         // server -> client ws ping
  snapBackpressureBytes: 64 * 1024,                  // skip snapshot if socket buffer is larger
};
