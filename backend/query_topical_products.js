const { createClient } = require('@libsql/client');
require('dotenv').config({ path: 'backend/.env' });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  try {
    const res = await db.execute("SELECT id, name, category, default_instructions, mrp, quantity FROM medicines ORDER BY category, name");
    console.log(`TOTAL MEDICINES: ${res.rows.length}`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  }
}

main();
