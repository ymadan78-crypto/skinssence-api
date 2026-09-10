const db = require('../backend/db');

db.all("SELECT id, username, password, role, name FROM users", [], (err, rows) => {
  console.log('USERS IN DB (passwords):', rows);
});
