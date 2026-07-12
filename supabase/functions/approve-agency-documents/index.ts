import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    // Must be admin
    const { data: adminUser } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
    if (adminUser?.role !== "admin") return new Response(JSON.stringify({ error: "Acceso denegado" }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const { agency_id, document_ids, action } = body; // action: 'approve' | 'reject'
    const rejectionReason: string | undefined = body.rejection_reason;

    if (!agency_id || !document_ids?.length || !action) {
      return new Response(JSON.stringify({ error: "Faltan campos requeridos" }), { status: 400, headers: corsHeaders });
    }

    if (!["approve", "reject"].includes(action)) {
      return new Response(JSON.stringify({ error: "Acción inválida" }), { status: 400, headers: corsHeaders });
    }

    if (action === "reject" && !rejectionReason) {
      return new Response(JSON.stringify({ error: "Se requiere motivo de rechazo" }), { status: 422, headers: corsHeaders });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Update individual documents
    const { error: updateErr } = await supabase
      .from("agency_documents")
      .update({
        status:           newStatus,
        rejection_reason: action === "reject" ? rejectionReason : null,
        reviewed_by:      user.id,
        reviewed_at:      new Date().toISOString(),
      })
      .in("id", document_ids)
      .eq("agency_id", agency_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return new Response(JSON.stringify({ error: "Error al actualizar documentos" }), { status: 500, headers: corsHeaders });
    }

    // If all required current docs are approved → advance onboarding_status to pending_review
    // The trigger handles this automatically, but we also do a direct check for the approve case.
    if (action === "approve") {
      const { data: reqTypes } = await supabase
        .from("document_types")
        .select("key")
        .eq("required", true)
        .neq("key", "contrato_agencia");

      const requiredKeys = (reqTypes ?? []).map((r: any) => r.key);

      const { data: approvedDocs } = await supabase
        .from("agency_documents")
        .select("document_type_key")
        .eq("agency_id", agency_id)
        .eq("is_current", true)
        .eq("status", "approved")
        .neq("document_type_key", "contrato_agencia");

      const approvedKeys = (approvedDocs ?? []).map((d: any) => d.document_type_key);
      const allApproved = requiredKeys.every((k: string) => approvedKeys.includes(k));

      if (allApproved) {
        await supabase
          .from("agencies")
          .update({ onboarding_status: "pending_review", documents_completed_at: new Date().toISOString() })
          .eq("id", agency_id)
          .eq("onboarding_status", "pending_documents");

        // Notify agency
        const { data: agencyRow } = await supabase.from("agencies").select("user_id").eq("id", agency_id).maybeSingle();
        if (agencyRow?.user_id) {
          await supabase.from("notifications").insert({
            user_id: agencyRow.user_id,
            type:    "agency_documents_approved",
            title:   "Documentos aprobados",
            message: "Tus documentos han sido verificados. En breve revisaremos tu solicitud completa.",
          }).select();
        }
      }
    } else {
      // Reject: notify agency & set status back to pending_documents
      await supabase
        .from("agencies")
        .update({ onboarding_status: "pending_documents" })
        .eq("id", agency_id)
        .in("onboarding_status", ["pending_review", "pending_documents"]);

      const { data: agencyRow } = await supabase.from("agencies").select("user_id").eq("id", agency_id).maybeSingle();
      if (agencyRow?.user_id) {
        await supabase.from("notifications").insert({
          user_id: agencyRow.user_id,
          type:    "agency_documents_rejected",
          title:   "Documentos requieren corrección",
          message: `Algunos de tus documentos fueron rechazados: ${rejectionReason}. Por favor súbelos nuevamente.`,
        }).select();
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: corsHeaders });
  }
});
