import jsPDF from 'jspdf';
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

export async function generateAndUploadSignedContract(
  agencyId: string,
  data: SigningData,
): Promise<{ signedUrl: string; documentHash: string; pdfBlob: Blob }> {
  const filledHtml = fillTemplate(data);
  const documentHash = await sha256Hex(filledHtml);

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });

  await pdf.html(filledHtml, {
    callback: () => {},
    autoPaging: 'text',
    margin: [36, 36, 50, 36],
    width: 540,
    windowWidth: 800,
  });

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
