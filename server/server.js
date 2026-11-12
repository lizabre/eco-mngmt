const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { splitByMonths, round2 } = require('./months');
const { migrateMonthly } = require('./migrate-monthly');

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB = process.env.MONGO_DB || 'energy_passport';
const PORT = process.env.PORT || 3000;
const app = express(); app.use(cors()); app.use(express.json());
const h = fn => (req, res) => fn(req).then(r => res.json(r ?? { ok: true })).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });

(async () => {
  const db = (await MongoClient.connect(URI)).db(DB);
  const [D, B, E, R, T, L, C, P, O] = ['departments', 'buildings', 'equipment', 'resources', 'tariffs', 'limits', 'consumption', 'production', 'energy_output'].map(n => db.collection(n));

  // старі річні записи consumption (без month) автоматично розбиваються на місяці
  const migrated = await migrateMonthly(db);
  if (migrated) console.log(`Міграція: ${migrated} річних записів розбито на місяці`);

  // ---- усі дані у форматі, який очікує Angular ----
  app.get('/api/data', h(async () => {
    const maxYear = (await T.find().sort({ year: -1 }).limit(1).next())?.year;
    const tariffs = await T.find({ year: maxYear }).toArray();
    const price = Object.fromEntries(tariffs.map(t => [t.resourceId, t.price]));
    const cons = await C.aggregate([{ $group: { _id: { d: '$departmentId', r: '$resourceId', y: '$year' }, qty: { $sum: '$quantity' }, type: { $min: '$dataType' } } }]).toArray();
    return {
      departments: (await D.find().toArray()).map(d => ({ id: d._id, name: d.name, type: d.type, parentId: d.parentId, area: d.heatedArea ?? null })),
      resources: (await R.find().toArray()).map(r => ({ id: r._id, name: r.name, unit: r.unit, tariff: price[r._id] ?? 0 })),
      limits: (await L.find().toArray()).map(l => ({ d: l.departmentId, r: l.resourceId, min: l.min, max: l.max, base: l.base })),
      consumption: cons.map(c => ({ d: c._id.d, r: c._id.r, year: c._id.y, qty: Math.round(c.qty * 100) / 100, type: c.type })),
      production: (await P.find().toArray()).map(p => ({ d: p.departmentId, year: p.year, tons: p.tons }))
    };
  }));

  // ---- підрозділи ----
  app.post('/api/departments', h(async req => {
    const { id, name, type, parentId, area } = req.body;
    await D.insertOne({ _id: id, name, type, parentId: parentId || '0', heatedArea: area ?? null });
  }));
  app.delete('/api/departments/:id', h(async req => {
    const id = req.params.id;
    await Promise.all([D.deleteOne({ _id: id }), B.deleteMany({ departmentId: id }), E.deleteMany({ departmentId: id }),
      L.deleteMany({ departmentId: id }), P.deleteMany({ departmentId: id }), C.deleteMany({ departmentId: id }), O.deleteMany({ departmentId: id })]);
  }));

  // ---- ресурси і тарифи ----
  app.post('/api/resources', h(async req => {
    const { id, name, unit, tariff } = req.body;
    await R.insertOne({ _id: id, name, unit });
    const year = (await T.find().sort({ year: -1 }).limit(1).next())?.year ?? 2025;
    await T.insertOne({ resourceId: id, year, price: +tariff || 0 });
  }));
  app.delete('/api/resources/:id', h(async req => {
    const id = req.params.id;
    await Promise.all([R.deleteOne({ _id: id }), T.deleteMany({ resourceId: id }), L.deleteMany({ resourceId: id }), C.deleteMany({ resourceId: id }), O.deleteMany({ resourceId: id })]);
  }));
  app.put('/api/resources/:id/tariff', h(async req => {
    const id = req.params.id, price = Math.max(0, +req.body.tariff || 0);
    const year = (await T.find().sort({ year: -1 }).limit(1).next())?.year ?? 2025;
    await T.updateOne({ resourceId: id, year }, { $set: { price } }, { upsert: true });
    await C.updateMany({ resourceId: id, year }, [{ $set: { price } }, { $set: { cost: { $multiply: ['$quantity', '$price'] } } }]);
  }));

  // ---- споживання: значення підрозділу пропорційно розподіляється між його споживачами ----
  // month (1..12) задано -> змінюється лише цей місяць;
  // month не задано -> річне значення розбивається по місяцях із сезонними коефіцієнтами
  async function setDeptCons(d, r, year, qty, type, month) {
    qty = Math.max(0, +qty || 0);
    if (!month) {
      const parts = splitByMonths(r, qty);
      for (let m = 1; m <= 12; m++) await setDeptCons(d, r, year, parts[m - 1], type, m);
      return;
    }
    const f = { departmentId: d, resourceId: r, year, month };
    const total = (await C.aggregate([{ $match: f }, { $group: { _id: null, t: { $sum: '$quantity' } } }]).toArray())[0]?.t || 0;
    if (total > 0) {
      await C.updateMany(f, [{ $set: { quantity: { $multiply: ['$quantity', qty / total] }, dataType: type } },
        { $set: { cost: { $multiply: ['$quantity', '$price'] } } }]);
    } else if (qty > 0) {
      const res = await R.findOne({ _id: r });
      const price = (await T.findOne({ resourceId: r, year }))?.price ?? (await T.find({ resourceId: r }).sort({ year: -1 }).limit(1).next())?.price ?? 0;
      await C.deleteMany(f);
      await C.insertOne({ ...f, consumerType: 'department', consumerId: d, quantity: qty, unit: res?.unit ?? '', price, cost: qty * price, dataType: type });
    }
  }
  const checkMonth = m => { if (m != null && !(Number.isInteger(+m) && m >= 1 && m <= 12)) throw new Error('month має бути 1..12'); return m == null ? undefined : +m; };
  app.put('/api/consumption', h(async req => { const { d, r, year, qty, month } = req.body; await setDeptCons(d, r, year, qty, 'manual', checkMonth(month)); }));
  app.put('/api/consumption/bulk', h(async req => { for (const x of req.body) await setDeptCons(x.d, x.r, x.year, x.qty, x.type || 'synthetic', checkMonth(x.month)); }));

  // ---- виробництво / продаж енергії (помісячно) ----
  // kind: 'production' | 'sales'
  app.put('/api/energy-output', h(async req => {
    const { d, r, year, month, kind, qty } = req.body;
    if (!['production', 'sales'].includes(kind)) throw new Error("kind має бути 'production' або 'sales'");
    const m = checkMonth(month); if (!m) throw new Error('month обов’язковий');
    await O.updateOne({ departmentId: d, resourceId: r, year: +year, month: m, kind },
      { $set: { quantity: Math.max(0, +qty || 0), dataType: 'manual' } }, { upsert: true });
  }));

  // ---- таблиця «Рік / Ресурс / Січень … Грудень / Усього за рік» ----
  // GET /api/passport?year=2023[&departmentId=P01]  (без departmentId — все підприємство)
  const PASSPORT_ROWS = [
    { key: 'el_cons',   label: 'Споживання електроенергії',               src: 'cons', r: 'EL',   kind: 'qty' },
    { key: 'el_cost',   label: 'Витрати на електроенергію',               src: 'cons', r: 'EL',   kind: 'cost' },
    { key: 'el_prod',   label: 'Виробництво електроенергії',              src: 'out',  r: 'EL',   kind: 'production' },
    { key: 'el_pcost',  label: 'Витрати на виробництво електроенергії',   src: 'out',  r: 'EL',   kind: 'production', cost: true },
    { key: 'heat_cons', label: 'Споживання теплової енергії',             src: 'cons', r: 'HEAT', kind: 'qty' },
    { key: 'heat_cost', label: 'Витрати на теплову енергію',              src: 'cons', r: 'HEAT', kind: 'cost' },
    { key: 'heat_prod', label: 'Виробництво теплової енергії (продаж)',   src: 'out',  r: 'HEAT', kind: 'production' },
    { key: 'heat_sale', label: 'Обсяги продажів теплової енергії',        src: 'out',  r: 'HEAT', kind: 'sales' },
    { key: 'gas_cons',  label: 'Споживання газу',                         src: 'cons', r: 'GAS',  kind: 'qty' },
    { key: 'gas_cost',  label: 'Витрати на газ',                          src: 'cons', r: 'GAS',  kind: 'cost' },
    { key: 'wtr_cons',  label: 'Споживання води',                         src: 'cons', r: 'WTR',  kind: 'qty' },
    { key: 'wtr_cost',  label: 'Витрати на воду',                         src: 'cons', r: 'WTR',  kind: 'cost' }
  ];
  app.get('/api/passport', h(async req => {
    const year = +req.query.year;
    if (!Number.isInteger(year)) throw new Error('year обов’язковий');
    const match = { year };
    const dep = req.query.departmentId;
    if (dep) { // підрозділ + усі його нащадки
      const all = await D.find({}, { projection: { parentId: 1 } }).toArray();
      const ids = new Set([dep]);
      for (let grew = true; grew;) { grew = false; for (const x of all) if (!ids.has(x._id) && ids.has(x.parentId)) { ids.add(x._id); grew = true; } }
      match.departmentId = { $in: [...ids] };
    }
    const [cons, out, tar, res] = await Promise.all([
      C.aggregate([{ $match: match }, { $group: { _id: { r: '$resourceId', m: '$month' }, qty: { $sum: '$quantity' }, cost: { $sum: '$cost' } } }]).toArray(),
      O.aggregate([{ $match: match }, { $group: { _id: { r: '$resourceId', k: '$kind', m: '$month' }, qty: { $sum: '$quantity' } } }]).toArray(),
      T.find({ year }).toArray(),
      R.find().toArray()
    ]);
    const price = Object.fromEntries(tar.map(t => [t.resourceId, t.price]));
    const unit = Object.fromEntries(res.map(r => [r._id, r.unit]));
    const rows = PASSPORT_ROWS.map(def => {
      const months = Array(12).fill(0);
      if (def.src === 'cons') for (const c of cons) { if (c._id.r === def.r && c._id.m >= 1) months[c._id.m - 1] += def.kind === 'cost' ? c.cost : c.qty; }
      else for (const o of out) if (o._id.r === def.r && o._id.k === def.kind && o._id.m >= 1) months[o._id.m - 1] += def.cost ? o.qty * (price[def.r] ?? 0) : o.qty;
      const isMoney = def.kind === 'cost' || def.cost;
      const rounded = months.map(round2);
      return {
        key: def.key, label: def.label, resourceId: def.r, src: def.src, kind: def.kind,
        unit: isMoney ? 'грн' : (unit[def.r] ?? ''), editable: !isMoney,
        months: rounded, total: round2(rounded.reduce((s, v) => s + v, 0))
      };
    });
    return { year, departmentId: dep || null, rows };
  }));

  // ---- виробництво ----
  app.put('/api/production', h(async req => {
    const { d, year, tons } = req.body;
    await P.updateOne({ departmentId: d, year }, { $set: { tons: +tons || 0 } }, { upsert: true });
  }));

  // ---- лабораторна №2: енергетичні індикатори ----
  await require('./indicators').register(app, db, h);

  app.listen(PORT, () => console.log(`API: http://localhost:${PORT}/api/data`));
})().catch(e => { console.error(e); process.exit(1); });
