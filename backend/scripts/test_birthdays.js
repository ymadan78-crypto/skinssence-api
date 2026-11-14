const db = require('../db');

function parseDob(dobStr) {
  if (!dobStr) return null;
  const s = dobStr.trim();
  let day, month, year;
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length === 3) {
      if (p[0].length === 4) { // YYYY/MM/DD
        year = parseInt(p[0], 10);
        month = parseInt(p[1], 10);
        day = parseInt(p[2], 10);
      } else { // DD/MM/YYYY
        day = parseInt(p[0], 10);
        month = parseInt(p[1], 10);
        year = parseInt(p[2], 10);
      }
    }
  } else if (s.includes('-')) {
    const p = s.split('-');
    if (p.length === 3) {
      if (p[0].length === 4) { // YYYY-MM-DD
        year = parseInt(p[0], 10);
        month = parseInt(p[1], 10);
        day = parseInt(p[2], 10);
      } else { // DD-MM-YYYY
        day = parseInt(p[0], 10);
        month = parseInt(p[1], 10);
        year = parseInt(p[2], 10);
      }
    }
  }
  if (!day || !month || isNaN(day) || isNaN(month) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { day, month, year };
}

async function test() {
  const rows = await db.allAsync("SELECT id, skinssence_id, first_name, last_name, mobile, dob FROM patients WHERE dob IS NOT NULL AND dob != ''");
  console.log('Total patients with DOB:', rows.length);
  
  // Current date in IST (UTC + 5:30)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  const currentMonth = istDate.getMonth() + 1; // 1-12
  const currentDay = istDate.getDate();
  const currentYear = istDate.getFullYear();

  console.log(`Current IST Date: ${currentDay}/${currentMonth}/${currentYear}`);

  const upcoming = [];
  rows.forEach(p => {
    const parsed = parseDob(p.dob);
    if (!parsed) return;

    // Check distance in days (within next 7 days for testing)
    // Create Date object for this year's birthday
    const bdayThisYear = new Date(currentYear, parsed.month - 1, parsed.day);
    // If birthday has passed this year, check next year
    let targetBday = bdayThisYear;
    const diffMs = targetBday.setHours(0,0,0,0) - new Date(currentYear, currentMonth - 1, currentDay, 0,0,0,0).getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= 7) {
      upcoming.push({
        id: p.id,
        skinssence_id: p.skinssence_id,
        name: `${p.first_name} ${p.last_name || ''}`.trim(),
        mobile: p.mobile,
        dob: p.dob,
        is_today: diffDays === 0,
        days_until: diffDays,
        turning_age: parsed.year ? currentYear - parsed.year : null
      });
    }
  });

  upcoming.sort((a, b) => a.days_until - b.days_until);
  console.log('Upcoming birthdays (next 7 days):', upcoming.length);
  console.log(upcoming.slice(0, 10));
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
