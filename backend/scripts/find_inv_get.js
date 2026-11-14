const fs = require('fs');
const s = fs.readFileSync('server.js', 'utf8');
const lines = s.split('\n');
lines.forEach((l, i) => {
  if (l.includes("app.get('/api/inventory")) {
    console.log(i + 1, l);
  }
});
