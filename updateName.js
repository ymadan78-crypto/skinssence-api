const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./skinssence.db');
db.run("UPDATE users SET name = 'Dr. Ashima' WHERE role = 'DOCTOR'", (err) => {
  if (err) console.error(err);
  else console.log('Doctor name updated successfully.');
  db.close();
});
