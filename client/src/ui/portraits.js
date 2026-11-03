/** Canvas-drawn character portraits (no image assets). Cached as data URLs. */
const SPEC = {
  jack: { body: '#b9783a', hat: 'hard', hc: '#f2c230' },
  robinson: { body: '#e08a1e', hat: 'goggle', hc: '#d97a1e' },
  gary: { body: '#c04a3a', hat: 'bandana', hc: '#222' },
  teammine: { body: '#b9783a', hat: 'hard', hc: '#f2c230', extra: 'crew' },
  tim: { body: '#3d7bff', hat: 'helm', hc: '#3d7bff' },
  kimmy: { body: '#3d7bff', hat: 'helm', hc: '#f2c230', extra: 'horse' },
  kelly: { body: '#4f9a3b', hat: 'hood', hc: '#3f8a2f' },
  galion: { body: '#6b7a4b', hat: 'tank', hc: '#4f5a35' },
  sammy: { body: '#3d7bff', hat: 'goggle', hc: '#7a5a3a', extra: 'plane' },
  sam: { body: '#c8623a', hat: 'bandana', hc: '#c0392b', extra: 'beard' },
  bill: { body: '#3d6ab5', hat: 'cap', hc: '#2a4a85', extra: 'beard' },
  ezra: { body: '#6a3fb5', hat: 'wiz', hc: '#6a3fb5', extra: 'beard2' },
};
const cache = {};

function circle(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }

export function portrait(id) {
  if (cache[id]) return cache[id];
  const s = SPEC[id] || SPEC.jack, c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(48, 38, 6, 48, 52, 70);
  bg.addColorStop(0, '#8a6d4c'); bg.addColorStop(1, '#2a1d14');
  g.fillStyle = bg; g.fillRect(0, 0, 96, 96);
  g.lineWidth = 3; g.strokeStyle = '#1a1008'; g.lineJoin = 'round';
  // shoulders / body
  g.fillStyle = s.body; g.beginPath(); g.roundRect ? g.roundRect(12, 68, 72, 40, 16) : g.rect(12, 68, 72, 40); g.fill(); g.stroke();
  if (s.hat === 'wiz') { g.fillStyle = '#4a2a85'; g.beginPath(); g.moveTo(30, 96); g.lineTo(48, 62); g.lineTo(66, 96); g.fill(); }
  // head
  circle(g, 48, 48, 23, '#ffd2a6'); g.beginPath(); g.arc(48, 48, 23, 0, 7); g.stroke();
  // beard
  if (s.extra === 'beard') { g.fillStyle = '#5a3a1e'; g.beginPath(); g.moveTo(27, 54); g.quadraticCurveTo(48, 90, 69, 54); g.quadraticCurveTo(48, 62, 27, 54); g.fill(); g.stroke(); }
  if (s.extra === 'beard2') { g.fillStyle = '#f4f4f4'; g.beginPath(); g.moveTo(26, 54); g.quadraticCurveTo(48, 100, 70, 54); g.quadraticCurveTo(48, 64, 26, 54); g.fill(); g.stroke(); }
  // eyes + smile
  circle(g, 40, 48, 3.2, '#1b1b1b'); circle(g, 56, 48, 3.2, '#1b1b1b');
  g.strokeStyle = '#8a4a2a'; g.lineWidth = 2; g.beginPath(); g.arc(48, 55, 6, 0.2, Math.PI - 0.2); g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#1a1008';
  // headgear
  const hat = s.hat;
  if (hat === 'hard') { g.fillStyle = s.hc; g.beginPath(); g.arc(48, 40, 24, Math.PI, 0); g.fill(); g.stroke(); g.fillRect(22, 38, 52, 6); circle(g, 48, 24, 4, '#fff2a0'); }
  else if (hat === 'helm') { g.fillStyle = '#b9c2cc'; g.beginPath(); g.arc(48, 40, 25, Math.PI, 0); g.fill(); g.stroke(); g.fillStyle = s.hc; g.beginPath(); g.moveTo(44, 16); g.lineTo(52, 16); g.lineTo(48, 0); g.fill(); g.fillStyle = '#8d97a3'; g.fillRect(45, 30, 6, 18); }
  else if (hat === 'hood') { g.fillStyle = s.hc; g.beginPath(); g.moveTo(22, 52); g.lineTo(48, 4); g.lineTo(74, 52); g.lineTo(66, 36); g.lineTo(30, 36); g.fill(); g.stroke(); }
  else if (hat === 'bandana') { g.fillStyle = s.hc; g.fillRect(25, 30, 46, 10); g.strokeRect(25, 30, 46, 10); g.beginPath(); g.moveTo(70, 32); g.lineTo(84, 40); g.lineTo(70, 40); g.fill(); }
  else if (hat === 'goggle') { g.fillStyle = s.hc; g.beginPath(); g.arc(48, 40, 24, Math.PI, 0); g.fill(); g.stroke(); circle(g, 38, 40, 8, '#7fd4ff'); circle(g, 58, 40, 8, '#7fd4ff'); g.fillStyle = '#222'; g.fillRect(44, 38, 8, 4); }
  else if (hat === 'cap') { g.fillStyle = s.hc; g.beginPath(); g.arc(48, 40, 24, Math.PI, 0); g.fill(); g.stroke(); g.fillRect(40, 38, 40, 6); }
  else if (hat === 'tank') { g.fillStyle = s.hc; g.beginPath(); g.arc(48, 40, 24, Math.PI, 0); g.fill(); g.stroke(); g.fillStyle = '#333'; g.fillRect(26, 38, 44, 5); }
  else if (hat === 'wiz') { g.fillStyle = '#5b34a6'; g.beginPath(); g.moveTo(18, 40); g.lineTo(78, 40); g.lineTo(60, 36); g.lineTo(50, 2); g.lineTo(36, 36); g.fill(); g.stroke(); g.fillStyle = '#ffd54a'; g.fillRect(34, 32, 28, 5); }
  if (s.extra === 'plane') { g.fillStyle = '#f1f1f1'; g.fillRect(2, 74, 92, 7); g.strokeRect(2, 74, 92, 7); }
  if (s.extra === 'horse') { g.fillStyle = '#8b5a2b'; g.beginPath(); g.moveTo(70, 96); g.lineTo(80, 60); g.lineTo(94, 70); g.lineTo(90, 96); g.fill(); g.stroke(); }
  if (s.extra === 'crew') { circle(g, 12, 70, 11, '#ffd2a6'); circle(g, 84, 70, 11, '#e8b48a'); }
  return (cache[id] = c.toDataURL());
}
