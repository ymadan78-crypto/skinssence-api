const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../mobile/screens/DoctorDashboard.js');
let content = fs.readFileSync(filePath, 'utf8');
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

const target = `<TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('TodayPatients')}>
            <Text style={[styles.listText, { color: '#5C0B0B', fontWeight: 'bold' }]}>👥 Today's Visited Patients & Bills</Text>
          </TouchableOpacity>`;

const replacement = `<TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('TodayPatients')}>
            <Text style={[styles.listText, { color: '#5C0B0B', fontWeight: 'bold' }]}>👥 Today's Visited Patients & Bills</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.listItem, { backgroundColor: '#f0fdf4', paddingHorizontal: 8, borderRadius: 8, marginVertical: 4 }]} onPress={() => setFollowupModalVisible(true)}>
            <Text style={[styles.listText, { color: '#15803d', fontWeight: 'bold' }]}>📋 Staff Daily Operations & Reminders Hub</Text>
          </TouchableOpacity>`;

content = content.replace(target, replacement);

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('DoctorDashboard.js updated!');
