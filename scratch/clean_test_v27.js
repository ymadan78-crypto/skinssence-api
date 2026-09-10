const db = require('../backend/db');

db.run("DELETE FROM visits WHERE id = 27", function(err) {
  if (!err) console.log('Cleaned test zero visit 27, changes:', this.changes);
});
