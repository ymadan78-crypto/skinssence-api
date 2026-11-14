const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../mobile/screens/StaffDashboard.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize CRLF to LF
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Add states
content = content.replace(
  '  const [pendingFollowupPatients, setPendingFollowupPatients] = useState([]);',
  `  const [pendingFollowupPatients, setPendingFollowupPatients] = useState([]);
  const [birthdaysTodayCount, setBirthdaysTodayCount] = useState(0);
  const [reviewsPendingCount, setReviewsPendingCount] = useState(0);
  const [summarySubmitted, setSummarySubmitted] = useState(false);
  const [initialModalTab, setInitialModalTab] = useState('followups');`
);

// 2. Update checkHourlyReminder
content = content.replace(
  `  const checkHourlyReminder = async (count) => {
    try {
      if (!count || count <= 0) return;
      const lastTime = await AsyncStorage.getItem('@last_followup_reminder_time');
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;
      if (!lastTime || (now - parseInt(lastTime, 10)) >= ONE_HOUR) {
        setFollowupModalVisible(true);
        await AsyncStorage.setItem('@last_followup_reminder_time', now.toString());
      }
    } catch (e) {
      console.log('Error checking hourly reminder', e);
    }
  };`,
  `  const checkHourlyReminder = async (fCount, bCount, rCount, isSummaryDone) => {
    try {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istHours = new Date(now.getTime() + istOffset).getUTCHours();
      const isEvening = istHours >= 17; // after 5:00 PM IST

      const hasTasks = (fCount > 0) || (bCount > 0) || (rCount > 0) || (isEvening && !isSummaryDone);
      if (!hasTasks) return;

      const lastTime = await AsyncStorage.getItem('@last_followup_reminder_time');
      const ONE_HOUR = 60 * 60 * 1000;
      if (!lastTime || (Date.now() - parseInt(lastTime, 10)) >= ONE_HOUR) {
        setFollowupModalVisible(true);
        await AsyncStorage.setItem('@last_followup_reminder_time', Date.now().toString());
      }
    } catch (e) {
      console.log('Error checking hourly reminder', e);
    }
  };`
);

// 3. Update loadStaffData stats extraction
content = content.replace(
  `        const pCount = todayRes.data.pending_followups_count || 0;
        const pList = todayRes.data.pending_followup_patients || [];
        setPendingFollowupsCount(pCount);
        setPendingFollowupPatients(pList);
        if (pCount > 0) {
          checkHourlyReminder(pCount);
        }`,
  `        const pCount = todayRes.data.pending_followups_count || 0;
        const pList = todayRes.data.pending_followup_patients || [];
        const bCount = todayRes.data.birthdays_today_count || 0;
        const rCount = todayRes.data.reviews_pending_count || 0;
        const sDone = !!todayRes.data.daily_summary_submitted;

        setPendingFollowupsCount(pCount);
        setPendingFollowupPatients(pList);
        setBirthdaysTodayCount(bCount);
        setReviewsPendingCount(rCount);
        setSummarySubmitted(sDone);

        checkHourlyReminder(pCount, bCount, rCount, sDone);`
);

// 4. Update banner
content = content.replace(
  `        {/* PENDING FOLLOW-UP REMINDER BANNER */}
        {pendingFollowupsCount > 0 && (
          <TouchableOpacity 
            style={styles.followupBanner}
            onPress={() => setFollowupModalVisible(true)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={17} color="#334155" style={{ marginRight: 8 }} />
                <Text style={styles.followupBannerTitle}>
                  Follow-ups pending: <Text style={{ fontWeight: 'bold' }}>{pendingFollowupsCount}</Text>
                </Text>
              </View>
              <Text style={styles.followupActionText}>Review ›</Text>
            </View>
          </TouchableOpacity>
        )}`,
  `        {/* STAFF DAILY OPERATIONS & REMINDERS HUB BANNER */}
        <View style={styles.dailyHubCard}>
          <View style={styles.dailyHubHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.hubIconCircle}>
                <Ionicons name="clipboard-outline" size={16} color="#5C0B0B" />
              </View>
              <Text style={styles.dailyHubTitle}>Daily Tasks & Reminders</Text>
            </View>
            <TouchableOpacity onPress={() => { setInitialModalTab('followups'); setFollowupModalVisible(true); }}>
              <Text style={styles.dailyHubOpenAll}>Open Hub ›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.hubPillsRow}>
            <TouchableOpacity 
              style={[styles.hubPill, pendingFollowupsCount > 0 ? styles.hubPillAlert : styles.hubPillSuccess]}
              onPress={() => { setInitialModalTab('followups'); setFollowupModalVisible(true); }}>
              <Text style={styles.hubPillText}>📞 {pendingFollowupsCount} Follow-ups</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.hubPill, birthdaysTodayCount > 0 ? styles.hubPillGold : styles.hubPillMuted]}
              onPress={() => { setInitialModalTab('birthdays'); setFollowupModalVisible(true); }}>
              <Text style={styles.hubPillText}>🎂 {birthdaysTodayCount} Birthdays</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.hubPill, reviewsPendingCount > 0 ? styles.hubPillAlert : styles.hubPillSuccess]}
              onPress={() => { setInitialModalTab('reviews'); setFollowupModalVisible(true); }}>
              <Text style={styles.hubPillText}>⭐ {reviewsPendingCount} Reviews</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.hubPill, summarySubmitted ? styles.hubPillSuccess : styles.hubPillAlert]}
              onPress={() => { setInitialModalTab('summary'); setFollowupModalVisible(true); }}>
              <Text style={styles.hubPillText}>📝 {summarySubmitted ? 'Summary Done' : 'Summary Due'}</Text>
            </TouchableOpacity>
          </View>
        </View>`
);

// 5. Update PendingFollowupReminderModal tag
content = content.replace(
  `      <PendingFollowupReminderModal
        visible={followupModalVisible}
        onClose={() => setFollowupModalVisible(false)}
        navigation={navigation}
        onUpdated={loadStaffData}
        initialPatients={pendingFollowupPatients}
      />`,
  `      <PendingFollowupReminderModal
        visible={followupModalVisible}
        onClose={() => setFollowupModalVisible(false)}
        navigation={navigation}
        onUpdated={loadStaffData}
        initialPatients={pendingFollowupPatients}
        initialTab={initialModalTab}
      />`
);

// 6. Add styles for hub
const stylesToAdd = `  dailyHubCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  dailyHubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  hubIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  dailyHubTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  dailyHubOpenAll: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5C0B0B'
  },
  hubPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  hubPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1
  },
  hubPillAlert: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca'
  },
  hubPillSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0'
  },
  hubPillGold: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a'
  },
  hubPillMuted: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0'
  },
  hubPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155'
  },
`;

content = content.replace('  followupBanner: {', stylesToAdd + '  followupBanner: {');

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('StaffDashboard.js successfully updated!');
