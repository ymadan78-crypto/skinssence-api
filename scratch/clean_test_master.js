const db = require('../backend/db');

db.run("DELETE FROM master_procedures WHERE id = 17", function(err) {
  if (err) console.error(err);
  else console.log('Cleaned test master procedure 17, changes:', this.changes);
});
