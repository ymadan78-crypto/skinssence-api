import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './screens/LoginScreen';
import MyAttendanceScreen from './screens/MyAttendanceScreen';
import StaffDashboard from './screens/StaffDashboard';
import DoctorDashboard from './screens/DoctorDashboard';
import PatientRegistrationScreen from './screens/PatientRegistrationScreen';
import SearchPatientScreen from './screens/SearchPatientScreen';
import PatientProfileScreen from './screens/PatientProfileScreen';
import VisitEntryScreen from './screens/VisitEntryScreen';
import AllPatientsScreen from './screens/AllPatientsScreen';
import ExpenseEntryScreen from './screens/ExpenseEntryScreen';
import DoctorReportsScreen from './screens/DoctorReportsScreen';
import StaffCollectionScreen from './screens/StaffCollectionScreen';
import UpcomingEventsScreen from './screens/UpcomingEventsScreen';
import AppointmentCalendarScreen from './screens/AppointmentCalendarScreen';
import AppointmentRemindersScreen from './screens/AppointmentRemindersScreen';
import UserManagementScreen from './screens/UserManagementScreen';
import HRDashboardScreen from './screens/HRDashboardScreen';
import PharmacyAnalyticsScreen from './screens/PharmacyAnalyticsScreen';
import PharmacyBillingScreen from './screens/PharmacyBillingScreen';
import InventoryManagementScreen from './screens/InventoryManagementScreen';
import TodayPatientsScreen from './screens/TodayPatientsScreen';
import MasterProcedureCatalogScreen from './screens/MasterProcedureCatalogScreen';
import DailyDiaryScreen from './screens/DailyDiaryScreen';
import LeadsScreen from './screens/LeadsScreen';
import AddLeadScreen from './screens/AddLeadScreen';
import LeadDetailScreen from './screens/LeadDetailScreen';
import LeadFollowupsScreen from './screens/LeadFollowupsScreen';
import TreatmentPlannerScreen from './screens/TreatmentPlannerScreen';
import axios from 'axios';


// Network & Resilience Configuration
axios.defaults.timeout = 15000; // 15-second explicit timeout for all mobile API calls
axios.defaults.headers.common['Bypass-Tunnel-Reminder'] = 'true';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

// Safe GET retry interceptor (retries idempotent GET requests once on network hiccup)
axios.interceptors.response.use(undefined, async (err) => {
  const config = err?.config;
  if (!config) return Promise.reject(err);

  const isGet = (config.method || 'get').toLowerCase() === 'get';
  const isNetworkOrTimeout = !err.response || err.code === 'ECONNABORTED' || err.message?.includes('Network Error');

  if (isGet && isNetworkOrTimeout && (!config.__retryCount || config.__retryCount < 2)) {
    config.__retryCount = (config.__retryCount || 0) + 1;
    const delay = config.__retryCount * 700;
    console.warn(`[Axios Network Retry] Retrying GET ${config.url} (attempt ${config.__retryCount}) in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return axios(config);
  }

  return Promise.reject(err);
});

const Stack = createNativeStackNavigator();

import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

class GlobalErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[GlobalErrorBoundary] Caught unexpected crash:', error, info);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: '#f8fafc' }}>
          <Ionicons name="alert-circle" size={64} color="#dc2626" />
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginTop: 16, marginBottom: 8, textAlign: 'center' }}>
            Oops! An error occurred
          </Text>
          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 18, paddingHorizontal: 10 }}>
            The app encountered an unexpected condition and safely prevented a white screen freeze.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#5C0B0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, elevation: 2 }}
            onPress={this.handleRestart}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Return to App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}


export default function App() {
  return (
    <GlobalErrorBoundary>
      <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="StaffDashboard" component={StaffDashboard} />
        <Stack.Screen name="MyAttendance" component={MyAttendanceScreen} />
        <Stack.Screen name="DoctorDashboard" component={DoctorDashboard} />
        <Stack.Screen name="PatientRegistration" component={PatientRegistrationScreen} />
        <Stack.Screen name="SearchPatient" component={SearchPatientScreen} />
        <Stack.Screen name="PatientProfile" component={PatientProfileScreen} />
        <Stack.Screen name="VisitEntry" component={VisitEntryScreen} />
        <Stack.Screen name="AllPatients" component={AllPatientsScreen} />
        <Stack.Screen name="ExpenseEntry" component={ExpenseEntryScreen} />
        <Stack.Screen name="DoctorReports" component={DoctorReportsScreen} />
        <Stack.Screen name="StaffCollection" component={StaffCollectionScreen} />
        <Stack.Screen name="UpcomingEvents" component={UpcomingEventsScreen} />
        <Stack.Screen name="AppointmentCalendar" component={AppointmentCalendarScreen} />
        <Stack.Screen name="AppointmentReminders" component={AppointmentRemindersScreen} />
        <Stack.Screen name="UserManagement" component={UserManagementScreen} />
        <Stack.Screen name="HRDashboard" component={HRDashboardScreen} />
        <Stack.Screen name="PharmacyAnalytics" component={PharmacyAnalyticsScreen} />
        <Stack.Screen name="PharmacyBilling" component={PharmacyBillingScreen} />
        <Stack.Screen name="InventoryManagement" component={InventoryManagementScreen} />
        <Stack.Screen name="TodayPatients" component={TodayPatientsScreen} />
        <Stack.Screen name="MasterProcedureCatalog" component={MasterProcedureCatalogScreen} />
        <Stack.Screen name="DailyDiary" component={DailyDiaryScreen} />
        <Stack.Screen name="Leads" component={LeadsScreen} />
        <Stack.Screen name="AddLead" component={AddLeadScreen} />
        <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
        <Stack.Screen name="LeadFollowups" component={LeadFollowupsScreen} />
        <Stack.Screen name="TreatmentPlanner" component={TreatmentPlannerScreen} />
      </Stack.Navigator>

      </NavigationContainer>
    </GlobalErrorBoundary>
  );
}
