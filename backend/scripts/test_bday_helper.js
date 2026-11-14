const db = require('../db');

function parseDob(dobStr) {
  if (!dobStr) return null;
  const s = dobStr.trim();
  let day, month, year;
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length === 3) {
      if (p[0].length === 4) { year = parseInt(p[0], 10); month = parseInt(p[1], 10); day = parseInt(p[2], 10); }
      else { day = parseInt(p[0], 10); month = parseInt(p[1], 10); year = parseInt(p[2], 10); }
    }
  } else if (s.includes('-')) {
    const p = s.split('-');
    if (p.length === 3) {
      if (p[0].length === 4) { year = parseInt(p[0], 10); month = parseInt(p[1], 10); day = parseInt(p[2], 10); }
      else { day = parseInt(p[0], 10); month = parseInt(p[1], 10); year = parseInt(p[2], 10); }
    }
  }
  if (!day || !month || isNaN(day) || isNaN(month) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
}

async function getUpcomingBirthdaysList(daysAhead = 3) {
  const rows = await db.allAsync("SELECT id, skinssence_id, first_name, last_name, mobile, dob FROM patients WHERE dob IS NOT NULL AND dob != ''");
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  const currentMonth = istDate.getMonth() + 1;
  const currentDay = istDate.getDate();
  const currentYear = istDate.getFullYear();

  const list = [];
  rows.forEach(p => {
    const parsed = parseDob(p.dob);
    if (!parsed) return;
    const bdayThisYear = new Date(currentYear, parsed.month - 1, parsed.day);
    let diffDays = Math.round((bdayThisYear.setHours(0,0,0,0) - new Date(currentYear, currentMonth - 1, currentDay, 0,0,0,0).getTime()) / (1000 * 60 * 60 * 24));
    
    // If it already passed earlier this year, check next year
    if (diffDays < 0) {
      const bdayNextYear = new Date(currentYear + 1, parsed.month - 1, parsed.day);
      diffDays = Math.round((bdayNextYear.setHours(0,0,0,0) - new Date(currentYear, currentMonth - 1, currentDay, 0,0,0,0).getTime()) / (1000 * 60 * 60 * 24));
    }

    if (diffDays >= 0 && diffDays <= daysAhead) {
      list.push({
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

  list.sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name));
  return list;
}

async function verify() {
  const bdays = await getUpcomingBirthdaysList(3);
  console.log('Upcoming birthdays (0 to 3 days):', bdays.length);
  bdays.forEach(b => console.log(`${b.is_today ? 'TODAY 🎂' : 'in ' + b.days_until + 'd'}: ${b.name} (${b.mobile}) - Age: ${b.turning_age}`));
  process.exit(0);
}

verify().catch(console.error);
