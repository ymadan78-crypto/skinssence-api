import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HEADER_BANNER_BASE64 } from './header_banner';
import { renameBillPdfAsync } from './billNaming';
import { previewBillPdfAsync, shareBillToWhatsAppAsync } from './whatsappShare';

const API_BASE_URL = 'https://skinssence-api-ekmv.onrender.com';

function getCleanDoctorAdvice(plannedProcedures) {
  if (!plannedProcedures) return '';
  const trimmed = plannedProcedures.trim();
  const upper = trimmed.toUpperCase();
  if (
    upper === 'CONSULTATION' ||
    upper === 'PHARMACY SALE' ||
    upper === 'REPORT REVIEW / FOLLOW UP' ||
    upper === 'PACKAGE SESSION REDEEMED'
  ) {
    return '';
  }
  return trimmed;
}

function formatAppointmentDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Builds the official professional HTML for a Skinssence clinic visit bill.
 * Strictly adheres to Dr. Ashima Madan credentials with RMC Reg. No. 31793.
 */
export function buildVisitBillHtml({
  patient,
  visit,
  invoiceNo,
  dateStr,
  nextAppt
}) {
  const patientName = `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim() || patient?.name || 'Patient';
  const patientSId = patient?.skinssence_id || (patient?.id ? `ID:${patient.id}` : 'Walk-in');
  const patientMobile = patient?.mobile || 'N/A';

  // 1. Procedures Rows
  const procRows = (visit.procedures || []).map((p, i) => `
    <tr>
      <td style="padding:10px;text-align:center">${i + 1}</td>
      <td style="padding:10px">
        <strong>${p.name}</strong>
        ${p.area ? `<br><span style="color:#555;font-size:12px">Area: ${p.area}</span>` : ''}
        ${p.notes ? `<br><span style="color:#0066cc;font-size:12px;font-style:italic">Note: ${p.notes}</span>` : ''}
      </td>
      <td style="padding:10px;text-align:center">1</td>
      <td style="padding:10px;text-align:right">Rs. ${(parseFloat(p.amount) || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  // 2. Pharmacy Medicines Rows
  const medRows = (visit.medicines || []).map((m, i) => {
    const isComp = (m.details || '').toLowerCase().includes('complimentary') || parseFloat(m.amount) === 0;
    return `
    <tr style="background:#fafafa">
      <td style="padding:10px;text-align:center">${(visit.procedures || []).length + i + 1}</td>
      <td style="padding:10px">
        💊 <strong>${m.details}</strong>
        ${isComp ? '&nbsp;<span style="background-color: #dcfce7; color: #15803d; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold; border: 1px solid #86efac;">COMPLIMENTARY</span>' : ''}
      </td>
      <td style="padding:10px;text-align:center">—</td>
      <td style="padding:10px;text-align:right">${isComp ? '<span style="color:#15803d;font-weight:bold;">Rs. 0.00 (Free)</span>' : `Rs. ${(parseFloat(m.amount) || 0).toFixed(2)}`}</td>
    </tr>`;
  }).join('');

  // 3. Consultation Fee Row
  const isRedeemedSession = (visit.procedures || []).some(p => (p.name || '').includes('[Redeemed Session')) || visit.planned_procedures === 'PACKAGE SESSION REDEEMED';
  const hasProceduresWithFee = (visit.procedures || []).some(p => (parseFloat(p.amount) || 0) > 0);
  const cFee = (isRedeemedSession || hasProceduresWithFee) ? 0 : (parseFloat(visit.consultation_fee) || 0);

  const cFeeRow = cFee > 0 ? `
    <tr>
      <td style="padding:10px;text-align:center">1</td>
      <td style="padding:10px">🩺 <strong>Consultation Fee</strong><br><span style="color:#555;font-size:11px">Dr. Ashima Madan (RMC Reg. No. 31793)</span></td>
      <td style="padding:10px;text-align:center">1</td>
      <td style="padding:10px;text-align:right">Rs. ${cFee.toFixed(2)}</td>
    </tr>` : '';

  const procTotal = (visit.procedures || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const medTotal = (visit.medicines || []).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);

  const computedSubtotal = cFee + procTotal + medTotal;
  const subtotalAmt = computedSubtotal > 0 ? computedSubtotal : (parseFloat(visit.subtotal) || parseFloat(visit.total_amount) || 0);

  const discAmt = parseFloat(visit.discount_amount) || parseFloat(visit.discount) || 0;
  const discType = visit.discount_type || 'NONE';
  const discVal = parseFloat(visit.discount_value) || 0;
  const netPayable = Math.max(0, subtotalAmt - discAmt);

  // Group Payments by Mode
  const modeTotals = {};
  (visit.payments || []).forEach(p => {
    const amt = parseFloat(p.amount_received) || 0;
    if (amt <= 0) return;
    const rawMode = (p.mode || 'CASH').toUpperCase().trim();
    let modeLabel = rawMode;
    if (rawMode.includes('UPI') || rawMode.includes('GPAY') || rawMode.includes('PHONEPE') || rawMode.includes('PAYTM') || rawMode.includes('ONLINE')) {
      modeLabel = 'UPI / Online';
    } else if (rawMode.includes('CASH')) {
      modeLabel = 'Cash';
    } else if (rawMode.includes('CARD') || rawMode.includes('POS') || rawMode.includes('DEBIT') || rawMode.includes('CREDIT')) {
      modeLabel = 'Card / POS';
    } else if (rawMode.includes('WALLET')) {
      modeLabel = 'Prepaid Wallet';
    }
    modeTotals[modeLabel] = (modeTotals[modeLabel] || 0) + amt;
  });

  const activeModes = Object.keys(modeTotals);
  const totalPaid = (visit.payments || []).reduce((s, p) => s + (parseFloat(p.amount_received) || 0), 0);
  const balanceDue = Math.max(0, netPayable - totalPaid);

  let nextApptDateStr = '';
  if (nextAppt && nextAppt.appointment_date) {
    nextApptDateStr = formatAppointmentDate(nextAppt.appointment_date);
  }

  const cleanDoctorAdvice = getCleanDoctorAdvice(visit.planned_procedures);

  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 30px; color: #1e293b; background: #fff; }

          .header-container { display: flex; align-items: flex-start; border-bottom: 3px solid #5C0B0B; padding-bottom: 16px; margin-bottom: 20px; }
          .clinic-details { flex: 1; }
          .clinic-details .doc { font-size: 14px; color: #0f172a; margin: 6px 0 2px 0; font-weight: bold; }
          .clinic-details .addr { font-size: 12px; color: #475569; margin: 2px 0; line-height: 1.4; }
          .bill-type { font-size: 16px; font-weight: 800; color: #5C0B0B; text-align: right; border: 2px solid #5C0B0B; padding: 6px 14px; border-radius: 6px; align-self: center; letter-spacing: 0.8px; }

          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; margin-bottom: 22px; background: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
          .info-label { font-weight: 600; color: #64748b; font-size: 13px; }
          .info-value { color: #0f172a; font-size: 13px; font-weight: 700; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background-color: #5C0B0B; color: white; padding: 10px 12px; text-align: left; font-size: 12.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
          th:last-child, td:last-child { text-align: right; }
          td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b; }
          tr:nth-child(even) td { background: #fafafa; }

          .total-box { text-align: right; padding: 14px 18px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
          .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13.5px; color: #334155; }
          .total-row.grand { font-size: 17px; font-weight: 800; color: #5C0B0B; border-top: 2px solid #5C0B0B; padding-top: 8px; margin-top: 6px; }

          .advice-box { background: #f8fafc; border-left: 4px solid #5C0B0B; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
          .footer { margin-top: 36px; text-align: center; font-size: 11.5px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 14px; }
          .go-green { color: #15803d; font-weight: 700; margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="clinic-details">
            <img src="${HEADER_BANNER_BASE64}" style="max-height:85px;max-width:350px;object-fit:contain;" />
            <p class="doc">Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai &nbsp;|&nbsp; Reg. No. RMC 31793</p>
            <p class="addr">4 C 15, Sector-4, Talwandi, Kota, Rajasthan 324005</p>
            <p class="addr">📞 +91 95091 97578 &nbsp;&nbsp;|&nbsp;&nbsp; 🌐 www.skinssence.in</p>
          </div>
          <div class="bill-type">RECEIPT / INVOICE</div>
        </div>

        <div class="info-grid">
          <div><span class="info-label">Patient Name: </span><span class="info-value">${patientName}</span></div>
          <div><span class="info-label">Invoice No: </span><span class="info-value">${invoiceNo}</span></div>
          <div><span class="info-label">Patient S ID: </span><span class="info-value">${patientSId}</span></div>
          <div><span class="info-label">Visit Date: </span><span class="info-value">${dateStr}</span></div>
          <div><span class="info-label">Mobile: </span><span class="info-value">${patientMobile}</span></div>
          <div><span class="info-label">Doctor: </span><span class="info-value">Dr. Ashima Madan (RMC 31793)</span></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:40px;text-align:center">#</th>
              <th>Description / Treatments / Medicines</th>
              <th style="width:60px;text-align:center">Qty</th>
              <th style="width:130px;text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${cFeeRow}
            ${procRows}
            ${medRows}
          </tbody>
        </table>

        <div class="total-box">
          ${cFee > 0 ? `<div class="total-row"><span>Consultation Fee</span><span>Rs. ${cFee.toFixed(2)}</span></div>` : ''}
          ${procTotal > 0 ? `<div class="total-row"><span>Procedure Total</span><span>Rs. ${procTotal.toFixed(2)}</span></div>` : ''}
          ${medTotal > 0 ? `<div class="total-row"><span>Pharmacy Total</span><span>Rs. ${medTotal.toFixed(2)}</span></div>` : ''}
          ${discAmt > 0 ? `
          <div class="total-row" style="color:#64748b;"><span>Subtotal</span><span>Rs. ${subtotalAmt.toFixed(2)}</span></div>
          <div class="total-row" style="color:#b91c1c;font-weight:bold;">
            <span>Discount ${discType === 'PERCENT' ? `(${discVal}%):` : ':'}</span>
            <span>- Rs. ${discAmt.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="total-row grand"><span>TOTAL BILL / NET PAYABLE</span><span>Rs. ${netPayable.toFixed(2)}</span></div>

          ${activeModes.length > 1 ? `
            <div style="border-top: 1px dashed #cbd5e1; margin: 8px 0 6px 0; padding-top: 8px;">
              <div style="font-size: 11.5px; font-weight: bold; color: #475569; text-transform: uppercase; margin-bottom: 4px; text-align: left; letter-spacing: 0.5px;">Payment Breakdown:</div>
              ${activeModes.map(m => `
                <div class="total-row" style="color: #15803d; font-size: 13px; padding: 2px 0;">
                  <span>• Paid via ${m}</span>
                  <span>Rs. ${modeTotals[m].toFixed(2)}</span>
                </div>
              `).join('')}
              <div class="total-row" style="color: #15803d; font-weight: bold; font-size: 14.5px; border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 4px;">
                <span>AMOUNT PAID / RECEIVED</span>
                <span>Rs. ${totalPaid.toFixed(2)}</span>
              </div>
            </div>
          ` : activeModes.length === 1 ? `
            <div class="total-row" style="color: #15803d; font-weight: bold; margin-top: 6px;">
              <span>Payment Mode</span>
              <span>${activeModes[0]}</span>
            </div>
            <div class="total-row" style="color: #15803d; font-weight: bold; font-size: 14.5px;">
              <span>AMOUNT PAID / RECEIVED</span>
              <span>Rs. ${totalPaid.toFixed(2)}</span>
            </div>
          ` : `
            <div class="total-row" style="color: #15803d; font-weight: bold; font-size: 14.5px; margin-top: 6px;">
              <span>AMOUNT PAID / RECEIVED</span>
              <span>Rs. ${totalPaid.toFixed(2)}</span>
            </div>
          `}

          <div class="total-row" style="color: ${balanceDue > 0 ? '#b91c1c' : '#15803d'}; font-weight: bold; font-size: 13px; padding-top: 4px; border-top: 1px solid #e2e8f0; margin-top: 4px;">
            <span>BALANCE DUE</span>
            <span>${balanceDue > 0 ? `Rs. ${balanceDue.toFixed(2)}` : 'Rs. 0.00 (Fully Paid)'}</span>
          </div>
        </div>

        ${(cleanDoctorAdvice || nextAppt) ? `
          <div class="advice-box">
            ${cleanDoctorAdvice ? `
              <div style="margin-bottom: ${nextAppt ? '10px' : '0'};">
                <div style="font-weight:bold;color:#5C0B0B;font-size:13px;margin-bottom:3px;letter-spacing:0.3px;">
                  📋 Doctor's Advice / Home Care:
                </div>
                <div style="color:#334155;font-size:13px;line-height:1.4;">${cleanDoctorAdvice}</div>
              </div>
            ` : ''}
            ${nextAppt ? `
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:9px 14px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <span style="font-weight:bold;color:#991b1b;font-size:13px;">📅 Next Appointment / Follow-up:</span>
                  ${nextAppt.notes && !nextAppt.notes.includes('undefined') ? `<div style="color:#b91c1c;font-size:12px;margin-top:2px;">Purpose: ${nextAppt.notes}</div>` : ''}
                </div>
                <span style="font-weight:bold;color:#7f1d1d;font-size:14px;background:#fee2e2;border:1px solid #fca5a5;padding:5px 12px;border-radius:5px;letter-spacing:0.3px;">
                  ${nextApptDateStr} ${nextAppt.appointment_time ? '• ' + nextAppt.appointment_time : ''}
                </span>
              </div>
            ` : ''}
          </div>` : `
          <div class="advice-box" style="background:#f8fafc;border-left:4px solid #94a3b8;padding:10px 14px;border-radius:6px;margin-bottom:20px;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:bold;color:#64748b;font-size:13px;">📅 Next Appointment / Follow-up:</span>
            <span style="color:#94a3b8;font-size:12px;font-style:italic;">No next appointment booked</span>
          </div>
        `}

        <div class="footer">
          <p>Thank you for choosing Skinssence Laser & Skincare Clinic!</p>
          <p style="margin-top:2px;">Dr. Ashima Madan &nbsp;|&nbsp; MBBS, MD, FAM – DJPIMAC, Mumbai &nbsp;|&nbsp; RMC Reg. No. 31793</p>
          <p class="go-green">🌿 Go Green — Thank you for choosing a digital receipt!</p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generates an official named PDF bill file and returns its URI and canonical filename.
 */
export async function generateVisitBillPdfAsync({ patient, visit, nextApptOverride }) {
  const token = await AsyncStorage.getItem('userToken');
  const visitId = visit.visit_id || visit.id;

  let fullVisit = { ...visit };
  let fullPatient = { ...patient };

  // If procedures or medicines are missing from the summary item, fetch full visit details
  if ((!fullVisit.procedures || fullVisit.procedures.length === 0) && visitId) {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/visits/${visitId}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        if (res.data.visit) fullVisit = { ...fullVisit, ...res.data.visit };
        if (res.data.procedures) fullVisit.procedures = res.data.procedures;
        if (res.data.medicines) fullVisit.medicines = res.data.medicines;
        if (res.data.payments) fullVisit.payments = res.data.payments;
        if (res.data.patient) fullPatient = { ...fullPatient, ...res.data.patient };
      }
    } catch (e) {
      console.log('Error fetching visit details for bill:', e?.message);
    }
  }

  // Live appointment check
  let nextAppt = nextApptOverride !== undefined ? nextApptOverride : fullVisit.next_appointment;
  if (nextApptOverride === undefined && !nextAppt && (fullPatient.id || fullPatient.skinssence_id)) {
    try {
      const apptRes = await axios.get(`${API_BASE_URL}/api/appointments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (apptRes.data && Array.isArray(apptRes.data)) {
        const todayStr = new Date().toISOString().split('T')[0];
        const matched = apptRes.data.filter(a =>
          (String(a.patient_id) === String(fullPatient.id) ||
            String(a.patient_id).toLowerCase() === String(fullPatient.skinssence_id || '').toLowerCase() ||
            (fullPatient.mobile && a.mobile && a.mobile.replace(/\D/g, '') === fullPatient.mobile.replace(/\D/g, ''))) &&
          (!a.status || !a.status.toUpperCase().includes('CANCEL')) &&
          (a.appointment_date >= todayStr)
        ).sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));

        if (matched.length > 0) nextAppt = matched[0];
      }
    } catch (e) {
      console.log('Live appointment fetch note:', e?.message);
    }
  }

  const vDate = fullVisit.visit_date || fullVisit.created_at || new Date();
  const dateStr = new Date(vDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const yearStr = new Date().getFullYear();
  let invoiceNo = fullVisit.invoice_number || `SKN-${visitId}-${yearStr}`;

  // Try saving invoice in backend if endpoint available
  try {
    const cFee = parseFloat(fullVisit.consultation_fee) || 0;
    const procTotal = (fullVisit.procedures || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const medTotal = (fullVisit.medicines || []).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);
    const subtotal = cFee + procTotal + medTotal;
    const discAmt = parseFloat(fullVisit.discount_amount) || parseFloat(fullVisit.discount) || 0;
    const net = Math.max(0, subtotal - discAmt);
    const totalPaid = (fullVisit.payments || []).reduce((s, p) => s + (parseFloat(p.amount_received) || 0), 0);

    const invRes = await axios.post(`${API_BASE_URL}/api/invoices`, {
      patient_id: fullPatient.id,
      visit_id: visitId,
      items_json: [
        ...(cFee > 0 ? [{ name: 'Consultation Fee', qty: 1, amount: cFee }] : []),
        ...(fullVisit.procedures || []).map(p => ({ name: p.name, area: p.area, notes: p.notes, qty: 1, amount: p.amount })),
        ...(fullVisit.medicines || []).map(m => ({ name: m.details, qty: 1, amount: m.amount }))
      ],
      subtotal,
      discount_amount: discAmt,
      discount: discAmt,
      grand_total: net,
      net_payable: net,
      amount_paid: totalPaid
    }, { headers: { Authorization: `Bearer ${token}` } });

    if (invRes.data?.invoice_number) {
      invoiceNo = invRes.data.invoice_number;
    }
  } catch (invErr) {
    // Ignore if duplicate or offline
  }

  const html = buildVisitBillHtml({
    patient: fullPatient,
    visit: fullVisit,
    invoiceNo,
    dateStr,
    nextAppt
  });

  const { uri } = await Print.printToFileAsync({ html });
  const patientFullName = `${fullPatient.first_name || ''} ${fullPatient.last_name || ''}`.trim() || fullPatient.name || 'Patient';
  const { uri: namedPdfUri, filename } = await renameBillPdfAsync(uri, patientFullName, invoiceNo);

  return {
    pdfUri: namedPdfUri,
    filename,
    invoiceNumber: invoiceNo,
    patient: fullPatient,
    visit: fullVisit
  };
}

/**
 * Generates the official branded PDF bill and launches the verified WhatsApp sharing flow.
 */
export async function generateAndShareVisitBillPdfAsync({
  patient,
  visit,
  nextApptOverride,
  inFlightRef,
  onSentSuccess
}) {
  const result = await generateVisitBillPdfAsync({ patient, visit, nextApptOverride });

  await shareBillToWhatsAppAsync({
    pdfUri: result.pdfUri,
    filename: result.filename,
    patient: result.patient,
    visitId: visit.visit_id || visit.id,
    inFlightRef,
    onSentSuccess
  });

  return result;
}
