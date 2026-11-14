const db = require('../db');

async function test() {
  const allDobs = await db.allAsync("SELECT dob FROM patients WHERE dob IS NOT NULL AND dob != '' LIMIT 100");
  const patterns = new Set();
  allDobs.forEach(r => {
    if (r.dob) {
      if (r.dob.includes('/')) patterns.add('slash: ' + r.dob);
      else if (r.dob.includes('-')) patterns.add('dash: ' + r.dob);
      else patterns.add('other: ' + r.dob);
    }
  });
  console.log('Sample patterns (first 20):', Array.from(patterns).slice(0, 20));
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
