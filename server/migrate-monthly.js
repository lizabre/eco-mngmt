// Перетворює річні записи consumption (без поля month) на 12 помісячних.
// Ідемпотентно: чіпає лише документи, де month відсутній. Запускається і при старті сервера, і вручну:
//   node migrate-monthly.js
const { MongoClient } = require('mongodb');
const { splitByMonths, round2 } = require('./months');

async function migrateMonthly(db) {
  const C = db.collection('consumption');

  // Унікальні індекси на кшталт (consumerId, resourceId, year) блокують 12 записів на рік:
  // замінюємо їх на такі самі, але з month.
  for (const ix of await C.indexes()) {
    if (ix.unique && ix.key.year && !ix.key.month && ix.name !== '_id_') {
      await C.dropIndex(ix.name);
      await C.createIndex({ ...ix.key, month: 1 }, { unique: true });
      console.log(`Індекс ${ix.name} замінено на унікальний з month`);
    }
  }

  const legacy = await C.find({ month: { $exists: false } }).toArray();
  if (!legacy.length) return 0;

  // залишки попередньої невдалої спроби (записи з month для тих самих ключів) прибираємо
  await C.bulkWrite(legacy.map(o => ({
    deleteMany: { filter: { departmentId: o.departmentId, consumerId: o.consumerId, resourceId: o.resourceId, year: o.year, month: { $exists: true } } }
  })), { ordered: false });

  const docs = [];
  for (const old of legacy) {
    const { _id, ...rest } = old;
    const parts = splitByMonths(old.resourceId, old.quantity || 0);
    parts.forEach((quantity, i) => docs.push({ ...rest, month: i + 1, quantity, cost: round2(quantity * (old.price || 0)) }));
  }
  for (let i = 0; i < docs.length; i += 5000) await C.insertMany(docs.slice(i, i + 5000));
  await C.deleteMany({ _id: { $in: legacy.map(d => d._id) } });
  await C.createIndex({ departmentId: 1, resourceId: 1, year: 1, month: 1 });
  await db.collection('energy_output').createIndex({ departmentId: 1, resourceId: 1, year: 1, month: 1, kind: 1 });
  return legacy.length;
}

module.exports = { migrateMonthly };

if (require.main === module) {
  (async () => {
    const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017');
    const n = await migrateMonthly(client.db(process.env.MONGO_DB || 'energy_passport'));
    console.log(`Перетворено річних записів: ${n}`);
    await client.close();
  })().catch(e => { console.error(e); process.exit(1); });
}