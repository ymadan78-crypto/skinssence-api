const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_jwt_secret_for_local_offline_testing';
const token = jwt.sign({ id: 1, username: 'admin', role: 'DOCTOR' }, JWT_SECRET, { expiresIn: '7d' });

console.log('Generated Doctor JWT token with correct secret');

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
