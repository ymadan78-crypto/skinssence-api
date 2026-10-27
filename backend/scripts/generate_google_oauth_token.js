/**
 * Helper script to generate a persistent Google OAuth2 Refresh Token for personal @gmail.com accounts.
 * Run via: node scripts/generate_google_oauth_token.js <CLIENT_ID> <CLIENT_SECRET>
 */
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const clientId = process.argv[2] || process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.argv[3] || process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.log(`
========================================================================
 Google Contacts 1-Time Authorization Helper
========================================================================
Usage:
  node scripts/generate_google_oauth_token.js <CLIENT_ID> <CLIENT_SECRET>

Or ensure GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are in .env
========================================================================
  `);
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3847/oauth2callback';
const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/contacts']
});

console.log('\n========================================================================');
console.log('1. Open this URL in your web browser:');
console.log(authUrl);
console.log('========================================================================\n');
console.log('Waiting for authorization in browser on http://localhost:3847 ...');

// Automatically open in default browser on Windows
try {
  require('child_process').exec(`start "" "${authUrl}"`);
} catch (e) {}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const q = url.parse(req.url, true).query;
    if (q.code) {
      try {
        const { tokens } = await oauth2Client.getToken(q.code);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Google Contacts Authorization Successful!</h2><p>You can close this window now. The backend is configured.</p>');
        server.close();

        console.log('\n✅ Authorization SUCCESSFUL!');
        console.log('Refresh Token received.');

        // Append or update .env file
        const envPath = path.join(__dirname, '../.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        
        const updateOrAppend = (key, val) => {
          const regex = new RegExp(`^${key}=.*$`, 'm');
          if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${val}`);
          } else {
            envContent += `\r\n${key}=${val}`;
          }
        };

        updateOrAppend('GOOGLE_OAUTH_CLIENT_ID', clientId);
        updateOrAppend('GOOGLE_OAUTH_CLIENT_SECRET', clientSecret);
        updateOrAppend('GOOGLE_OAUTH_REFRESH_TOKEN', tokens.refresh_token);

        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log('✅ Credentials saved to backend/.env automatically!');
        console.log('Real-time Google Contacts sync is now ACTIVE for all new patients.');
        process.exit(0);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authorization Failed</h2><p>${e.message}</p>`);
        console.error('Error exchanging code for tokens:', e.message);
        process.exit(1);
      }
    }
  }
}).listen(3847);
