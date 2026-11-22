import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { HEADER_BANNER_BASE64 } from '../utils/header_banner';
import { renameBillPdfAsync } from '../utils/billNaming';
import { previewBillPdfAsync, shareBillToWhatsAppAsync } from '../utils/whatsappShare';

const API_BASE_URL = 'https://skinssence-api-1.onrender.com';

const QUICK_PROCEDURES = [
  'Hydrafacial',
  'Hair Spa',
  'Chemical Peel',
  'Laser Hair Removal',
  'Carbon Laser Peel',
  'PRP Face',
  'PRP Hair Therapy',
  'Dermapen Microneedling'
];

const QUICK_TIMES = [
  '11:00 AM',
  '11:15 AM',
  '11:30 AM',
  '12:00 PM',
  '01:00 PM',
  '04:00 PM',
  '05:00 PM',
  '06:00 PM'
];

const QUICK_AMOUNTS = ['500', '1000', '1500', '2000'];

const PAYMENT_MODES = ['CASH', 'UPI (Store)', 'UPI (Clinic)', 'CARD'];

export function buildAdvanceReceiptHtml({
  patient,
  receiptNo,
  bookingDateStr,
  appointmentDateStr,
  appointmentTime,
  plannedProcedures,
  advanceAmount,
  paymentMode,
  estimatedTotal,
  notes
}) {
  const pName = `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim() || 'Patient';
  const pId = patient?.skinssence_id || (patient?.id ? `ID:${patient.id}` : 'N/A');
  const pMobile = patient?.mobile || '';
  const advNum = parseFloat(advanceAmount) || 0;
  const estNum = parseFloat(estimatedTotal) || 0;
  const approxBal = estNum > advNum ? estNum - advNum : 0;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Advance Booking Receipt - ${receiptNo}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 24px;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #5C0B0B;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .doc {
            margin: 4px 0 2px 0;
            font-weight: bold;
            color: #0f172a;
            font-size: 14px;
          }
          .addr {
            font-size: 11px;
            color: #475569;
            margin: 2px 0;
            line-height: 1.4;
          }
          .badge-box {
            text-align: right;
            align-self: center;
          }
          .bill-badge {
            font-size: 14px;
            font-weight: 800;
            color: #5C0B0B;
            border: 2px solid #5C0B0B;
            padding: 6px 14px;
            border-radius: 6px;
            letter-spacing: 1px;
            display: inline-block;
            background: #fff;
          }
          .badge-sub {
            font-size: 11px;
            color: #64748b;
            margin-top: 4px;
            font-weight: 600;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 20px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 13px;
          }
          .info-label {
            color: #64748b;
            font-size: 12px;
            font-weight: 500;
          }
          .info-value {
            color: #0f172a;
            font-weight: 700;
            font-size: 13px;
          }
          .appt-highlight {
            background: #f5f3ff;
            border: 1.5px solid #c4b5fd;
            border-left: 5px solid #7c3aed;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
          }
          .appt-title {
            color: #6d28d9;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            margin-bottom: 6px;
          }
          .appt-grid {
            display: grid;
            grid-template-columns: 1.1fr 1fr 1.6fr;
            gap: 12px;
            font-size: 13px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          th {
            background: #5C0B0B;
            color: #ffffff;
            padding: 8px 10px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: left;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
          }
          .total-box {
            margin-left: auto;
            width: 350px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 18px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 13px;
            color: #334155;
          }
          .total-row.grand {
            border-top: 2px solid #5C0B0B;
            border-bottom: 2px solid #5C0B0B;
            margin: 8px 0;
            padding: 8px 0;
            font-weight: 800;
            font-size: 15px;
            color: #15803d;
          }
          .terms-box {
            background: #fafaf9;
            border: 1px solid #e7e5e4;
            border-left: 4px solid #78716c;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 11.5px;
            color: #44403c;
            line-height: 1.55;
            margin-bottom: 20px;
          }
          .terms-title {
            font-weight: 800;
            color: #292524;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 11px;
          }
          .footer-sign {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 28px;
            padding-top: 16px;
            border-top: 1px dashed #cbd5e1;
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <!-- CLINIC BRANDING HEADER -->
        <div class="header-container">
          <div style="flex: 1;">
            <img src="${HEADER_BANNER_BASE64}" style="max-height:80px;max-width:340px;object-fit:contain;" />
            <p class="doc">Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai</p>
            <p class="addr">4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</p>
            <p class="addr">📞 +91 95091 97578 &nbsp;&nbsp;|&nbsp;&nbsp; 🌐 www.skinssence.in</p>
          </div>
          <div class="badge-box">
            <div class="bill-badge">⭐ PRIORITY BOOKING RECEIPT</div>
            <div class="badge-sub">Guaranteed & Pre-Paid Appointment Slot</div>
          </div>
        </div>

        <!-- PATIENT & RECEIPT DETAILS -->
        <div class="info-grid">
          <div><span class="info-label">Patient Name: </span><span class="info-value">${pName}</span></div>
          <div><span class="info-label">Receipt No: </span><span class="info-value">${receiptNo}</span></div>
          <div><span class="info-label">Patient S ID: </span><span class="info-value">${pId}</span></div>
          <div><span class="info-label">Payment Date: </span><span class="info-value">${bookingDateStr}</span></div>
          <div><span class="info-label">Contact Phone: </span><span class="info-value">${pMobile || 'N/A'}</span></div>
          <div><span class="info-label">Consultant: </span><span class="info-value">Dr. Ashima Madan</span></div>
        </div>

        <!-- SCHEDULED APPOINTMENT CARD -->
        <div class="appt-highlight">
          <div class="appt-title">⭐ PRIORITY RESERVED TREATMENT SLOT</div>
          <div style="font-size:11px;color:#7c3aed;margin-bottom:8px;font-weight:600;">✨ Guaranteed Slot & Zero-Wait Priority Consultation</div>
          <div class="appt-grid">
            <div>
              <div class="info-label">Treatment Date</div>
              <div class="info-value" style="color:#6d28d9;font-size:14px;">${appointmentDateStr}</div>
            </div>
            <div>
              <div class="info-label">Reserved Time</div>
              <div class="info-value" style="color:#6d28d9;font-size:14px;">${appointmentTime}</div>
            </div>
            <div>
              <div class="info-label">Planned Service(s)</div>
              <div class="info-value">${plannedProcedures}</div>
            </div>
          </div>
        </div>

        <!-- FINANCIAL TABLE -->
        <table>
          <thead>
            <tr>
              <th style="width:40px;text-align:center;">#</th>
              <th>Description / Service Booked</th>
              <th style="width:170px;text-align:center;">Booking Status</th>
              <th style="width:130px;text-align:right;">Advance Credited</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:center;font-weight:bold;">1</td>
              <td>
                <div style="font-weight:bold;color:#0f172a;">${plannedProcedures}</div>
                <div style="font-size:11px;color:#64748b;margin-top:2px;">Scheduled for ${appointmentDateStr} at ${appointmentTime}</div>
                ${notes ? `<div style="font-size:11px;color:#0369a1;margin-top:2px;">Note: ${notes}</div>` : ''}
              </td>
              <td style="text-align:center;">
                <span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:bold;border:1px solid #fde68a;">⭐ PRIORITY (PRE-PAID)</span>
              </td>
              <td style="text-align:right;font-weight:bold;color:#15803d;font-size:14px;">
                Rs. ${advNum.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- TOTAL & BALANCE BREAKDOWN -->
        <div class="total-box">
          <div class="total-row">
            <span>Advance Deposit Paid Today:</span>
            <span style="font-weight:bold;color:#15803d;">Rs. ${advNum.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span>Payment Mode:</span>
            <span style="font-weight:600;">${paymentMode}</span>
          </div>
          <div class="total-row">
            <span>Account Balance Status:</span>
            <span style="color:#15803d;font-weight:600;">Credited to Clinic Account</span>
          </div>
          
          <div class="total-row grand">
            <span>ADVANCE PAID (NET)</span>
            <span>Rs. ${advNum.toFixed(2)}</span>
          </div>

          ${estNum > 0 ? `
            <div class="total-row" style="color:#64748b;">
              <span>Estimated Service Total:</span>
              <span>Rs. ${estNum.toFixed(2)}</span>
            </div>
            <div class="total-row" style="color:#b91c1c;font-weight:bold;border-top:1px dashed #cbd5e1;padding-top:6px;margin-top:4px;">
              <span>Approx. Balance Due on Visit:</span>
              <span>Rs. ${approxBal.toFixed(2)}</span>
            </div>
          ` : `
            <div style="font-size:11px;color:#64748b;font-style:italic;margin-top:4px;line-height:1.4;">
              * Remaining balance payable on appointment day as per final chosen treatments.
            </div>
          `}
        </div>

        <!-- TERMS & CONDITIONS (100% ENGLISH) -->
        <div class="terms-box">
          <div class="terms-title">Terms & Conditions:</div>
          <div>• <strong>⭐ Priority Service:</strong> As an advance pre-paid client, your reserved time slot is guaranteed with priority consultation & zero wait time upon arrival.</div>
          <div>• This advance deposit of <strong>Rs. ${advNum.toFixed(2)}</strong> is securely credited to your clinic account.</div>
          <div>• The credited advance will be automatically deducted from your final bill on your appointment day.</div>
          <div>• Treatment choices can be tailored or customized upon doctor consultation during your visit.</div>
          <div>• For rescheduling or adjustments, please inform the clinic at least 24 hours prior to your scheduled slot.</div>
        </div>

        <!-- FOOTER & SIGNATURE -->
        <div class="footer-sign">
          <div>
            <div>Thank you for choosing Skinssence!</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">This is a computer-generated receipt.</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:bold;color:#0f172a;margin-bottom:28px;">For Skinssence Aesthetic Clinic & Pharmacy</div>
            <div style="border-top:1px solid #334155;display:inline-block;padding-top:4px;min-width:140px;text-align:center;">Authorized Signatory</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export default function AdvanceBookingModal({ visible, patient, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  // 1. Booking / Transaction Date (Default: Today)
  const [bookingDate, setBookingDate] = useState(new Date());
  const [showBookingDatePicker, setShowBookingDatePicker] = useState(false);

  // 2. Appointment / Procedure Date
  const defaultApptDate = new Date();
  defaultApptDate.setDate(defaultApptDate.getDate() + 14);
  const [appointmentDate, setAppointmentDate] = useState(defaultApptDate);
  const [showApptDatePicker, setShowApptDatePicker] = useState(false);

  // 3. Time Slot
  const [appointmentTime, setAppointmentTime] = useState('11:15 AM');

  // 4. Planned Procedure(s)
  const [plannedProcedures, setPlannedProcedures] = useState('Hydrafacial & Hair Spa');

  // 5. Advance Amount & Mode
  const [advanceAmount, setAdvanceAmount] = useState('500');
  const [paymentMode, setPaymentMode] = useState('UPI (Store)');

  // 6. Estimated Total (Optional)
  const [estimatedTotal, setEstimatedTotal] = useState('');

  // 7. Notes
  const [notes, setNotes] = useState('');

  const formatDateYMD = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatDisplayDate = (dateObj) => {
    return dateObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleAddProcTag = (tag) => {
    if (!plannedProcedures.trim()) {
      setPlannedProcedures(tag);
    } else if (!plannedProcedures.toLowerCase().includes(tag.toLowerCase())) {
      setPlannedProcedures(`${plannedProcedures} + ${tag}`);
    }
  };

  const advanceNum = parseFloat(advanceAmount) || 0;
  const estTotalNum = parseFloat(estimatedTotal) || 0;
  const approxBalance = estTotalNum > advanceNum ? estTotalNum - advanceNum : 0;

  const handleSubmit = async () => {
    if (!advanceNum || advanceNum <= 0) {
      Alert.alert('Invalid Advance', 'Please enter a valid advance payment amount (e.g. ₹500).');
      return;
    }

    if (!plannedProcedures.trim()) {
      Alert.alert('Procedure Required', 'Please enter the planned service or procedure.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        patient_id: patient.id,
        booking_date: formatDateYMD(bookingDate),
        appointment_date: formatDateYMD(appointmentDate),
        appointment_time: appointmentTime,
        planned_procedures: plannedProcedures.trim(),
        advance_amount: advanceNum,
        payment_mode: paymentMode,
        estimated_total: estTotalNum > 0 ? estTotalNum : null,
        notes: notes.trim()
      };

      const res = await axios.post(`${API_BASE_URL}/api/advance-bookings`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { booking_id } = res.data;
      const receiptNo = booking_id || `ADV-${patient.skinssence_id || patient.id}-${Date.now().toString().slice(-4)}`;

      // Generate the official professional PDF document
      const receiptHtml = buildAdvanceReceiptHtml({
        patient,
        receiptNo,
        bookingDateStr: formatDisplayDate(bookingDate),
        appointmentDateStr: formatDisplayDate(appointmentDate),
        appointmentTime,
        plannedProcedures: plannedProcedures.trim(),
        advanceAmount: advanceNum,
        paymentMode,
        estimatedTotal: estTotalNum > 0 ? estTotalNum : null,
        notes: notes.trim()
      });

      const { uri } = await Print.printToFileAsync({ html: receiptHtml });
      const patientFullName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'Patient';
      const { uri: namedPdfUri, filename } = await renameBillPdfAsync(uri, patientFullName, receiptNo);

      Alert.alert(
        'Advance Booking Confirmed! 🎉',
        `📄 Official PDF Receipt Generated:\n${filename}\n\n₹${advanceNum.toFixed(0)} advance recorded for ${formatDisplayDate(appointmentDate)}.\n\nAccount balance updated and appointment scheduled.`,
        [
          {
            text: '👁️ Preview PDF',
            onPress: async () => {
              try {
                await previewBillPdfAsync(namedPdfUri, filename);
              } finally {
                if (onSuccess) onSuccess();
                onClose();
              }
            }
          },
          {
            text: '📲 Share PDF on WhatsApp',
            style: 'default',
            onPress: async () => {
              try {
                await shareBillToWhatsAppAsync({
                  pdfUri: namedPdfUri,
                  filename,
                  patient,
                  inFlightRef
                });
              } finally {
                if (onSuccess) onSuccess();
                onClose();
              }
            }
          },
          {
            text: 'Done',
            style: 'cancel',
            onPress: () => {
              if (onSuccess) onSuccess();
              onClose();
            }
          }
        ]
      );
    } catch (err) {
      console.error('Error saving advance booking:', err);
      Alert.alert('Error', err?.response?.data?.error || err.message || 'Failed to record advance booking.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          {/* HEADER */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="receipt-outline" size={20} color="#7c3aed" />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.headerTitle}>⭐ Priority Advance Booking</Text>
                <Text style={styles.headerSubtitle}>
                  {patient.first_name} {patient.last_name || ''} ({patient.skinssence_id || 'Walk-in'})
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* BOOKING DATE (TRANSACTION DATE - TODAY) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>1. Payment / Booking Date (Today)</Text>
                <TouchableOpacity onPress={() => setShowBookingDatePicker(true)}>
                  <Text style={styles.editDateLink}>Change</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => setShowBookingDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={16} color="#475569" style={{ marginRight: 8 }} />
                <Text style={styles.datePickerText}>
                  {formatDisplayDate(bookingDate)} (Today)
                </Text>
              </TouchableOpacity>
              {showBookingDatePicker && (
                <DateTimePicker
                  value={bookingDate}
                  mode="date"
                  display="default"
                  onChange={(event, d) => {
                    setShowBookingDatePicker(false);
                    if (d) setBookingDate(d);
                  }}
                />
              )}
            </View>

            {/* APPOINTMENT / PROCEDURE DATE & TIME */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>2. Scheduled Procedure Date & Time</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.datePickerBtn, { flex: 1.4 }]}
                  onPress={() => setShowApptDatePicker(true)}
                >
                  <Ionicons name="calendar" size={16} color="#7c3aed" style={{ marginRight: 6 }} />
                  <Text style={[styles.datePickerText, { color: '#7c3aed', fontWeight: 'bold' }]}>
                    {formatDisplayDate(appointmentDate)}
                  </Text>
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.textInputBox, { textAlign: 'center', fontWeight: 'bold' }]}
                    value={appointmentTime}
                    onChangeText={setAppointmentTime}
                    placeholder="11:15 AM"
                  />
                </View>
              </View>

              {showApptDatePicker && (
                <DateTimePicker
                  value={appointmentDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(event, d) => {
                    setShowApptDatePicker(false);
                    if (d) setAppointmentDate(d);
                  }}
                />
              )}

              {/* Quick Time Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {QUICK_TIMES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chipBtn, appointmentTime === t && styles.chipBtnActive]}
                    onPress={() => setAppointmentTime(t)}
                  >
                    <Text style={[styles.chipBtnText, appointmentTime === t && styles.chipBtnTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* PLANNED PROCEDURE / SERVICES */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>3. Planned Service(s) / Treatment</Text>
              <TextInput
                style={styles.textInputBox}
                value={plannedProcedures}
                onChangeText={setPlannedProcedures}
                placeholder="e.g. Hydrafacial & Hair Spa"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {QUICK_PROCEDURES.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={styles.quickTagBtn}
                    onPress={() => handleAddProcTag(p)}
                  >
                    <Text style={styles.quickTagText}>+ {p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* ADVANCE AMOUNT & QUICK AMOUNTS */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>4. Advance Deposit Paid Today (₹)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.textInputBox, styles.amountInput]}
                    keyboardType="numeric"
                    value={advanceAmount}
                    onChangeText={setAdvanceAmount}
                    placeholder="500"
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {QUICK_AMOUNTS.map(a => (
                    <TouchableOpacity
                      key={a}
                      style={[styles.amtChip, advanceAmount === a && styles.amtChipActive]}
                      onPress={() => setAdvanceAmount(a)}
                    >
                      <Text style={[styles.amtChipText, advanceAmount === a && styles.amtChipTextActive]}>
                        ₹{a}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* PAYMENT MODE */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>5. Payment Mode</Text>
              <View style={styles.modeRow}>
                {PAYMENT_MODES.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeChip, paymentMode === m && styles.modeChipActive]}
                    onPress={() => setPaymentMode(m)}
                  >
                    <Text style={[styles.modeChipText, paymentMode === m && styles.modeChipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ESTIMATED TOTAL (OPTIONAL) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>6. Estimated Service Total (Optional)</Text>
                <Text style={styles.optionalBadge}>Optional</Text>
              </View>
              <TextInput
                style={styles.textInputBox}
                keyboardType="numeric"
                value={estimatedTotal}
                onChangeText={setEstimatedTotal}
                placeholder="e.g. 3500 (Leave blank if procedure price is tentative)"
              />
              <Text style={styles.helperText}>
                {estTotalNum > 0
                  ? `Approx. Balance Due on Visit: ₹${approxBalance.toFixed(0)}`
                  : 'If left blank, receipt states: "Remaining balance payable on visit day as per chosen service."'}
              </Text>
            </View>

            {/* BOOKING NOTES */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>7. Notes / Remarks (Optional)</Text>
              <TextInput
                style={[styles.textInputBox, { height: 44 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Client requested 11:15 AM sharp"
              />
            </View>

            {/* RECEIPT PREVIEW SUMMARY CARD */}
            <View style={styles.summaryBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="document-text" size={16} color="#6d28d9" style={{ marginRight: 6 }} />
                <Text style={styles.summaryTitle}>⭐ Priority Receipt Preview:</Text>
              </View>
              <Text style={styles.summaryRow}>• Patient: {patient.first_name} {patient.last_name || ''} ({patient.skinssence_id})</Text>
              <Text style={styles.summaryRow}>• Scheduled: {formatDisplayDate(appointmentDate)} at {appointmentTime}</Text>
              <Text style={styles.summaryRow}>• Planned Service: {plannedProcedures || 'Procedure'}</Text>
              <Text style={[styles.summaryRow, { fontWeight: 'bold', color: '#15803d' }]}>
                • Advance Paid: ₹{advanceNum.toFixed(0)} ({paymentMode})
              </Text>
              <Text style={styles.summaryTerms}>
                Notice: An official ⭐ PRIORITY BOOKING RECEIPT PDF with Dr. Ashima Madan's credentials & clinic banner will be generated in 100% English and shared directly to WhatsApp.
              </Text>
            </View>
          </ScrollView>

          {/* FOOTER BUTTONS */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.confirmBtn, submitting && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="document-text" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmBtnText}>Save & Generate PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b'
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  closeBtn: {
    padding: 6
  },
  formScroll: {
    paddingHorizontal: 16,
    paddingTop: 12
  },
  inputGroup: {
    marginBottom: 14
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6
  },
  editDateLink: {
    fontSize: 12,
    color: '#7c3aed',
    fontWeight: 'bold'
  },
  optionalBadge: {
    fontSize: 11,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  datePickerText: {
    fontSize: 14,
    color: '#1e293b'
  },
  textInputBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a'
  },
  amountInput: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#15803d'
  },
  chipsScroll: {
    marginTop: 8
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  chipBtnActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#7c3aed'
  },
  chipBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500'
  },
  chipBtnTextActive: {
    color: '#7c3aed',
    fontWeight: 'bold'
  },
  quickTagBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#f3e8ff',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#d8b4fe'
  },
  quickTagText: {
    fontSize: 11,
    color: '#6b21a8',
    fontWeight: '600'
  },
  amtChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  amtChipActive: {
    backgroundColor: '#15803d',
    borderColor: '#15803d'
  },
  amtChipText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: 'bold'
  },
  amtChipTextActive: {
    color: '#fff'
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6
  },
  modeChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modeChipActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed'
  },
  modeChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600'
  },
  modeChipTextActive: {
    color: '#fff',
    fontWeight: 'bold'
  },
  helperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    fontStyle: 'italic'
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    marginBottom: 20
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#6d28d9'
  },
  summaryRow: {
    fontSize: 12,
    color: '#334155',
    marginTop: 3
  },
  summaryTerms: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 15,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  cancelBtn: {
    backgroundColor: '#f1f5f9',
    flex: 0.8
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14
  },
  confirmBtn: {
    backgroundColor: '#7c3aed',
    flex: 1.4
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14
  },
  disabledBtn: {
    opacity: 0.6
  }
});
