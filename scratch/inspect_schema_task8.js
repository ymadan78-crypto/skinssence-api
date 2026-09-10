const db = require('../backend/db');

console.log('--- INSPECTING DATABASE ARCHITECTURE FOR TASK 8 ---');

db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", [], (err, tables) => {
  if (err) return console.error(err);
  console.log('Total Tables in Turso DB:', tables.length);
  tables.forEach(t => {
    console.log(`\nTABLE: [${t.name}]`);
    console.log(t.sql);
  });
});
