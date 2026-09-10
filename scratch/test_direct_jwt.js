const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'skinssence_secret_key_2026';
const token = jwt.sign({ id: 1, username: 'admin', role: 'DOCTOR' }, JWT_SECRET, { expiresIn: '7d' });

console.log('Generated Doctor JWT token:', token);

async function testWithToken() {
  try {
    console.log('Calling /api/inventory/analytics on live Render...');
    const res = await fetch('https://skinssence-api.onrender.com/api/inventory/analytics', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('HTTP Status:', res.status);
    const text = await res.text();
    console.log('Response body:', text);
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

testWithToken();
