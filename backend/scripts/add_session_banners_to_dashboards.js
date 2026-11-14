const fs = require('fs');

// 1. Update StaffDashboard.js
let staffContent = fs.readFileSync('mobile/screens/StaffDashboard.js', 'utf8');

// Replace canSeeDailyDiary conditional check
staffContent = staffContent.replace(
  /\{canSeeDailyDiary && \(\s*<TouchableOpacity style=\{\[styles\.card, \{ backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1 \}\]\} onPress=\{\(\) => navigation\.navigate\('DailyDiary'\)\}>\s*<Text style=\{\[styles\.cardText, \{ color: '#5C0B0B', fontWeight: 'bold' \}\]\}>📖 Daily Diary<\/Text>\s*<\/TouchableOpacity>\s*\)\}/g,
  `<TouchableOpacity style={[styles.card, { backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1.5 }]} onPress={() => navigation.navigate('DailyDiary')}>
            <Text style={[styles.cardText, { color: '#5C0B0B', fontWeight: 'bold' }]}>📖 Daily Diary & Sessions</Text>
          </TouchableOpacity>`
);
fs.writeFileSync('mobile/screens/StaffDashboard.js', staffContent, 'utf8');
console.log('Updated StaffDashboard.js successfully');

// 2. Update DoctorDashboard.js
let docContent = fs.readFileSync('mobile/screens/DoctorDashboard.js', 'utf8');

// Add session banner on DoctorDashboard right below metrics cards
const docTarget = `{/* METRICS CARDS */}
        <View style={styles.dashboardCards}>`;

const docBanner = `{/* CLINIC OPERATING SESSIONS (SESSION 1 & SESSION 2) BANNER */}
        <TouchableOpacity 
          style={{
            backgroundColor: '#fffbeb',
            borderWidth: 1.5,
            borderColor: '#fde68a',
            borderRadius: 12,
            padding: 14,
            marginHorizontal: 15,
            marginBottom: 12,
            elevation: 2
          }}
          onPress={() => navigation.navigate('DailyDiary')}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="timer" size={19} color="#78350f" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1e293b' }}>
                Clinic Sessions & Financial Ledger
              </Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#b45309' }}>Open Sessions ›</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <View style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#1d4ed8' }}>🌅 Session 1 (Morning)</Text>
            </View>
            <View style={{ backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#7e22ce' }}>🌆 Session 2 (Evening)</Text>
            </View>
            <View style={{ backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#991b1b' }}>Day-Wise Ledger 📖</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* METRICS CARDS */}
        <View style={styles.dashboardCards}>`;

if (!docContent.includes('Clinic Sessions & Financial Ledger')) {
  docContent = docContent.replace(docTarget, docBanner);
  fs.writeFileSync('mobile/screens/DoctorDashboard.js', docContent, 'utf8');
  console.log('Updated DoctorDashboard.js successfully');
}
