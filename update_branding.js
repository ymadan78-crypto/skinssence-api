const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Spelling fixes
    content = content.replace(/SkinSense/g, 'Skinssence');
    content = content.replace(/skinsense/g, 'skinssence');
    
    // Color branding fixes based on the logo
    // Changing standard blues to the deep maroon from the Skinssence logo
    content = content.replace(/#3b82f6/g, '#5C0B0B'); // Primary blue -> Deep Maroon
    content = content.replace(/#1e3a8a/g, '#3A0707'); // Dark blue -> Darker Maroon
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated: ' + filePath);
}

const files = [
    'backend/server.js',
    'backend/db.js',
    'mobile/screens/LoginScreen.js',
    'mobile/screens/StaffDashboard.js',
    'mobile/screens/DoctorDashboard.js',
    'mobile/screens/PatientRegistrationScreen.js'
];

files.forEach(f => replaceInFile(path.join(__dirname, f)));
