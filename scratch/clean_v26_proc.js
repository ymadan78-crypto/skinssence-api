const db = require('../backend/db');

db.run("DELETE FROM procedures WHERE visit_id = 26", function(err) {
  if (err) console.error(err);
  else console.log('Cleaned dummy procedure 17 from visit 26, changes:', this.changes);
});
