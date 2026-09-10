const db = require('../backend/db');

db.run("DELETE FROM inventory WHERE medicine_name LIKE 'Test%'", function(err) {
  if (err) return console.error('Delete error:', err);
  console.log('Deleted Test items from inventory, rows affected:', this.changes);

  db.all("SELECT * FROM inventory", [], (err2, rows) => {
    console.log('Remaining inventory items in DB:', rows);
  });
});
