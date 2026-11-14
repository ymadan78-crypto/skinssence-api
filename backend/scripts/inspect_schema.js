const db = require('../db');

async function test() {
  const tables = await db.allAsync("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:\n', tables.map(t => t.name).join(', '));
  const patientCols = await db.allAsync('PRAGMA table_info(patients)');
  console.log('\nPatient cols:\n', patientCols.map(c => c.name).join(', '));
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
