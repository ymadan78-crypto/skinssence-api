const db = require('../backend/db');

db.all("SELECT DISTINCT name, count(*) as count, round(avg(amount),2) as avg_amt FROM procedures GROUP BY name ORDER BY count DESC", [], (err, rows) => {
  if (err) return console.error(err);
  console.log('Unique procedure names in procedures table:', rows.length);
  console.log(rows);
});
