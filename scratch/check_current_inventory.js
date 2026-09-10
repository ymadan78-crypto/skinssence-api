const db = require('../backend/db');

db.all("SELECT * FROM inventory", [], (err, rows) => {
  console.log('CURRENT INVENTORY ROWS IN DB:', rows);
});
