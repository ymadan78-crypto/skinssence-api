async function testLiveApi() {
  try {
    const loginRes = await fetch('https://skinssence-api.onrender.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' })
    });
    const loginData = await loginRes.json();
    console.log('Login Data:', loginData);
    const token = loginData.token;

    // 1. Check GET /api/dashboard/today
    const todayRes = await fetch('https://skinssence-api.onrender.com/api/dashboard/today', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('1. /api/dashboard/today status:', todayRes.status);
    const todayText = await todayRes.text();
    console.log('   Body:', todayText);

    // 2. Check GET /api/dashboard/today-visits
    const visitsRes = await fetch('https://skinssence-api.onrender.com/api/dashboard/today-visits', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('\n2. /api/dashboard/today-visits status:', visitsRes.status);
    const visitsText = await visitsRes.text();
    console.log('   Body:', visitsText);

    // 3. Check GET /api/staff/collection/today
    const staffColRes = await fetch('https://skinssence-api.onrender.com/api/staff/collection/today', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('\n3. /api/staff/collection/today status:', staffColRes.status);
    const colText = await staffColRes.text();
    console.log('   Body:', colText);
  } catch (err) {
    console.error('Error:', err);
  }
}

testLiveApi();
