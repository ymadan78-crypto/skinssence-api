const db = require('../backend/db');

console.log('--- TESTING SEARCH ENDPOINT FOR SHREYA SHOURYA (S1601) ---');

const searchSql = `
  SELECT * FROM patients 
  WHERE skinssence_id LIKE ? OR mobile LIKE ? OR first_name LIKE ? OR last_name LIKE ? 
  LIMIT 50
`;

// Test 1: By S1601
db.all(searchSql, ['%S1601%', '%S1601%', '%S1601%', '%S1601%'], (err, r1) => {
  console.log('\n1. Search by "S1601":', r1);

  // Test 2: By mobile 6376611926
  db.all(searchSql, ['%6376611926%', '%6376611926%', '%6376611926%', '%6376611926%'], (err2, r2) => {
    console.log('\n2. Search by mobile "6376611926":', r2);

    // Test 3: By name Shreya
    db.all(searchSql, ['%Shreya%', '%Shreya%', '%Shreya%', '%Shreya%'], (err3, r3) => {
      console.log(`\n3. Search by "Shreya" found ${r3.length} patients:`);
      r3.forEach(p => console.log(`   - ${p.skinssence_id}: ${p.first_name} ${p.last_name} (${p.mobile})`));
    });
  });
});
