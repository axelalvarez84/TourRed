import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { payout_id } = await req.json();
    if (!payout_id) {
      return new Response(JSON.stringify({ error: "payout_id is required" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("accounting_provider, accounting_sync_enabled")
      .maybeSingle();

    if (!settings?.accounting_sync_enabled || settings.accounting_provider === "none") {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payout, error } = await supabase
      .from("agency_payouts")
      .select(`
        id, amount, commission_amount, net_amount, status, created_at, paid_at, notes, reference_number,
        agencies (id, user_id, rfc, razon_social, regimen_fiscal, postal_code,
          users (email, first_name, last_name))
      `)
      .eq("id", payout_id)
      .maybeSingle();

    if (error || !payout) {
      return new Response(JSON.stringify({ error: "Payout not found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agency = payout.agencies as {
      id: string; user_id: string; rfc?: string; razon_social?: string; regimen_fiscal?: string; postal_code?: string;
      users: { email?: string; first_name?: string; last_name?: string };
    };

    const { data: existingAgencyLog } = await supabase
      .from("accounting_sync_log")
      .select("external_entity_id")
      .eq("provider", settings.accounting_provider)
      .eq("record_type", "contact_agency")
      .eq("record_id", agency.id)
      .eq("status", "synced")
      .maybeSingle();

    let agencyExternalId = existingAgencyLog?.external_entity_id;

    if (!agencyExternalId) {
      const contactRes = await supabase.functions.invoke("sync-to-accounting", {
        body: {
          action: "sync_contact",
          record_type: "contact_agency",
          record_id: agency.id,
          data: {
            id: agency.id,
            type: "agency",
            name: agency.razon_social || `${agency.users?.first_name || ""} ${agency.users?.last_name || ""}`.trim() || "Agencia",
            email: agency.users?.email,
            rfc: agency.rfc,
            razon_social: agency.razon_social,
            regimen_fiscal: agency.regimen_fiscal,
            codigo_postal: agency.postal_code,
          },
        },
      });

      if (contactRes.error) throw new Error(`Failed to sync agency contact: ${contactRes.error.message}`);
      agencyExternalId = contactRes.data?.external_entity_id;
    }

    if (!agencyExternalId) throw new Error("Could not obtain external contact ID for agency");

    const totalPayout = Number(payout.net_amount ?? payout.amount);
    const commissionAmount = Number(payout.commission_amount ?? 0);
    const grossAmount = totalPayout + commissionAmount;

    const billRes = await supabase.functions.invoke("sync-to-accounting", {
      body: {
        action: "sync_bill",
        record_id: payout_id,
        data: {
          id: payout_id,
          vendor_external_id: agencyExternalId,
          date: new Date(payout.created_at).toISOString().split("T")[0],
          due_date: new Date(payout.created_at).toISOString().split("T")[0],
          currency: "MXN",
          reference: payout.reference_number || payout_id,
          notes: payout.notes || `Pago a agencia por tours realizados`,
          line_items: [
            {
              description: "Anticipo de tour a agencia (neto descontada comision)",
              quantity: 1,
              unit_price: totalPayout,
              account_key: "comisiones_agencias",
            },
            ...(commissionAmount > 0 ? [{
              description: "Comision plataforma ToursRed (retencion)",
              quantity: 1,
              unit_price: commissionAmount,
              account_key: "comisiones_agencias",
            }] : []),
          ],
          total: grossAmount,
        },
      },
    });

    if (billRes.error) throw new Error(`Failed to sync bill: ${billRes.error.message}`);

    if (payout.status === "completed" && (payout.paid_at || payout.created_at)) {
      await supabase.functions.invoke("sync-to-accounting", {
        body: {
          action: "sync_payment",
          record_id: payout_id,
          data: {
            id: payout_id,
            contact_external_id: agencyExternalId,
            bill_external_id: billRes.data?.external_entity_id,
            payment_type: "made",
            date: new Date(payout.paid_at || payout.created_at).toISOString().split("T")[0],
            amount: totalPayout,
            currency: "MXN",
            reference: payout.reference_number || payout_id,
            bank_account_key: "banco_principal",
          },
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true, bill_external_id: billRes.data?.external_entity_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("sync-payout-to-accounting error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
