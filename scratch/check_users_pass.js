const db = require('../backend/db');

async function test() {
  const users = await db.allAsync("SELECT id, username, password, role, name FROM users");
  console.log('Users:');
  users.forEach(u => console.log(u.id, u.username, u.role, u.password?.substring(0, 15)));
}

test().catch(console.error);
