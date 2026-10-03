const jwt = require('../backend/node_modules/jsonwebtoken');

const JWT_SECRET = 'process_env_fallback';
const doctorToken = jwt.sign({ id: 1, username: 'admin', role: 'DOCTOR', name: 'Dr. Ashima' }, JWT_SECRET, { expiresIn: '7d' });

async function checkRenderLive() {
  console.log('Checking live Render API...');
  try {
    const res = await fetch('https://skinssence-api.onrender.com/api/procedures/master', {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('First item from live Render:', data[0]);
    if (data[0] && data[0].code) {
      console.log('Render is ALREADY running the new Master Procedure code (has "code" field like', data[0].code, ')!');
    } else {
      console.log('Render has NOT deployed the new code yet (items do not have "code" field). Needs GitHub push & Render deploy.');
    }
  } catch (err) {
    console.error('Error checking Render:', err.message);
  }
}

checkRenderLive();
