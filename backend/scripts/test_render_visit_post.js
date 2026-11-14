const jwt = require('jsonwebtoken');
const https = require('https');

const JWT_SECRET = 'super_secret_jwt_key_for_local_testing';
const staffToken = jwt.sign({ id: 2, username: 'staff', role: 'STAFF', name: 'Receptionist' }, JWT_SECRET, { expiresIn: '1d' });

function testPostVisit() {
  const payload = JSON.stringify({
    patient_id: 2878,
    procedure_name: 'Consultation & HydraFacial',
    procedure_amount: 3300,
    payment_mode: 'UPI',
    amount_received: 3300,
    procedures: [{ name: 'HydraFacial', amount: 3300 }]
  });

  const req = https.request({
    hostname: 'skinssence-api-1.onrender.com',
    path: '/api/visits',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${staffToken}`
    }
  }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      console.log('Live Render POST /api/visits status:', res.statusCode);
      try {
        console.log('Response:', JSON.parse(d));
      } catch (e) {
        console.log('Raw:', d);
      }
    });
  });

  req.on('error', err => console.error('Request error:', err.message));
  req.write(payload);
  req.end();
}

testPostVisit();
