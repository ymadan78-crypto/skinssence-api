const db = require('../backend/db');

db.run("DELETE FROM payments WHERE visit_id > 26", () => {
  db.run("DELETE FROM medicines WHERE visit_id > 26", () => {
    db.run("DELETE FROM procedures WHERE visit_id > 26", () => {
      db.run("DELETE FROM visits WHERE id > 26", function(err) {
        console.log('Cleaned test visits > 26, changes:', this ? this.changes : 0);
      });
    });
  });
});
