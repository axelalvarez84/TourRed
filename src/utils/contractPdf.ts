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

export async function generateAndUploadSignedContract(
  agencyId: string,
  data: SigningData,
): Promise<{ signedUrl: string; documentHash: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-signed-contract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ agency_id: agencyId, signing_data: data }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.detail || 'Error al generar el PDF del contrato');

  return { signedUrl: json.signed_url, documentHash: json.hash };
}
