const { createClient } = require('@libsql/client');
require('dotenv').config();
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("TABLES:", tables.rows.map(x => x.name).join(', '));
  
  // Try to find procedure-related tables
  const procTables = tables.rows.filter(x => x.name.toLowerCase().includes('proc') || x.name.toLowerCase().includes('service') || x.name.toLowerCase().includes('treatment'));
  console.log("PROC-RELATED:", procTables.map(x => x.name).join(', '));
}
main().catch(e => console.error('ERR:', e.message));
