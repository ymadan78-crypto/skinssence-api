async function testApi() {
  try {
    console.log('1. Logging in as admin to get token...');
    const loginRes = await fetch('https://skinssence-api.onrender.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'password123'
      })
    });
    
    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`Login failed (${loginRes.status}): ${errText}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('Login success! Role:', loginData.role, 'User:', loginData.name);

    console.log('2. Calling /api/inventory/analytics on live Render...');
    const analyticsRes = await fetch('https://skinssence-api.onrender.com/api/inventory/analytics', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Analytics HTTP status:', analyticsRes.status);
    if (!analyticsRes.ok) {
      const errText = await analyticsRes.text();
      console.error('Analytics failed with body:', errText);
      return;
    }
    const analyticsData = await analyticsRes.json();
    console.log('Analytics response summary:', analyticsData.summary);
    console.log('All sorted count:', analyticsData.allSorted ? analyticsData.allSorted.length : 'N/A');
    if (analyticsData.allSorted && analyticsData.allSorted.length > 0) {
      console.log('Sample first 3 items:', analyticsData.allSorted.slice(0, 3));
    }
  } catch (err) {
    console.error('API Error:', err.message);
  }
}

testApi();
