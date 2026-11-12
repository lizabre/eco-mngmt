// Лабораторна №2: нові колекції (working_days, temperatures, co2_emissions, total_costs, own_generation),
// їх початкове наповнення та розрахунок енергетичних індикаторів.
const MON = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const ORDER = ['EL', 'HEAT', 'GAS', 'WTR', 'COAL', 'DSL'];
const GJ = { EL: 0.0036, HEAT: 4.1868, GAS: 0.0342, DSL: 0.0359, COAL: 25 };      // ГДж на одиницю ресурсу (вода — не енергоресурс)
const EF = { EL: 0.0004, GAS: 0.00202, DSL: 0.00265, COAL: 2.4, HEAT: 0.2 };        // т CO2 на одиницю ресурсу (для генерації даних)
const T0 = 15.5;                                                                      // базова температура для градусо-днів
const arr = () => Array(12).fill(0), sum = a => a.reduce((s, v) => s + v, 0);

/** Чиста функція розрахунку індикаторів (без доступу до БД). */
function compute(inp) {
  const { year } = inp, meta = r => ({ name: inp.res?.[r]?.name ?? r, unit: inp.res?.[r]?.unit ?? '' });
  const Q = {}, B = {}, C = {};
  for (const r of ORDER) { Q[r] = arr(); B[r] = arr(); C[r] = arr(); }
  for (const c of inp.cons) { if (!Q[c.r] || !(c.m >= 1)) continue; Q[c.r][c.m - 1] += c.qty; C[c.r][c.m - 1] += c.cost; if (c.t === 'building') B[c.r][c.m - 1] += c.qty; }
  const days = inp.days.map(v => v || 0);

  // 1. Середньодобове споживання, мін/макс, коефіцієнт нерівномірності (нульові місяці не враховуються)
  const daily = ORDER.filter(r => sum(Q[r]) > 0).map(r => {
    const avg = Q[r].map((v, i) => v > 0 && days[i] > 0 ? v / days[i] : null);
    const nz = avg.map((v, i) => ({ v, m: i + 1 })).filter(x => x.v != null);
    const missing = avg.map((v, i) => v == null ? i + 1 : 0).filter(Boolean);
    if (!nz.length) return { resourceId: r, ...meta(r), avg, yearAvg: null, min: null, max: null, ratio: null, missing };
    const mn = nz.reduce((a, b) => b.v < a.v ? b : a), mx = nz.reduce((a, b) => b.v > a.v ? b : a);
    return { resourceId: r, ...meta(r), avg, yearAvg: sum(nz.map(x => x.v)) / nz.length, min: mn, max: mx, ratio: mx.v / mn.v, missing };
  });

  // 2. Градусо-дні та питоме споживання для будівель (на опалювальну площу)
  const dim = m => new Date(year, m, 0).getDate();
  const dd = inp.out.map((t, i) => t == null ? null : Math.max(0, T0 - t) * dim(i + 1));
  const ddYear = sum(dd.filter(v => v != null));
  const specific = ['EL', 'GAS', 'HEAT'].filter(r => inp.area > 0 && sum(B[r]) > 0).map(r => ({
    resourceId: r, ...meta(r), monthly: B[r].map(v => v / inp.area), year: sum(B[r]) / inp.area,
    perDegreeDay: r !== 'EL' && ddYear > 0 ? sum(B[r]) / inp.area / ddYear : null
  }));

  // 3. Енергоємність продукції, енергетична складова у витратах, власна генерація, питомі викиди CO2
  const consGJ = Array.from({ length: 12 }, (_, i) => Object.keys(GJ).reduce((s, r) => s + Q[r][i] * GJ[r], 0));
  const energyGJ = sum(consGJ);
  const energyCost = Array.from({ length: 12 }, (_, i) => Object.keys(GJ).reduce((s, r) => s + C[r][i], 0));
  const genGJ = arr(); for (const g of inp.gen) if (g.m >= 1 && GJ[g.r]) genGJ[g.m - 1] += g.qty * GJ[g.r];
  const share = energyCost.map((v, i) => inp.costs[i] > 0 ? v / inp.costs[i] * 100 : null);
  const costTot = sum(inp.costs), co2 = sum(inp.co2);
  const out = {
    year, area: inp.area, days: inp.days, outdoor: inp.out, indoor: inp.inn, daily, degreeDays: dd, degreeDaysYear: ddYear, specific,
    product: { tons: inp.tons, energyGJ, intensity: inp.tons > 0 ? energyGJ / inp.tons : null },
    costShare: { energyCost, total: inp.costs, share, year: costTot > 0 ? sum(energyCost) / costTot * 100 : null },
    own: { genGJ, consGJ, share: energyGJ > 0 ? sum(genGJ) / energyGJ * 100 : null },
    co2: { monthly: inp.co2, year: co2, perTon: inp.tons > 0 ? co2 / inp.tons : null }
  };

  // 4. Сервісні повідомлення
  const msg = out.messages = [];
  for (const d of daily) {
    if (d.ratio != null && d.ratio > 3) msg.push({ level: 'warn', text: `«${d.name}»: коефіцієнт нерівномірності ${d.ratio.toFixed(2)} (макс. – ${MON[d.max.m - 1]}, мін. – ${MON[d.min.m - 1]}) перевищує 3.` });
    if (d.missing.length) msg.push({ level: 'info', text: `«${d.name}»: немає даних або роботи за місяці: ${d.missing.map(m => MON[m - 1]).join(', ')}; середнє розраховано по ${12 - d.missing.length} міс.` });
  }
  if (!(inp.area > 0)) msg.push({ level: 'info', text: 'Опалювальна площа не задана – питоме енергоспоживання не розраховано.' });
  if (!(inp.tons > 0)) msg.push({ level: 'info', text: 'Немає даних про обсяги виробництва – питому енергоємність і питомі викиди CO₂ не розраховано.' });
  if (out.costShare.year != null && out.costShare.year > 40) msg.push({ level: 'warn', text: `Частка енергетичної складової у витратах ${out.costShare.year.toFixed(1)} % – понад 40 %.` });
  if (out.own.share != null && out.own.share < 5) msg.push({ level: 'info', text: `Частка власної генерації лише ${out.own.share.toFixed(1)} % від енергоспоживання.` });
  if (!msg.length) msg.push({ level: 'ok', text: 'Відхилень не виявлено.' });
  return out;
}

const SCHEMAS = {
  working_days: { f: { days: 'n' }, idx: { departmentId: 1, year: 1, month: 1 } },
  temperatures: { f: { outdoor: 'n', indoor: 'n' }, idx: { departmentId: 1, year: 1, month: 1 } },
  co2_emissions: { f: { volume: 'n' }, idx: { departmentId: 1, year: 1, month: 1 } },
  total_costs: { f: { amount: 'n' }, idx: { departmentId: 1, year: 1, month: 1 } },
  own_generation: { f: { quantity: 'n', source: 's' }, idx: { departmentId: 1, resourceId: 1, source: 1, year: 1, month: 1 } }
};
async function recreate(db, name) {
  const { f, idx } = SCHEMAS[name];
  if ((await db.listCollections({ name }).toArray()).length) await db.collection(name).drop();
  const props = { departmentId: { bsonType: 'string' }, year: { bsonType: 'int' }, month: { bsonType: 'int', minimum: 1, maximum: 12 } };
  for (const [k, t] of Object.entries(f)) props[k] = t === 's' ? { bsonType: 'string' } : { bsonType: ['int', 'double'] };
  await db.createCollection(name, { validator: { $jsonSchema: { bsonType: 'object', required: ['departmentId', 'year', 'month'], properties: props } } });
  await db.collection(name).createIndex(idx, { unique: true });
}

/** Створює нові колекції та заповнює їх синтетичними даними (лише якщо ще не створено). */
async function seedIndicators(db, force = false) {
  if (!force && (await db.collection('working_days').countDocuments().catch(() => 0)) > 0) return 0;
  let s = 7; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const agg = await db.collection('consumption').aggregate([{ $group: { _id: { d: '$departmentId', r: '$resourceId', y: '$year', m: '$month' }, qty: { $sum: '$quantity' }, cost: { $sum: '$cost' } } }]).toArray();
  if (!agg.length || agg.some(a => !a._id.m)) throw new Error('consumption порожня або без month – спочатку виконайте міграцію (запустіть сервер).');
  const G = new Map(agg.map(a => [`${a._id.d}|${a._id.r}|${a._id.y}|${a._id.m}`, a]));
  const get = (d, r, y, m, k) => G.get(`${d}|${r}|${y}|${m}`)?.[k] ?? 0;
  const depts = await db.collection('departments').find().toArray(), units = depts.filter(d => d._id !== 'P00');
  const years = [...new Set(agg.map(a => a._id.y))].sort();
  const OUT = [-4, -3, 1, 8, 14, 17, 19, 18.5, 14, 8.5, 3, -1];
  const dayCount = (y, m, six) => { let n = 0; for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) { const w = new Date(y, m - 1, d).getDay(); if (w !== 0 && (six || w !== 6)) n++; } return n; };
  const R1 = x => Math.round(x * 10) / 10, R2 = x => Math.round(x * 100) / 100;
  const docs = { working_days: [], temperatures: [], co2_emissions: [], total_costs: [], own_generation: [] };
  for (const y of years) {
    const yo = (rnd() - .5) * 1.6, outM = OUT.map(t => R1(t + yo + (rnd() - .5) * 2.4));
    for (const d of depts) for (let m = 1; m <= 12; m++) {
      const k = { departmentId: d._id, year: y, month: m };
      docs.working_days.push({ ...k, days: dayCount(y, m, d.type === 'Шахта') - (rnd() < .2 ? 1 : 0) });
      docs.temperatures.push({ ...k, outdoor: outM[m - 1], indoor: R1(19 + rnd() * 2) });
    }
  }
  for (const d of units) for (const y of years) {
    const sh = .22 + rnd() * .2;
    for (let m = 1; m <= 12; m++) {
      const k = { departmentId: d._id, year: y, month: m };
      let co2 = 0, ec = 0;
      for (const r of Object.keys(GJ)) { co2 += get(d._id, r, y, m, 'qty') * (EF[r] ?? 0); ec += get(d._id, r, y, m, 'cost'); }
      docs.co2_emissions.push({ ...k, volume: R2(co2 * (.95 + rnd() * .1)) });
      docs.total_costs.push({ ...k, amount: Math.round(ec / sh) });
      if (d.type === 'Шахта') {
        docs.own_generation.push({ ...k, resourceId: 'HEAT', source: 'own', quantity: R2(get(d._id, 'HEAT', y, m, 'qty') * (.15 + rnd() * .15)) });
        docs.own_generation.push({ ...k, resourceId: 'EL', source: 'secondary', quantity: Math.round(get(d._id, 'EL', y, m, 'qty') * (.03 + rnd() * .05)) });
      }
    }
  }
  for (const [name, list] of Object.entries(docs)) { await recreate(db, name); await db.collection(name).insertMany(list); }
  return Object.values(docs).reduce((a, l) => a + l.length, 0);
}

// ключ -> колекція, поле та додаткові ознаки запису (для ручного введення даних)
function kinds(db) {
  const c = n => db.collection(n);
  return {
    days: { c: c('working_days'), f: 'days' }, temp_out: { c: c('temperatures'), f: 'outdoor' }, temp_in: { c: c('temperatures'), f: 'indoor' },
    co2: { c: c('co2_emissions'), f: 'volume' }, costs: { c: c('total_costs'), f: 'amount' },
    gen_heat: { c: c('own_generation'), f: 'quantity', extra: { resourceId: 'HEAT', source: 'own' } },
    gen_el: { c: c('own_generation'), f: 'quantity', extra: { resourceId: 'EL', source: 'secondary' } }
  };
}

async function register(app, db, h) {
  const n = await seedIndicators(db);
  if (n) console.log(`Лаб. №2: створено колекції індикаторів, записів: ${n}`);
  const K = kinds(db), D = db.collection('departments'), C = db.collection('consumption'), P = db.collection('production');
  const kind = req => { const k = K[req.params.kind]; if (!k) throw new Error('невідомий вид даних'); return k; };

  // ручне введення: 12 значень за рік
  app.get('/api/monthly/:kind', h(async req => {
    const k = kind(req), a = Array(12).fill(null);
    for (const x of await k.c.find({ departmentId: req.query.departmentId, year: +req.query.year, ...k.extra }).toArray()) a[x.month - 1] = x[k.f] ?? null;
    return a;
  }));
  app.put('/api/monthly/:kind', h(async req => {
    const k = kind(req), { departmentId, year, month, value } = req.body, m = +month;
    if (!(m >= 1 && m <= 12)) throw new Error('month має бути 1..12');
    await k.c.updateOne({ departmentId, year: +year, month: m, ...k.extra }, { $set: { [k.f]: +value || 0 } }, { upsert: true });
  }));

  // розрахунок індикаторів: ?year=2025&departmentId=P01|all
  app.get('/api/indicators', h(async req => {
    const year = +req.query.year, dep = req.query.departmentId || 'all';
    if (!Number.isInteger(year)) throw new Error('year обов’язковий');
    const all = await D.find().toArray(), units = all.filter(d => d._id !== 'P00');
    const ids = dep === 'all' ? units.map(d => d._id) : [dep], cal = dep === 'all' ? 'P00' : dep;
    const series = async (col, f) => { const a = Array(12).fill(null); for (const x of await col.find({ departmentId: cal, year }).toArray()) a[x.month - 1] = x[f]; return a; };
    const monthly = async (col, f) => { const a = arr(); for (const x of await col.find({ departmentId: { $in: ids }, year }).toArray()) a[x.month - 1] += x[f] ?? 0; return a; };
    const cons = (await C.aggregate([{ $match: { year, departmentId: { $in: ids } } }, { $group: { _id: { r: '$resourceId', m: '$month', t: '$consumerType' }, qty: { $sum: '$quantity' }, cost: { $sum: '$cost' } } }]).toArray())
      .map(x => ({ r: x._id.r, m: x._id.m, t: x._id.t, qty: x.qty, cost: x.cost }));
    const res = Object.fromEntries((await db.collection('resources').find().toArray()).map(r => [r._id, { name: r.name, unit: r.unit }]));
    return compute({
      year, cons, res, area: units.filter(d => ids.includes(d._id)).reduce((s, d) => s + (d.heatedArea || 0), 0),
      days: await series(db.collection('working_days'), 'days'), out: await series(db.collection('temperatures'), 'outdoor'), inn: await series(db.collection('temperatures'), 'indoor'),
      tons: (await P.find({ departmentId: { $in: ids }, year }).toArray()).reduce((s, x) => s + x.tons, 0),
      co2: await monthly(db.collection('co2_emissions'), 'volume'), costs: await monthly(db.collection('total_costs'), 'amount'),
      gen: (await db.collection('own_generation').find({ departmentId: { $in: ids }, year }).toArray()).map(x => ({ r: x.resourceId, m: x.month, qty: x.quantity }))
    });
  }));
}

module.exports = { register, compute, seedIndicators };

if (require.main === module) { // примусове перестворення: node indicators.js
  const { MongoClient } = require('mongodb');
  (async () => {
    const c = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017');
    console.log('Записів:', await seedIndicators(c.db(process.env.MONGO_DB || 'energy_passport'), true)); await c.close();
  })().catch(e => { console.error(e); process.exit(1); });
}
