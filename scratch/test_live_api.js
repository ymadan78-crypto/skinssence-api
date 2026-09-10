const axios = require('../backend/node_modules/axios');

async function testLiveApi() {
  try {
    const loginRes = await axios.post('https://skinssence-api.onrender.com/api/auth/login', {
      username: 'admin',
      password: 'password123'
    });
    const token = loginRes.data.token;
    console.log('Logged in successfully, token received.');

    // 1. Check GET /api/dashboard/today
    const todayRes = await axios.get('https://skinssence-api.onrender.com/api/dashboard/today', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('1. Live /api/dashboard/today:', todayRes.data);

    // 2. Check GET /api/dashboard/today-visits
    try {
      const visitsRes = await axios.get('https://skinssence-api.onrender.com/api/dashboard/today-visits', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('2. Live /api/dashboard/today-visits:', visitsRes.data);
    } catch (vErr) {
      console.error('2. Live /api/dashboard/today-visits ERROR:', vErr.response ? vErr.response.status : vErr.message);
    }

    // 3. Check GET /api/staff/collection/today
    try {
      const staffColRes = await axios.get('https://skinssence-api.onrender.com/api/staff/collection/today', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('3. Live /api/staff/collection/today:', staffColRes.data);
    } catch (cErr) {
      console.error('3. Live /api/staff/collection/today ERROR:', cErr.response ? cErr.response.status : cErr.message);
    }
  } catch (err) {
    console.error('Login error:', err.response ? err.response.data : err.message);
  }
}

testLiveApi();
