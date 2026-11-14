const db = require('../backend/db');

async function test() {
  const schema = await db.allAsync("PRAGMA table_info(users)");
  console.log('Users columns:', schema.map(c => c.name));
}

test().catch(console.error);
