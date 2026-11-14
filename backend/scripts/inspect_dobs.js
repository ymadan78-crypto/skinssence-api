const db = require('../db');

async function test() {
  const sampleDobs = await db.allAsync("SELECT id, first_name, mobile, dob FROM patients WHERE dob IS NOT NULL AND dob != '' LIMIT 15");
  console.log('Sample DOBs:\n', sampleDobs);
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
