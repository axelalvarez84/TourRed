import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import contractTemplate from '../components/contracts/contrato_agencia_template.html?raw';
import { supabase } from '../lib/supabase';

export interface SigningData {
  razonSocial: string;
  rfcAgencia: string;
  domicilioFiscal: string;
  representanteLegal: string;
  emailContacto: string;
  folioContrato: string;
  fechaDia: string;
  fechaMes: string;
  fechaAnio: string;
  versionContrato: string;
  commissionPercentage: number;
  emailAceptacion: string;
  fechaHoraAceptacion: string;
  ipAceptacion: string;
  userAgentAceptacion: string;
  otpEstatus: string;
}

function fillTemplate(data: SigningData): string {
  let html = contractTemplate;
  const replacements: Record<string, string> = {
    razon_social:           data.razonSocial,
    rfc_agencia:            data.rfcAgencia,
    representante_legal:    data.representanteLegal,
    email_contacto:         data.emailContacto,
    domicilio_fiscal:       data.domicilioFiscal,
    fecha_dia:              data.fechaDia,
    fecha_mes:              data.fechaMes,
    fecha_anio:             data.fechaAnio,
    folio_contrato:         data.folioContrato,
    version_contrato:       data.versionContrato,
    fecha_hora_aceptacion:  data.fechaHoraAceptacion,
    ip_aceptacion:          data.ipAceptacion,
    user_agent_aceptacion:  data.userAgentAceptacion,
    otp_estatus:            data.otpEstatus,
    hash_documento:         'Generado en el momento de la firma',
  };
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Letter size in points (1pt = 1/72 inch)
// 8.5in x 11in = 612pt x 792pt
const PAGE_WIDTH_PT  = 612;
const PAGE_HEIGHT_PT = 792;
const MARGIN_PT = 36; // 0.5 inch margin

async function renderContractPdf(filledHtml: string): Promise<jsPDF> {
  // Create a hidden iframe so the browser renders the HTML with full CSS support
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '816px';  // 8.5in at 96dpi
  iframe.style.height = '1056px'; // 11in at 96dpi
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  try {
    // Write the HTML into the iframe and wait for it to load
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('Error al cargar el iframe del contrato'));
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(filledHtml);
      doc.close();
    });

    // Give the browser a moment to fully render (fonts, layout)
    await new Promise(r => setTimeout(r, 300));

    const iframeDoc = iframe.contentDocument!;
    const iframeBody = iframeDoc.body;

    // Set the body to a fixed width matching letter size at 96dpi
    // and remove the gray background / padding for clean capture
    const styleEl = iframeDoc.createElement('style');
    styleEl.textContent = `
      body {
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        width: 816px !important;
      }
      .cover-page, .legal-body, .otp-appendix {
        margin: 0 0 20px 0 !important;
        border-radius: 0 !important;
        border: none !important;
        padding: 40px 48px !important;
      }
      .otp-appendix {
        page-break-before: always !important;
        break-before: page !important;
      }
    `;
    iframeDoc.head.appendChild(styleEl);

    // Wait for styles to apply
    await new Promise(r => setTimeout(r, 200));

    // Capture the full body with html2canvas
    const canvas = await html2canvas(iframeBody, {
      scale: 2,          // 2x for crisp text
      useCORS: true,
      backgroundColor: '#ffffff',
      width: 816,
      windowWidth: 816,
    });

    // Slice the canvas into page-sized chunks and add to PDF
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const imgWidthPt  = PAGE_WIDTH_PT - 2 * MARGIN_PT;
    const imgHeightPt = PAGE_HEIGHT_PT - 2 * MARGIN_PT;

    // How many pixels of canvas correspond to one PDF page height
    // canvas is in pixels, PDF is in points
    // imgWidthPt corresponds to the full canvas width
    const scale = imgWidthPt / canvas.width;
    const pageHeightPx = canvas.width * (imgHeightPt / imgWidthPt);
    const totalPages = Math.ceil(canvas.height / pageHeightPx);

    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage();

      // Create a sub-canvas for this page
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width  = canvas.width;
      pageCanvas.height = Math.min(pageHeightPx, canvas.height - i * pageHeightPx);
      const ctx = pageCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0, i * pageHeightPx,
        canvas.width, pageCanvas.height,
        0, 0,
        pageCanvas.width, pageCanvas.height,
      );

      const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', MARGIN_PT, MARGIN_PT, imgWidthPt, imgWidthPt * (pageCanvas.height / pageCanvas.width));
    }

    return pdf;
  } finally {
    document.body.removeChild(iframe);
  }
}

export async function generateAndUploadSignedContract(
  agencyId: string,
  data: SigningData,
): Promise<{ signedUrl: string; documentHash: string; pdfBlob: Blob }> {
  const filledHtml = fillTemplate(data);
  const documentHash = await sha256Hex(filledHtml);

  const pdf = await renderContractPdf(filledHtml);

  const pdfBlob = pdf.output('blob');
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const storagePath = `${agencyId}/contratos/${data.folioContrato}.pdf`;

  // Remove existing file at this path first (avoids RLS UPDATE policy gap with upsert)
  await supabase.storage.from('agency-documents').remove([storagePath]);

  const { error: uploadErr } = await supabase.storage
    .from('agency-documents')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false });

  if (uploadErr) throw new Error(`Error al subir el PDF: ${uploadErr.message}`);

  const { data: urlData, error: urlErr } = await supabase.storage
    .from('agency-documents')
    .createSignedUrl(storagePath, 31536000);

  if (urlErr || !urlData?.signedUrl) throw new Error('Error al generar la URL del contrato');

  await supabase
    .from('agencies')
    .update({ signed_contract_url: urlData.signedUrl })
    .eq('id', agencyId);

  await supabase.from('agency_documents').insert({
    agency_id:         agencyId,
    document_type_key: 'contrato_agencia',
    storage_path:      storagePath,
    file_name:         `${data.folioContrato}.pdf`,
    mime_type:         'application/pdf',
    file_size_bytes:   pdfBytes.length,
    is_current:        true,
    status:            'approved',
    uploaded_by:       (await supabase.auth.getUser()).data.user?.id ?? null,
  }).select();

  return { signedUrl: urlData.signedUrl, documentHash, pdfBlob };
}
