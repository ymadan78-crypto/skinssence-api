import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export default function PharmacyAnalyticsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [activeMainTab, setActiveMainTab] = useState('expiry'); // 'expiry', 'deadStock', or 'companySales'
  const [expiryFilter, setExpiryFilter] = useState('ALL'); // 'ALL', 'EXPIRED', '3M', '3_6M', '6_12M', 'OVER_12M', 'INVALID'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDeadStock, setExpandedDeadStock] = useState(null);

  // --- COMPANY / BRAND SALES STATE ---
  const [companySalesData, setCompanySalesData] = useState(null);
  const [companySalesLoading, setCompanySalesLoading] = useState(false);
  const [companySalesError, setCompanySalesError] = useState(null);
  const [selectedCompanyMonth, setSelectedCompanyMonth] = useState('ALL');
  const [selectedCompanyBrand, setSelectedCompanyBrand] = useState('ALL');
  const [companySearchQ, setCompanySearchQ] = useState('');

  useEffect(() => {
    fetchAnalytics();
    AsyncStorage.getItem('userRole').then(r => setUserRole(r ? r.toUpperCase() : ''));
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get('https://skinssence-api.onrender.com/api/inventory/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (error) {
      console.error(error);
      Alert.alert('Notice', 'Failed to fetch inventory & expiry data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanySales = async (m = selectedCompanyMonth, b = selectedCompanyBrand) => {
    setCompanySalesLoading(true);
    setCompanySalesError(null);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`https://skinssence-api.onrender.com/api/inventory/company-sales?month=${m}&company=${encodeURIComponent(b)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompanySalesData(res.data);
    } catch (e) {
      console.error('Error fetching company sales:', e);
      setCompanySalesError('Unable to load company sales statistics at this moment. The server may still be deploying the latest update.');
    } finally {
      setCompanySalesLoading(false);
    }
  };

  const handleSelectMonth = (m) => {
    setSelectedCompanyMonth(m);
    fetchCompanySales(m, selectedCompanyBrand);
  };

  const handleSelectBrand = (b) => {
    setSelectedCompanyBrand(b);
    fetchCompanySales(selectedCompanyMonth, b);
  };

  const getFilteredExpiryList = () => {
    if (!data || !data.allSorted) return [];
    let list = data.allSorted;

    // Filter by category
    if (expiryFilter === 'EXPIRED') {
      list = data.byCategory?.expired || [];
    } else if (expiryFilter === '3M') {
      list = data.byCategory?.in3Months || [];
    } else if (expiryFilter === '3_6M') {
      list = data.byCategory?.in3To6Months || [];
    } else if (expiryFilter === '6_12M') {
      list = data.byCategory?.in6To12Months || [];
    } else if (expiryFilter === 'OVER_12M') {
      list = data.byCategory?.over12Months || [];
    } else if (expiryFilter === 'INVALID') {
      list = data.byCategory?.invalidDate || [];
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => 
        (item.medicine_name && item.medicine_name.toLowerCase().includes(q)) ||
        (item.batch_number && item.batch_number.toLowerCase().includes(q))
      );
    }

    return list;
  };

  const renderDeadStockSection = (title, items, key) => {
    const isExpanded = expandedDeadStock === key;
    return (
      <View key={key} style={styles.sectionContainer}>
        <TouchableOpacity 
          style={styles.sectionHeader} 
          onPress={() => setExpandedDeadStock(isExpanded ? null : key)}
        >
          <Text style={styles.sectionTitle}>{title} ({items ? items.length : 0})</Text>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#333" />
        </TouchableOpacity>
        
        {isExpanded && (!items || items.length === 0) && (
          <Text style={styles.emptyText}>No items in this category.</Text>
        )}

        {isExpanded && items && items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.medicine_name}</Text>
              <Text style={styles.itemSub}>Batch: {item.batch_number || 'N/A'} | Stock: {item.quantity}</Text>
            </View>
            <Text style={styles.itemExpiry}>Exp: {item.expiry_date || 'N/A'}</Text>
          </View>
        ))}
      </View>
    );
  };

  const summary = data?.summary || {
    expiredCount: 0,
    in3MonthsCount: 0,
    in3To6MonthsCount: 0,
    in6To12MonthsCount: 0,
    over12MonthsCount: 0,
    invalidCount: 0,
    totalMedicines: 0
  };

  const isAdmin = userRole === 'ADMIN' || userRole === 'DOCTOR';

  let totalInStockMrpValue = 0;
  let totalInStockUnits = 0;
  let expiredStockMrpValue = 0;
  let validStockMrpValue = 0;

  if (isAdmin && data?.allSorted) {
    data.allSorted.forEach(item => {
      const qty = Number(item.quantity) || 0;
      const mrp = Number(item.mrp) || 0;
      if (qty > 0) {
        totalInStockUnits += qty;
        const val = qty * mrp;
        totalInStockMrpValue += val;
        if (item.status === 'EXPIRED') {
          expiredStockMrpValue += val;
        } else {
          validStockMrpValue += val;
        }
      }
    });
  }

  const filteredMedicines = getFilteredExpiryList();

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pharmacy Analytics</Text>
        <TouchableOpacity 
          onPress={() => {
            if (activeMainTab === 'companySales') {
              fetchCompanySales();
            } else {
              fetchAnalytics();
            }
          }} 
          style={styles.refreshBtn}
        >
          <Ionicons name="reload" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* TOP MAIN TABS */}
      <View style={styles.mainTabContainer}>
        <TouchableOpacity 
          style={[styles.mainTab, activeMainTab === 'expiry' && styles.activeMainTab]}
          onPress={() => setActiveMainTab('expiry')}
        >
          <Text style={activeMainTab === 'expiry' ? styles.activeMainTabText : styles.mainTabText}>
            📅 Expiry ({summary.totalMedicines})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainTab, activeMainTab === 'deadStock' && styles.activeMainTab]}
          onPress={() => setActiveMainTab('deadStock')}
        >
          <Text style={activeMainTab === 'deadStock' ? styles.activeMainTabText : styles.mainTabText}>
            📦 Dead Stock
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainTab, activeMainTab === 'companySales' && styles.activeMainTab]}
          onPress={() => {
            setActiveMainTab('companySales');
            if (!companySalesData) {
              fetchCompanySales(selectedCompanyMonth, selectedCompanyBrand);
            }
          }}
        >
          <Text style={activeMainTab === 'companySales' ? styles.activeMainTabText : styles.mainTabText}>
            🏢 Brand Sales (MRP)
          </Text>
        </TouchableOpacity>
      </View>

      {/* EXPIRY TAB */}
      {activeMainTab === 'expiry' && (
        loading ? (
          <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
        ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* ADMIN-ONLY TOTAL IN-STOCK MRP VALUE HERO CARD */}
            {isAdmin && (
              <View style={styles.adminValuationCard}>
                <View style={styles.adminValuationHeader}>
                  <View>
                    <Text style={styles.adminValuationBadge}>👑 ADMIN ONLY</Text>
                    <Text style={styles.adminValuationTitle}>Total In-Stock MRP Value</Text>
                  </View>
                  <Text style={styles.adminValuationAmount}>
                    ₹{totalInStockMrpValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.adminValuationStatsRow}>
                  <View style={styles.adminValuationStatItem}>
                    <Text style={styles.adminValuationStatLabel}>In-Stock Units</Text>
                    <Text style={styles.adminValuationStatVal}>{totalInStockUnits.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.adminValuationDivider} />
                  <View style={styles.adminValuationStatItem}>
                    <Text style={styles.adminValuationStatLabel}>Valid Stock (>3M)</Text>
                    <Text style={[styles.adminValuationStatVal, { color: '#059669' }]}>
                      ₹{validStockMrpValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <View style={styles.adminValuationDivider} />
                  <View style={styles.adminValuationStatItem}>
                    <Text style={styles.adminValuationStatLabel}>Expired Stock</Text>
                    <Text style={[styles.adminValuationStatVal, { color: '#dc2626' }]}>
                      ₹{expiredStockMrpValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* SUMMARY CARDS GRID */}
            <View style={styles.summaryGrid}>
              <TouchableOpacity 
                style={[styles.summaryCard, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }, expiryFilter === 'EXPIRED' && styles.summaryCardActive]}
                onPress={() => setExpiryFilter(expiryFilter === 'EXPIRED' ? 'ALL' : 'EXPIRED')}>
                <Text style={[styles.summaryNum, { color: '#7f1d1d' }]}>{summary.expiredCount}</Text>
                <Text style={[styles.summaryLabel, { color: '#7f1d1d' }]}>🔴 Expired</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.summaryCard, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }, expiryFilter === '3M' && styles.summaryCardActive]}
                onPress={() => setExpiryFilter(expiryFilter === '3M' ? 'ALL' : '3M')}>
                <Text style={[styles.summaryNum, { color: '#dc2626' }]}>{summary.in3MonthsCount}</Text>
                <Text style={[styles.summaryLabel, { color: '#dc2626' }]}>🔴 ≤ 3 Months</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.summaryCard, { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }, expiryFilter === '3_6M' && styles.summaryCardActive]}
                onPress={() => setExpiryFilter(expiryFilter === '3_6M' ? 'ALL' : '3_6M')}>
                <Text style={[styles.summaryNum, { color: '#d97706' }]}>{summary.in3To6MonthsCount}</Text>
                <Text style={[styles.summaryLabel, { color: '#d97706' }]}>🟠 3–6 Months</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.summaryCard, { backgroundColor: '#eff6ff', borderColor: '#93c5fd' }, expiryFilter === '6_12M' && styles.summaryCardActive]}
                onPress={() => setExpiryFilter(expiryFilter === '6_12M' ? 'ALL' : '6_12M')}>
                <Text style={[styles.summaryNum, { color: '#2563eb' }]}>{summary.in6To12MonthsCount}</Text>
                <Text style={[styles.summaryLabel, { color: '#2563eb' }]}>🔵 6–12 Months</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.summaryCard, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }, expiryFilter === 'OVER_12M' && styles.summaryCardActive]}
                onPress={() => setExpiryFilter(expiryFilter === 'OVER_12M' ? 'ALL' : 'OVER_12M')}>
                <Text style={[styles.summaryNum, { color: '#16a34a' }]}>{summary.over12MonthsCount}</Text>
                <Text style={[styles.summaryLabel, { color: '#16a34a' }]}>🟢 &gt; 12 Months</Text>
              </TouchableOpacity>

              {summary.invalidCount > 0 && (
                <TouchableOpacity 
                  style={[styles.summaryCard, { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' }, expiryFilter === 'INVALID' && styles.summaryCardActive]}
                  onPress={() => setExpiryFilter(expiryFilter === 'INVALID' ? 'ALL' : 'INVALID')}>
                  <Text style={[styles.summaryNum, { color: '#4b5563' }]}>{summary.invalidCount}</Text>
                  <Text style={[styles.summaryLabel, { color: '#4b5563' }]}>⚠️ Missing Date</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* SEARCH BAR */}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#6b7280" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search medicine or batch number..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            {/* CATEGORY FILTER CHIPS */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipBar}>
              {[
                { key: 'ALL', label: `All Sorted (${data?.allSorted?.length || 0})` },
                { key: 'EXPIRED', label: `Expired (${summary.expiredCount})` },
                { key: '3M', label: `≤ 3 Months (${summary.in3MonthsCount})` },
                { key: '3_6M', label: `3–6 Months (${summary.in3To6MonthsCount})` },
                { key: '6_12M', label: `6–12 Months (${summary.in6To12MonthsCount})` },
                { key: 'OVER_12M', label: `> 12 Months (${summary.over12MonthsCount})` },
                { key: 'INVALID', label: `Missing Date (${summary.invalidCount})` }
              ].map(chip => (
                <TouchableOpacity
                  key={chip.key}
                  style={[styles.chip, expiryFilter === chip.key && styles.chipActive]}
                  onPress={() => setExpiryFilter(chip.key)}>
                  <Text style={[styles.chipText, expiryFilter === chip.key && styles.chipTextActive]}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* SORTING INSTRUCTION BADGE */}
            <View style={styles.sortNotice}>
              <Text style={styles.sortNoticeText}>
                Sorted automatically by <Text style={{ fontWeight: 'bold' }}>nearest expiry date first</Text> (most urgent at the top).
              </Text>
            </View>

            {/* MEDICINE LIST */}
            {filteredMedicines.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No medicines found matching the selected filter.</Text>
              </View>
            ) : (
              filteredMedicines.map((item, idx) => {
                const isExpired = item.status === 'EXPIRED';
                const daysText = item.daysRemaining === null 
                  ? 'Date missing / invalid' 
                  : isExpired 
                    ? `Expired ${Math.abs(item.daysRemaining)} days ago` 
                    : `${item.daysRemaining} days left`;

                return (
                  <View key={item.id || idx} style={[styles.medCard, { borderLeftColor: item.color, backgroundColor: '#fff' }]}>
                    <View style={styles.medCardTop}>
                      <Text style={styles.medName}>{item.medicine_name}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: item.bgColor, borderColor: item.borderColor }]}>
                        <Text style={[styles.statusBadgeText, { color: item.color }]}>{item.statusLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.medCardDetails}>
                      <Text style={styles.medDetailText}>
                        <Text style={styles.boldText}>Batch:</Text> {item.batch_number || 'N/A'}
                      </Text>
                      <Text style={styles.medDetailText}>
                        <Text style={styles.boldText}>Stock:</Text> {item.quantity} units
                      </Text>
                      {item.mrp ? (
                        <Text style={styles.medDetailText}>
                          <Text style={styles.boldText}>MRP:</Text> ₹{parseFloat(item.mrp).toFixed(2)}
                        </Text>
                      ) : null}
                    </View>

                    <View style={[styles.medExpiryRow, { backgroundColor: item.bgColor, borderColor: item.borderColor }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="calendar-outline" size={15} color={item.color} style={{ marginRight: 5 }} />
                        <Text style={[styles.expiryDateText, { color: item.color }]}>
                          Exp: {item.formattedExpiry || item.expiry_date || 'N/A'}
                        </Text>
                      </View>
                      <Text style={[styles.daysLeftText, { color: item.color }]}>
                        {daysText}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )
      )}

      {/* DEAD STOCK TAB */}
      {activeMainTab === 'deadStock' && (
        <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: 40 }}>
          {data?.deadStock && (
            <>
              {renderDeadStockSection('Not Sold in Last 7 Days', data.deadStock.notSold7Days, 'ds_7d')}
              {renderDeadStockSection('Not Sold in Last 1 Month', data.deadStock.notSold1Month, 'ds_1m')}
              {renderDeadStockSection('Not Sold in Last 3 Months', data.deadStock.notSold3Months, 'ds_3m')}
              {renderDeadStockSection('Not Sold in Last 6 Months', data.deadStock.notSold6Months, 'ds_6m')}
              {renderDeadStockSection('Not Sold in Last 9 Months', data.deadStock.notSold9Months, 'ds_9m')}
              {renderDeadStockSection('Not Sold in Last 1 Year (Dead Stock)', data.deadStock.notSold1Year, 'ds_1y')}
            </>
          )}
        </ScrollView>
      )}

      {/* BRAND SALES (MRP) TAB */}
      {activeMainTab === 'companySales' && (
        <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: 40 }}>
          
          {/* MONTH FILTER PILLS */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>📅 Select Month</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.pillBtn, selectedCompanyMonth === 'ALL' && styles.activePillBtn]}
                onPress={() => handleSelectMonth('ALL')}
              >
                <Text style={selectedCompanyMonth === 'ALL' ? styles.activePillText : styles.pillText}>All Time</Text>
              </TouchableOpacity>
              {(companySalesData?.availableMonths || ['2026-10', '2026-09', '2026-08']).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.pillBtn, selectedCompanyMonth === m && styles.activePillBtn]}
                  onPress={() => handleSelectMonth(m)}
                >
                  <Text style={selectedCompanyMonth === m ? styles.activePillText : styles.pillText}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* BRAND / COMPANY FILTER PILLS */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>🏢 Select Pharma Company / Brand</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.pillBtn, selectedCompanyBrand === 'ALL' && styles.activePillBtn]}
                onPress={() => handleSelectBrand('ALL')}
              >
                <Text style={selectedCompanyBrand === 'ALL' ? styles.activePillText : styles.pillText}>All Brands</Text>
              </TouchableOpacity>
              {(companySalesData?.availableCompanies || ['Velnourish', 'Ethicare / Ubik', 'Canixa', 'Gracederma', 'Torrent', 'Adroit', 'Fixderma', 'Indus', 'Regalis', 'Menarini', 'Glaxo', 'Intas', 'Akumentis', 'Apex', 'Micro Labs']).map(b => (
                <TouchableOpacity
                  key={b}
                  style={[styles.pillBtn, selectedCompanyBrand === b && styles.activePillBtn]}
                  onPress={() => handleSelectBrand(b)}
                >
                  <Text style={selectedCompanyBrand === b ? styles.activePillText : styles.pillText}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* SEARCH ITEMS IN SALES */}
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={18} color="#6b7280" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search sold items (e.g. Screenguard, Aquaedge...)"
              value={companySearchQ}
              onChangeText={setCompanySearchQ}
            />
            {companySearchQ.length > 0 && (
              <TouchableOpacity onPress={() => setCompanySearchQ('')}>
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {companySalesLoading ? (
            <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 30 }} />
          ) : companySalesError ? (
            <View style={[styles.emptyCard, { borderColor: '#fca5a5', borderWidth: 1, backgroundColor: '#fff5f5' }]}>
              <Ionicons name="alert-circle-outline" size={36} color="#ef4444" style={{ marginBottom: 8 }} />
              <Text style={{ color: '#991b1b', textAlign: 'center', fontWeight: '600', marginBottom: 12 }}>
                {companySalesError}
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#5C0B0B', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                onPress={() => fetchCompanySales(selectedCompanyMonth, selectedCompanyBrand)}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Tap to Retry</Text>
              </TouchableOpacity>
            </View>
          ) : companySalesData ? (
            <>
              {/* HERO KPI SUMMARY CARD */}
              <View style={styles.companyHeroCard}>
                <View style={styles.companyHeroHeader}>
                  <Text style={styles.companyHeroTitle}>
                    {selectedCompanyBrand === 'ALL' ? 'Total Pharma Sales (MRP)' : `${selectedCompanyBrand} Sales`}
                  </Text>
                  <Text style={styles.companyHeroSubtitle}>
                    Period: {selectedCompanyMonth === 'ALL' ? 'All Months' : selectedCompanyMonth}
                  </Text>
                </View>

                <View style={styles.companyHeroStatsRow}>
                  <View style={styles.companyHeroStat}>
                    <Text style={styles.companyHeroStatLabel}>Total Revenue (MRP)</Text>
                    <Text style={[styles.companyHeroStatValue, { color: '#059669' }]}>
                      ₹{(companySalesData.summary?.totalSalesMrp || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.adminValuationDivider} />
                  <View style={styles.companyHeroStat}>
                    <Text style={styles.companyHeroStatLabel}>Total Units Sold</Text>
                    <Text style={[styles.companyHeroStatValue, { color: '#1d4ed8' }]}>
                      {(companySalesData.summary?.totalUnits || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.adminValuationDivider} />
                  <View style={styles.companyHeroStat}>
                    <Text style={styles.companyHeroStatLabel}>Brands</Text>
                    <Text style={[styles.companyHeroStatValue, { color: '#5C0B0B' }]}>
                      {companySalesData.summary?.companiesCount || 0}
                    </Text>
                  </View>
                </View>
              </View>

              {/* LIST OF COMPANIES AND THEIR ITEMS */}
              {companySalesData.companies && companySalesData.companies.length > 0 ? (
                companySalesData.companies.map(c => {
                  const filteredItems = (c.items || []).filter(it => 
                    !companySearchQ.trim() || it.name.toLowerCase().includes(companySearchQ.toLowerCase().trim())
                  );

                  if (companySearchQ.trim() && filteredItems.length === 0) return null;

                  return (
                    <View key={c.company} style={styles.companySectionCard}>
                      <View style={styles.companyCardHeader}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.companyCardTitle}>🏢 {c.company}</Text>
                          <Text style={styles.companyCardSub}>
                            {c.totalUnits} units sold across {c.items.length} product(s)
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.companyCardTotalBadge}>TOTAL MRP SALE</Text>
                          <Text style={styles.companyCardTotalAmt}>
                            ₹{c.totalSalesMrp.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      </View>

                      {/* ITEMS TABLE */}
                      <View style={styles.itemTable}>
                        <View style={styles.itemTableHeader}>
                          <Text style={[styles.tableColHeader, { flex: 2 }]}>Medicine Item</Text>
                          <Text style={[styles.tableColHeader, { flex: 1, textAlign: 'center' }]}>Units</Text>
                          <Text style={[styles.tableColHeader, { flex: 1, textAlign: 'right' }]}>MRP</Text>
                          <Text style={[styles.tableColHeader, { flex: 1.2, textAlign: 'right' }]}>Total (₹)</Text>
                        </View>

                        {filteredItems.map((it, idx) => (
                          <View key={idx} style={styles.itemTableRow}>
                            <Text style={[styles.itemTableNameText, { flex: 2 }]} numberOfLines={2}>{it.name}</Text>
                            <Text style={[styles.itemTableDataText, { flex: 1, textAlign: 'center', fontWeight: '700', color: '#1e40af' }]}>
                              {it.qty}
                            </Text>
                            <Text style={[styles.itemTableDataText, { flex: 1, textAlign: 'right', color: '#64748b' }]}>
                              ₹{it.mrp}
                            </Text>
                            <Text style={[styles.itemTableDataText, { flex: 1.2, textAlign: 'right', fontWeight: '800', color: '#065f46' }]}>
                              ₹{it.totalAmount.toLocaleString('en-IN')}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>No sales recorded for the selected brand/period.</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>Select a month or company to view statistics.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50 },
  backBtn: { padding: 4 },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refreshBtn: { padding: 4 },
  mainTabContainer: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  mainTab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeMainTab: { borderBottomColor: '#5C0B0B' },
  mainTabText: { color: '#6b7280', fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  activeMainTabText: { color: '#5C0B0B', fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  scrollArea: { padding: 15 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 },
  summaryCard: { width: '31%', borderWidth: 1, borderRadius: 8, padding: 8, alignItems: 'center', marginBottom: 8 },
  summaryCardActive: { borderWidth: 2, transform: [{ scale: 1.03 }] },
  summaryNum: { fontSize: 20, fontWeight: 'bold', marginBottom: 2 },
  summaryLabel: { fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#1f2937' },
  chipBar: { flexDirection: 'row', marginBottom: 10, maxHeight: 40 },
  chip: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6, height: 32, justifyContent: 'center' },
  chipActive: { backgroundColor: '#5C0B0B' },
  chipText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  sortNotice: { backgroundColor: '#eef2ff', padding: 8, borderRadius: 6, marginBottom: 12 },
  sortNoticeText: { fontSize: 12, color: '#4338ca', textAlign: 'center' },
  medCard: { padding: 14, borderRadius: 10, marginBottom: 12, elevation: 2, borderLeftWidth: 6, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },
  medCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#111827', flex: 1, marginRight: 8 },
  statusBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: 'bold' },
  medCardDetails: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  medDetailText: { fontSize: 13, color: '#4b5563' },
  boldText: { fontWeight: 'bold', color: '#1f2937' },
  medExpiryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 6, borderWidth: 1 },
  expiryDateText: { fontSize: 13, fontWeight: 'bold' },
  daysLeftText: { fontSize: 13, fontWeight: 'bold' },
  emptyCard: { backgroundColor: '#fff', padding: 24, borderRadius: 10, alignItems: 'center', marginTop: 15, elevation: 1 },
  emptyCardText: { color: '#9ca3af', fontStyle: 'italic', fontSize: 14 },
  sectionContainer: { backgroundColor: '#FFF', borderRadius: 8, marginBottom: 10, overflow: 'hidden', elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#E9ECEF' },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#495057' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  itemName: { fontSize: 15, fontWeight: '600', color: '#212529' },
  itemSub: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  emptyText: { padding: 15, fontStyle: 'italic', color: '#ADB5BD', textAlign: 'center' },
  adminValuationCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  adminValuationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  adminValuationBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 3,
  },
  adminValuationTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  adminValuationAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#065f46',
  },
  adminValuationStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  adminValuationStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  adminValuationDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#e2e8f0',
  },
  adminValuationStatLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  adminValuationStatVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },

  filterSection: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  filterSectionTitle: { fontSize: 12, fontWeight: '700', color: '#4b5563', textTransform: 'uppercase' },
  pillBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8, borderWidth: 1, borderColor: '#d1d5db' },
  activePillBtn: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  pillText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  activePillText: { fontSize: 13, color: '#fff', fontWeight: '700' },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  companyHeroCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#5C0B0B', elevation: 2 },
  companyHeroHeader: { marginBottom: 12 },
  companyHeroTitle: { fontSize: 16, fontWeight: '800', color: '#5C0B0B' },
  companyHeroSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  companyHeroStatsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#fdf2f2', paddingVertical: 10, borderRadius: 8 },
  companyHeroStat: { alignItems: 'center', flex: 1 },
  companyHeroStatLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600', marginBottom: 2 },
  companyHeroStatValue: { fontSize: 19, fontWeight: 'bold' },
  companySectionCard: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden', elevation: 1 },
  companyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  companyCardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  companyCardSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  companyCardTotalBadge: { fontSize: 9, fontWeight: '800', color: '#0f766e', backgroundColor: '#ccfbf1', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3, marginBottom: 2 },
  companyCardTotalAmt: { fontSize: 16, fontWeight: '800', color: '#5C0B0B' },
  itemTable: { paddingHorizontal: 8, paddingBottom: 6 },
  itemTableHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1.5, borderBottomColor: '#e2e8f0' },
  tableColHeader: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  itemTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemTableNameText: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  itemTableDataText: { fontSize: 13 },
});
