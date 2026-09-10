const db = require('../backend/db');

db.all("SELECT * FROM master_procedures", [], (err, rows) => {
  if (err) return console.error(err);
  console.log('Total Master Procedures:', rows.length);
  console.log(rows);
});
