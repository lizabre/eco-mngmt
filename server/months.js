// Сезонні частки споживання по місяцях (січень..грудень). Сума часток кожного ресурсу = 1.
const HEATING = [17, 15, 13, 8, 3, 1, 1, 1, 3, 8, 14, 16];           // газ, вугілля, тепло
const ELECTRIC = [9.2, 8.8, 8.6, 8.2, 7.8, 7.5, 7.5, 7.7, 7.9, 8.3, 8.5, 10];
const FLAT = Array(12).fill(1);

const RAW = { GAS: HEATING, COAL: HEATING, HEAT: HEATING, EL: ELECTRIC };
const norm = a => { const s = a.reduce((x, y) => x + y, 0); return a.map(v => v / s); };

const round2 = x => Math.round(x * 100) / 100;

/** Розбиває річне значення на 12 місяців; залишок від округлення йде в останній місяць. */
function splitByMonths(resourceId, total) {
  const w = norm(RAW[resourceId] || FLAT);
  const parts = w.map(k => round2(total * k));
  parts[11] = round2(total - parts.slice(0, 11).reduce((s, v) => s + v, 0));
  return parts;
}

module.exports = { splitByMonths, round2 };
