const jwt = require('jsonwebtoken');
const https = require('https');

const JWT_SECRET = 'super_secret_jwt_key_for_local_testing';
const adminToken = jwt.sign({ id: 1, username: 'admin', role: 'ADMIN', name: 'Dr. Yogendra' }, JWT_SECRET, { expiresIn: '1d' });
const staffToken = jwt.sign({ id: 2, username: 'staff', role: 'STAFF', name: 'Receptionist' }, JWT_SECRET, { expiresIn: '1d' });

function request(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = https.request({
      hostname: 'skinssence-api-1.onrender.com',
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(d) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: d });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testLiveWorkflow() {
  const testDate = '2026-11-25'; // Future test date

  console.log('1. Staff ends Session 1 for date:', testDate);
  const endS1 = await request('/api/sessions/end', 'POST', { date: testDate, session_number: 1 }, staffToken);
  console.log('End S1 Status:', endS1.status, endS1.body?.message);

  console.log('2. Staff attempts to reopen Session 1 (should fail with 403):');
  const staffReopen = await request('/api/sessions/reopen', 'POST', { date: testDate, session_number: 1, reason: 'Staff tried' }, staffToken);
  console.log('Staff Reopen Status (expect 403):', staffReopen.status, staffReopen.body?.error);

  console.log('3. Admin reopens Session 1 without reason (should fail with 400):');
  const noReasonReopen = await request('/api/sessions/reopen', 'POST', { date: testDate, session_number: 1, reason: '  ' }, adminToken);
  console.log('No-reason Reopen Status (expect 400):', noReasonReopen.status, noReasonReopen.body?.error);

  console.log('4. Admin reopens Session 1 with mandatory reason:');
  const adminReopen = await request('/api/sessions/reopen', 'POST', { date: testDate, session_number: 1, reason: 'Admin authorized billing adjustment' }, adminToken);
  console.log('Admin Reopen Status (expect 200):', adminReopen.status, adminReopen.body?.message);

  process.exit(0);
}

testLiveWorkflow().catch(err => {
  console.error(err);
  process.exit(1);
});
