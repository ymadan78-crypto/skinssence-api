const jwt = require('jsonwebtoken');
const https = require('https');

const JWT_SECRET = process.env.JWT_SECRET || 'skinssence_jwt_secret_key_2026';
const token = jwt.sign(
  { id: 1, username: 'admin', role: 'ADMIN', name: 'Dr. Yogendra' },
  JWT_SECRET,
  { expiresIn: '1d' }
);

function testUrl(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'skinssence-api-1.onrender.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('--- 1. Testing GET /api/sessions/status?date=2026-11-13 ---');
  const sessRes = await testUrl('/api/sessions/status?date=2026-11-13');
  console.log('Status:', sessRes.status);
  console.log('Response:', JSON.stringify(sessRes.body, null, 2));

  console.log('\n--- 2. Testing GET /api/admin/diary?date=2026-11-13 ---');
  const diaryRes = await testUrl('/api/admin/diary?date=2026-11-13');
  console.log('Status:', diaryRes.status);
  if (diaryRes.body) {
    console.log('Diary Date:', diaryRes.body.date);
    console.log('Diary Active Session:', diaryRes.body.active_session_num, diaryRes.body.active_session_name);
    console.log('Financial Reports:', JSON.stringify(diaryRes.body.financial_reports, null, 2));
    console.log('Timeline Items Count:', (diaryRes.body.timeline || []).length);
    // Find any consolidated medicine item in timeline
    const medTimelineItems = (diaryRes.body.timeline || []).filter(i => i.category === 'MEDICINES');
    console.log('Consolidated Medicine Items Count:', medTimelineItems.length);
    if (medTimelineItems.length > 0) {
      console.log('Sample Consolidated Med Item:', JSON.stringify(medTimelineItems[0], null, 2));
    }
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
