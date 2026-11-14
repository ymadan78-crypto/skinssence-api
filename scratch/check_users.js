const db = require('../backend/db');
async function q() {
  const users = await db.allAsync("SELECT id, username, role FROM users");
  console.log('Users in DB:', users);
}
q();
