import * as FileSystem from 'expo-file-system/legacy';

/**
 * Sanitizes a filename component by:
 * - Preserving all meaningful words
 * - Replacing spaces and punctuation with underscores
 * - Removing invalid filesystem characters
 * - Collapsing multiple underscores into a single underscore
 */
export function sanitizeFilenameComponent(rawStr, fallback = 'Unknown') {
  if (!rawStr || typeof rawStr !== 'string') return fallback;

  // Trim and replace any space/tab/newline sequence with underscore
  let cleaned = rawStr.trim().replace(/\s+/g, '_');

  // Remove any character that is not alphanumeric, underscore, or hyphen
  cleaned = cleaned.replace(/[^a-zA-Z0-9_\-]/g, '');

  // Collapse multiple consecutive underscores
  cleaned = cleaned.replace(/_+/g, '_');

  // Strip leading/trailing underscores or hyphens
  cleaned = cleaned.replace(/^[_\-]+|[_\-]+$/g, '');

  return cleaned || fallback;
}

/**
 * Builds the canonical Skinssence patient bill filename:
 * Format: [Patient_Name]_Skinssence_[Invoice_Number].pdf
 *
 * Examples:
 * - Jaspal_Singh_Skinssence_SKN-20260909-0005.pdf
 * - Rahul_Sharma_Skinssence_SKN-20260909-0006.pdf
 * - Neha_Gupta_Skinssence_SKN-20260909-0007.pdf
 */
export function formatSkinssenceBillFilename(patientName, invoiceNumber) {
  const cleanPatient = sanitizeFilenameComponent(patientName, 'Patient');
  const cleanInvoice = sanitizeFilenameComponent(invoiceNumber, 'BILL');
  return `${cleanPatient}_Skinssence_${cleanInvoice}.pdf`;
}

/**
 * Renames an expo-print generated PDF file (which starts with a random UUID)
 * to the standardized [Patient_Name]_Skinssence_[Invoice_Number].pdf file
 * before presenting or returning it to the user.
 *
 * If a file with the same name already exists, appends _1, _2, etc. (never reverts to UUID).
 *
 * @param {string} originalUri - Temporary URI from Print.printToFileAsync
 * @param {string} patientName - Patient / Client full name
 * @param {string} invoiceNumber - Invoice / Bill number
 * @returns {Promise<{ uri: string, filename: string }>} - Renamed file URI and canonical filename
 */
export async function renameBillPdfAsync(originalUri, patientName, invoiceNumber) {
  const cleanPatient = sanitizeFilenameComponent(patientName, 'Patient');
  const cleanInvoice = sanitizeFilenameComponent(invoiceNumber, 'BILL');
  const baseName = `${cleanPatient}_Skinssence_${cleanInvoice}`;

  if (!originalUri) {
    return { uri: originalUri, filename: `${baseName}.pdf` };
  }

  try {
    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDir) {
      console.warn('[BillNaming] FileSystem directory unavailable, using original URI.');
      return { uri: originalUri, filename: `${baseName}.pdf` };
    }

    const billsDir = `${baseDir}SkinssenceBills/`;

    // Ensure target directory exists
    const dirInfo = await FileSystem.getInfoAsync(billsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(billsDir, { intermediates: true });
    }

    // Determine unique target filename (handles collisions with _1, _2...)
    let candidateFilename = `${baseName}.pdf`;
    let targetUri = `${billsDir}${candidateFilename}`;
    let collisionIndex = 1;

    let targetInfo = await FileSystem.getInfoAsync(targetUri);
    while (targetInfo.exists) {
      candidateFilename = `${baseName}_${collisionIndex}.pdf`;
      targetUri = `${billsDir}${candidateFilename}`;
      collisionIndex++;
      targetInfo = await FileSystem.getInfoAsync(targetUri);
    }

    // Copy file to the new branded filename
    await FileSystem.copyAsync({
      from: originalUri,
      to: targetUri
    });

    console.log(`[BillNaming] Successfully renamed bill PDF from UUID to: ${candidateFilename}`);
    return {
      uri: targetUri,
      filename: candidateFilename
    };
  } catch (err) {
    console.error('[BillNaming] Error renaming PDF bill, falling back to original:', err);
    return {
      uri: originalUri,
      filename: `${baseName}.pdf`
    };
  }
}
