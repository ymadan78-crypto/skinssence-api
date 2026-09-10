const db = require('../backend/db');

db.all("SELECT id, username, role, name FROM users", [], (err, rows) => {
  console.log('Users in DB:', rows);
});
