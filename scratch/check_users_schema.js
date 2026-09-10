const db = require('../backend/db');

db.all("SELECT * FROM users LIMIT 5", [], (err, rows) => {
  console.log('USERS SCHEMA & ROWS:', rows);
});
