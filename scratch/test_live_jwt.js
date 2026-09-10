const jwt = require('../backend/node_modules/jsonwebtoken');

const JWT_SECRET = 'super_secret_jwt_key_for_local_testing';
const token = jwt.sign({ id: 1, username: 'admin', role: 'DOCTOR', name: 'Dr. Ashima' }, JWT_SECRET, { expiresIn: '7d' });

async function testLiveApi() {
  console.log('--- TESTING LIVE RENDER API WITH DOCTOR JWT ---');

  // 1. Check GET /api/dashboard/today
  const todayRes = await fetch('https://skinssence-api.onrender.com/api/dashboard/today', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('1. /api/dashboard/today status:', todayRes.status);
  const todayData = await todayRes.json();
  console.log('   Today Data:', todayData);

  // 2. Check GET /api/dashboard/today-visits
  const visitsRes = await fetch('https://skinssence-api.onrender.com/api/dashboard/today-visits', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('\n2. /api/dashboard/today-visits status:', visitsRes.status);
  if (visitsRes.status === 200) {
    const visitsData = await visitsRes.json();
    console.log('   Visits Data:', JSON.stringify(visitsData, null, 2));
  } else {
    const errText = await visitsRes.text();
    console.log('   Visits Error Response:', errText);
  }

  // 3. Check GET /api/staff/collection/today
  const staffColRes = await fetch('https://skinssence-api.onrender.com/api/staff/collection/today', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('\n3. /api/staff/collection/today status:', staffColRes.status);
  if (staffColRes.status === 200) {
    const colData = await staffColRes.json();
    console.log('   Staff Collection Data:', JSON.stringify(colData, null, 2));
  }

  // 4. Check GET /api/reports/daily
  const reportsRes = await fetch('https://skinssence-api.onrender.com/api/reports/daily?date=2026-09-03', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('\n4. /api/reports/daily status:', reportsRes.status);
  if (reportsRes.status === 200) {
    const repData = await reportsRes.json();
    console.log('   Reports Data:', JSON.stringify(repData, null, 2));
  }
}

testLiveApi();
