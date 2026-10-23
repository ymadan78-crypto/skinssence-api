import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Linking, Alert } from 'react-native';
import { HEADER_BANNER_BASE64, LOGO_BASE64 } from '../constants/billAssets';
import { sanitizeFilenameComponent } from './billNaming';

/**
 * Format date nicely: "15 Dec 2026"
 */
function formatPlanDate(dateStr) {
  if (!dateStr) return 'As Scheduled';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Calculate days between two dates
 */
function calculateDaysRemaining(targetDateStr) {
  if (!targetDateStr) return null;
  const target = new Date(targetDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Generates the luxury branded HTML template for the Pre-Bridal Protocol Roadmap.
 */
export function buildPrebridalProtocolHtml({
  patient,
  plan,
  milestones = []
}) {
  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'Valued Patient';
  const skinssenceId = patient.skinssence_id || `#${patient.id || ''}`;
  const mobile = patient.mobile || '';
  const eventName = plan.event_name || 'Wedding';
  const targetEventDate = formatPlanDate(plan.target_event_date);
  const daysLeft = calculateDaysRemaining(plan.target_event_date);
  const countdownText = daysLeft !== null 
    ? (daysLeft > 0 ? `${daysLeft} Days to ${eventName}` : (daysLeft === 0 ? `Today is the ${eventName}!` : `${Math.abs(daysLeft)} Days post-${eventName}`))
    : 'Timeline Customised';

  const planTitle = (plan.plan_title || 'Customised Pre-Bridal Skin & Hair Protocol').toUpperCase();
  const totalVal = parseFloat(plan.total_estimated_value) || 0;
  const agreedPrice = parseFloat(plan.agreed_package_price) || 0;
  const advance = parseFloat(plan.advance_amount) || 0;
  const balance = Math.max(0, agreedPrice - advance);

  const milestonesHtml = (milestones || []).map((m, idx) => {
    const seq = m.sequence_order || (idx + 1);
    const dateFormatted = formatPlanDate(m.target_date);
    const daysBefore = m.days_before_event !== null && m.days_before_event !== undefined 
      ? `D - ${m.days_before_event} Days` 
      : null;

    let procsList = [];
    try {
      procsList = Array.isArray(m.procedures) ? m.procedures : JSON.parse(m.procedures_json || '[]');
    } catch (e) {
      procsList = [];
    }

    const procsRows = procsList.map((p, pIdx) => {
      const pName = typeof p === 'string' ? p : (p.name || 'Custom Procedure');
      const pNotes = (typeof p === 'object' && p.notes) ? `<span class="proc-note">(${p.notes})</span>` : '';
      const pArea = (typeof p === 'object' && p.area) ? `<span class="proc-area">• Area: ${p.area}</span>` : '';
      return `
        <div class="proc-item">
          <span class="proc-bullet">✦</span>
          <span class="proc-name">${pName}</span>
          ${pArea}
          ${pNotes}
        </div>
      `;
    }).join('');

    const statusBadge = m.status === 'COMPLETED'
      ? `<span class="badge badge-completed">✓ Completed</span>`
      : `<span class="badge badge-planned">Planned</span>`;

    return `
      <div class="milestone-card">
        <div class="milestone-header">
          <div class="milestone-step-pill">
            <span class="step-num">STEP ${seq}</span>
            ${daysBefore ? `<span class="days-badge">${daysBefore}</span>` : ''}
          </div>
          <div class="milestone-date-box">
            <span class="date-icon">📅</span>
            <span class="date-text">${dateFormatted}</span>
            ${statusBadge}
          </div>
        </div>

        <div class="milestone-title-text">${m.milestone_title || `Milestone ${seq}`}</div>

        <div class="procedures-container">
          <div class="proc-section-label">SCHEDULED CLINICAL PROCEDURES:</div>
          ${procsRows || '<div class="proc-item"><em>Procedures to be finalised upon consultation</em></div>'}
        </div>

        ${m.notes ? `
          <div class="milestone-clinical-notes">
            <span class="note-label">Clinical Care Note:</span> ${m.notes}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${planTitle} - ${patientName}</title>
        <style>
          @page {
            size: A4;
            margin: 10mm 12mm 12mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 0;
            background-color: #fff;
            font-size: 11pt;
            line-height: 1.45;
          }

          /* Luxury Header Banner */
          .clinic-header {
            text-align: center;
            border-bottom: 2px solid #5C0B0B;
            padding-bottom: 12px;
            margin-bottom: 14px;
          }
          .clinic-logo {
            max-height: 70px;
            max-width: 220px;
            margin-bottom: 6px;
          }
          .clinic-name {
            font-size: 18pt;
            font-weight: 800;
            color: #5C0B0B;
            letter-spacing: 1.5px;
            margin: 0;
            text-transform: uppercase;
          }
          .clinic-tagline {
            font-size: 8.5pt;
            letter-spacing: 2.5px;
            color: #b45309;
            text-transform: uppercase;
            margin-top: 2px;
            font-weight: 600;
          }
          .clinic-sub {
            font-size: 8pt;
            color: #64748b;
            margin-top: 3px;
          }

          /* Document Title Ribbon */
          .protocol-title-ribbon {
            background: linear-gradient(135deg, #5C0B0B 0%, #831843 100%);
            color: #ffffff;
            padding: 10px 16px;
            border-radius: 6px;
            text-align: center;
            margin-bottom: 14px;
          }
          .protocol-type-badge {
            font-size: 7.5pt;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #fde68a;
            font-weight: 700;
            margin-bottom: 2px;
          }
          .protocol-main-title {
            font-size: 13pt;
            font-weight: 800;
            letter-spacing: 0.8px;
            margin: 0;
            text-transform: uppercase;
          }
          .protocol-patient-subtitle {
            font-size: 8.5pt;
            color: #f1f5f9;
            margin-top: 3px;
          }

          /* Patient & Event Summary Card */
          .patient-card {
            background-color: #fdf8f6;
            border: 1px solid #fed7aa;
            border-left: 4px solid #ea580c;
            border-radius: 6px;
            padding: 10px 14px;
            display: flex;
            justify-content: space-between;
            margin-bottom: 16px;
          }
          .patient-col {
            flex: 1;
          }
          .card-row {
            font-size: 9pt;
            margin-bottom: 4px;
          }
          .card-label {
            color: #7c2d12;
            font-weight: 700;
            display: inline-block;
            width: 105px;
          }
          .card-val {
            color: #1e293b;
            font-weight: 600;
          }
          .countdown-pill {
            display: inline-block;
            background-color: #ea580c;
            color: #fff;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 8pt;
            font-weight: 800;
            letter-spacing: 0.5px;
            margin-top: 4px;
          }

          /* Section Title */
          .section-title {
            font-size: 10.5pt;
            font-weight: 800;
            color: #5C0B0B;
            border-bottom: 1.5px solid #e2e8f0;
            padding-bottom: 4px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            display: flex;
            align-items: center;
          }
          .section-title span {
            background-color: #5C0B0B;
            color: #fff;
            padding: 2px 6px;
            border-radius: 3px;
            margin-right: 6px;
            font-size: 8pt;
          }

          /* Milestone Timeline Cards */
          .milestones-wrapper {
            margin-bottom: 16px;
          }
          .milestone-card {
            background-color: #ffffff;
            border: 1.5px solid #e2e8f0;
            border-left: 5px solid #5C0B0B;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 10px;
            page-break-inside: avoid;
          }
          .milestone-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px dashed #cbd5e1;
            padding-bottom: 6px;
            margin-bottom: 8px;
          }
          .milestone-step-pill {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .step-num {
            background-color: #5C0B0B;
            color: #ffffff;
            font-size: 8pt;
            font-weight: 800;
            padding: 2px 7px;
            border-radius: 3px;
            letter-spacing: 0.5px;
          }
          .days-badge {
            background-color: #fef3c7;
            color: #92400e;
            border: 1px solid #fde68a;
            font-size: 7.5pt;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 3px;
          }
          .milestone-date-box {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .date-icon {
            font-size: 9pt;
          }
          .date-text {
            font-size: 9pt;
            font-weight: 700;
            color: #334155;
          }
          .badge {
            font-size: 7pt;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 10px;
            text-transform: uppercase;
          }
          .badge-completed {
            background-color: #dcfce7;
            color: #166534;
            border: 1px solid #bbf7d0;
          }
          .badge-planned {
            background-color: #f1f5f9;
            color: #475569;
            border: 1px solid #e2e8f0;
          }
          .milestone-title-text {
            font-size: 10.5pt;
            font-weight: 800;
            color: #1e1b4b;
            margin-bottom: 6px;
          }
          .procedures-container {
            background-color: #faf5ff;
            border: 1px solid #f3e8ff;
            border-radius: 5px;
            padding: 8px 10px;
            margin-bottom: 6px;
          }
          .proc-section-label {
            font-size: 7.5pt;
            font-weight: 800;
            color: #6b21a8;
            letter-spacing: 0.8px;
            margin-bottom: 4px;
          }
          .proc-item {
            font-size: 9pt;
            color: #3b0764;
            margin-bottom: 3px;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
          }
          .proc-bullet {
            color: #9333ea;
            font-size: 7pt;
            margin-right: 6px;
          }
          .proc-name {
            font-weight: 700;
          }
          .proc-area {
            color: #6b21a8;
            font-size: 8pt;
            margin-left: 6px;
            font-style: italic;
          }
          .proc-note {
            color: #64748b;
            font-size: 8pt;
            margin-left: 6px;
          }
          .milestone-clinical-notes {
            font-size: 8pt;
            color: #475569;
            background-color: #f8fafc;
            border-left: 3px solid #cbd5e1;
            padding: 4px 8px;
            border-radius: 2px;
            margin-top: 4px;
          }
          .note-label {
            font-weight: 700;
            color: #334155;
          }

          /* Guidelines Card */
          .guidelines-box {
            background-color: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 14px;
            font-size: 8.5pt;
            page-break-inside: avoid;
          }
          .guidelines-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 14px;
            margin-top: 4px;
          }
          .guide-item {
            display: flex;
            align-items: flex-start;
            color: #1e3a8a;
          }
          .guide-bullet {
            color: #2563eb;
            margin-right: 5px;
            font-weight: bold;
          }

          /* Commercial / Investment Agreement (Bottom of Plan) */
          .investment-agreement {
            background-color: #f8fafc;
            border: 1.5px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 14px;
            page-break-inside: avoid;
          }
          .investment-header {
            font-size: 9.5pt;
            font-weight: 800;
            color: #5C0B0B;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
          }
          .investment-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          .inv-item {
            text-align: center;
            flex: 1;
            border-right: 1px solid #e2e8f0;
            padding: 0 4px;
          }
          .inv-item:last-child {
            border-right: none;
          }
          .inv-label {
            font-size: 7.5pt;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 2px;
          }
          .inv-val {
            font-size: 11pt;
            font-weight: 800;
            color: #0f172a;
          }
          .inv-val-highlight {
            color: #15803d;
          }
          .inv-terms-box {
            background-color: #ffffff;
            border: 1px dashed #94a3b8;
            border-radius: 4px;
            padding: 6px 10px;
            font-size: 8pt;
            color: #334155;
          }
          .inv-terms-label {
            font-weight: 700;
            color: #0f172a;
          }

          /* Footer */
          .footer {
            margin-top: 10px;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
            font-size: 7.5pt;
            color: #64748b;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .sig-box {
            text-align: center;
            width: 140px;
          }
          .sig-line {
            border-top: 1px solid #334155;
            margin-top: 30px;
            padding-top: 2px;
            font-weight: bold;
            color: #1e293b;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="clinic-header">
          <h1 class="clinic-name">SKINSSENCE</h1>
          <div class="clinic-tagline">Laser & Skincare Clinic • Est. Aesthetic Excellence</div>
          <div class="clinic-sub">Opp. Medical College, Circular Road, Rewari | Helpline: 095091 97578 | www.skinssence.in</div>
        </div>

        <!-- Document Ribbon -->
        <div class="protocol-title-ribbon">
          <div class="protocol-type-badge">AESTHETIC CLINICAL ROADMAP & COMMITMENT</div>
          <h2 class="protocol-main-title">${planTitle}</h2>
          <div class="protocol-patient-subtitle">Specially curated aesthetic transformation roadmap for <strong>${patientName}</strong></div>
        </div>

        <!-- Patient & Event Profile -->
        <div class="patient-card">
          <div class="patient-col">
            <div class="card-row"><span class="card-label">Patient Name:</span><span class="card-val">${patientName}</span></div>
            <div class="card-row"><span class="card-label">Skinssence ID:</span><span class="card-val">${skinssenceId}</span></div>
            <div class="card-row"><span class="card-label">Contact:</span><span class="card-val">${mobile || 'N/A'}</span></div>
          </div>
          <div class="patient-col" style="text-align: right;">
            <div class="card-row"><span class="card-label" style="text-align: right;">Target Event:</span><span class="card-val">${eventName}</span></div>
            <div class="card-row"><span class="card-label" style="text-align: right;">Event Date:</span><span class="card-val">${targetEventDate}</span></div>
            <div><span class="countdown-pill">${countdownText}</span></div>
          </div>
        </div>

        <!-- Sequenced Milestones -->
        <div class="section-title"><span>✦</span> Sequenced Treatment Roadmap (Chronological Milestones)</div>
        <div class="milestones-wrapper">
          ${milestonesHtml || '<div style="text-align:center; padding: 20px; color: #64748b;">No milestones added yet.</div>'}
        </div>

        <!-- Essential Bridal Guidelines -->
        <div class="guidelines-box">
          <strong style="color: #1e40af; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px;">✦ Essential Pre-Bridal Care Instructions</strong>
          <div class="guidelines-grid">
            <div class="guide-item"><span class="guide-bullet">✓</span> Apply broad-spectrum SPF 50 sunscreen every 3 hours indoors and outdoors.</div>
            <div class="guide-item"><span class="guide-bullet">✓</span> Drink minimum 2.5–3 liters of water daily to maintain cellular hydration.</div>
            <div class="guide-item"><span class="guide-bullet">✓</span> Pause chemical exfoliants, retinoids, or AHAs 3 days prior to laser/peel sessions.</div>
            <div class="guide-item"><span class="guide-bullet">✓</span> Strictly avoid waxing, threading, or bleach on treated areas 5 days around sessions.</div>
          </div>
        </div>

        <!-- Commercial / Investment Agreement Summary -->
        <div class="investment-agreement">
          <div class="investment-header">
            <span>Package Investment & Financial Agreement</span>
            <span style="font-size: 8pt; color: #64748b;">Plan Status: Active Agreement</span>
          </div>

          <div class="investment-grid">
            <div class="inv-item">
              <div class="inv-label">Standard Value</div>
              <div class="inv-val" style="color: #64748b; text-decoration: ${totalVal > agreedPrice ? 'line-through' : 'none'};">
                ₹${totalVal.toLocaleString('en-IN')}
              </div>
            </div>
            <div class="inv-item">
              <div class="inv-label">Agreed Package Investment</div>
              <div class="inv-val inv-val-highlight">₹${agreedPrice.toLocaleString('en-IN')}</div>
            </div>
            <div class="inv-item">
              <div class="inv-label">Advance Paid</div>
              <div class="inv-val" style="color: #15803d;">₹${advance.toLocaleString('en-IN')}</div>
            </div>
            <div class="inv-item">
              <div class="inv-label">Balance Remaining</div>
              <div class="inv-val" style="color: ${balance > 0 ? '#b91c1c' : '#15803d'};">₹${balance.toLocaleString('en-IN')}</div>
            </div>
          </div>

          ${plan.payment_terms ? `
            <div class="inv-terms-box">
              <span class="inv-terms-label">Payment Milestone Schedule:</span> ${plan.payment_terms}
            </div>
          ` : ''}

          <div style="font-size: 7.5pt; color: #64748b; margin-top: 6px; font-style: italic;">
            • Official tax invoices and receipt slips are provided separately upon each payment transaction.<br>
            • Customised protocols are tailored exclusively for the client and are non-transferable.
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div>
            <strong>Skinssence Laser and Skincare Clinic</strong><br>
            Medical aesthetics, laser cosmetology, and advanced dermatology.<br>
            🌿 <em>Go Green! This is your official digital treatment protocol.</em>
          </div>
          <div class="sig-box">
            <div class="sig-line">Doctor / Clinic Signatory</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generates the PDF file, names it appropriately, and returns the file URI and filename.
 */
export async function generatePrebridalProtocolPdfAsync({ patient, plan, milestones }) {
  try {
    const html = buildPrebridalProtocolHtml({ patient, plan, milestones });
    const { uri } = await Print.printToFileAsync({ html });

    const patientFullName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'Patient';
    const cleanPatient = sanitizeFilenameComponent(patientFullName, 'Patient');
    const brandedFilename = `${cleanPatient}_Skinssence_PreBridal_Protocol.pdf`;
    const targetUri = `${FileSystem.documentDirectory}${brandedFilename}`;

    // Move / copy to standardized branded filename
    try {
      await FileSystem.copyAsync({ from: uri, to: targetUri });
      return { uri: targetUri, filename: brandedFilename, html };
    } catch (copyErr) {
      return { uri, filename: brandedFilename, html };
    }
  } catch (err) {
    console.error('[PrebridalPdf] PDF Generation Error:', err);
    throw err;
  }
}

/**
 * Shares the PDF to WhatsApp with a prefilled congratulatory bridal message.
 */
export async function sharePrebridalToWhatsAppAsync({ pdfUri, filename, patient, plan }) {
  try {
    const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'Patient';
    const mobile = patient.mobile;
    const planTitle = plan.plan_title || 'Customised Pre-Bridal Skin & Hair Protocol';
    const eventDate = formatPlanDate(plan.target_event_date);

    const message = `Dear ${patientName},\n\nCongratulations on your upcoming wedding / special event! 💐✨\n\nDr. and the team at Skinssence have curated your personalised *${planTitle}*.\n\n📅 *Target Event Date:* ${eventDate}\n\nPlease find your attached Aesthetic Roadmap & Treatment Timeline PDF with scheduled session dates and guidelines.\n\nWe look forward to giving you the ultimate bridal glow! ✨\n\nWarm regards,\n*Skinssence Laser & Skincare Clinic*\n📞 095091 97578 | www.skinssence.in`;

    const canShare = await Sharing.isAvailableAsync();
    if (canShare && pdfUri) {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${filename} with ${patientName}`,
        UTI: 'com.adobe.pdf'
      });
    } else if (mobile) {
      Linking.openURL(`whatsapp://send?phone=91${mobile}&text=${encodeURIComponent(message)}`);
    } else {
      Alert.alert('Sharing Unavailable', 'Unable to open share dialog on this device.');
    }
  } catch (err) {
    console.error('[PrebridalPdf] WhatsApp Share Error:', err);
    Alert.alert('Error', 'Could not share the protocol document.');
  }
}
