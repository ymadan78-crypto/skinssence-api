const jwt = require('jsonwebtoken');
const https = require('https');
require('dotenv').config();

const token = jwt.sign({ id: 1, username: 'admin', role: 'DOCTOR' }, process.env.JWT_SECRET);

console.log('Sending request to https://skinssence-api.onrender.com/api/inventory/analytics ...');

const req = https.request('https://skinssence-api.onrender.com/api/inventory/analytics', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Response body:', body.substring(0, 300));
  });
});

req.on('error', e => console.error('Error:', e.message));
req.end();
