import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// =============================================
// ACCOUNTING PROVIDER INTERFACE (provider-agnostic)
// To add a new provider (Odoo, QuickBooks, etc.):
//   1. Implement the AccountingAdapter interface below
//   2. Add a case in the getAdapter() factory function
//   3. Update the accounting_provider check constraint in the DB
// =============================================

interface StandardContact {
  id: string;
  type: "agency" | "traveler";
  name: string;
  email?: string;
  phone?: string;
  rfc?: string;
  razon_social?: string;
  regimen_fiscal?: string;
  codigo_postal?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface StandardLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_percentage?: number;
  account_key?: string;
}

interface StandardInvoice {
  id: string;
  contact_external_id: string;
  date: string;
  due_date?: string;
  currency?: string;
  reference?: string;
  notes?: string;
  line_items: StandardLineItem[];
  tax_total?: number;
  subtotal?: number;
  total: number;
  account_key?: string;
}

interface StandardBill {
  id: string;
  vendor_external_id: string;
  date: string;
  due_date?: string;
  currency?: string;
  reference?: string;
  notes?: string;
  line_items: StandardLineItem[];
  total: number;
  account_key?: string;
}

interface StandardPayment {
  id: string;
  contact_external_id: string;
  invoice_external_id?: string;
  bill_external_id?: string;
  payment_type: "received" | "made";
  date: string;
  amount: number;
  currency?: string;
  payment_method?: string;
  reference?: string;
  bank_account_key?: string;
}

interface AccountingResult {
  external_entity_type: string;
  external_entity_id: string;
}

interface AccountingAdapter {
  syncContact(contact: StandardContact): Promise<AccountingResult>;
  syncInvoice(invoice: StandardInvoice): Promise<AccountingResult>;
  syncBill(bill: StandardBill): Promise<AccountingResult>;
  syncPayment(payment: StandardPayment): Promise<AccountingResult>;
  healthCheck(): Promise<boolean>;
}

// =============================================
// ZOHO BOOKS — Mexico tax regime mapper
// Maps SAT regimen fiscal codes/descriptions to Zoho Books enum values.
// Zoho allowed values (Mexico edition):
//   general_legal_person, legal_entities_non_profit, resident_abroad,
//   production_cooperative_societies, agricultural_livestock,
//   optional_group_of_companies, coordinated, simplified_trust,
//   wages_salaries_income, lease, property_disposal_acquisition,
//   other_income, divident_income, individual_business_professional,
//   interest_income, income_obtaining_price, no_tax_obligation,
//   tax_incorporation, income_through_technology_platform
// =============================================
function mapRegimenToZoho(regimen: string): string {
  if (!regimen) return "general_legal_person";
  const r = regimen.toLowerCase();

  // SAT code prefixes like "601", "612", etc.
  if (r.startsWith("601") || r.includes("general de ley personas morales")) return "general_legal_person";
  if (r.startsWith("603") || r.includes("personas morales con fines no lucrativos")) return "legal_entities_non_profit";
  if (r.startsWith("605") || r.includes("sueldos y salarios")) return "wages_salaries_income";
  if (r.startsWith("606") || r.includes("arrendamiento")) return "lease";
  if (r.startsWith("607") || r.includes("enajenación o adquisición de bienes")) return "property_disposal_acquisition";
  if (r.startsWith("608") || r.includes("demás ingresos")) return "other_income";
  if (r.startsWith("609") || r.includes("consolidación")) return "optional_group_of_companies";
  if (r.startsWith("610") || r.includes("residentes en el extranjero")) return "resident_abroad";
  if (r.startsWith("611") || r.includes("ingresos por dividendos")) return "divident_income";
  if (r.startsWith("612") || r.includes("personas físicas con actividades empresariales")) return "individual_business_professional";
  if (r.startsWith("614") || r.includes("ingresos por intereses")) return "interest_income";
  if (r.startsWith("615") || r.includes("régimen de los ingresos por obtención de premios")) return "income_obtaining_price";
  if (r.startsWith("616") || r.includes("sin obligaciones fiscales")) return "no_tax_obligation";
  if (r.startsWith("620") || r.includes("sociedades cooperativas de producción")) return "production_cooperative_societies";
  if (r.startsWith("621") || r.includes("incorporación fiscal")) return "tax_incorporation";
  if (r.startsWith("622") || r.includes("actividades agrícolas")) return "agricultural_livestock";
  if (r.startsWith("623") || r.includes("opcional para grupos de sociedades")) return "optional_group_of_companies";
  if (r.startsWith("624") || r.includes("coordinados")) return "coordinated";
  if (r.startsWith("625") || r.includes("plataformas tecnológicas") || r.includes("tecnologicas")) return "income_through_technology_platform";
  if (r.startsWith("626") || r.includes("simplificado de confianza")) return "simplified_trust";

  // Fallback: if the value is already a valid Zoho enum key, return it as-is
  const zohoValues = [
    "general_legal_person", "legal_entities_non_profit", "resident_abroad",
    "production_cooperative_societies", "agricultural_livestock",
    "optional_group_of_companies", "coordinated", "simplified_trust",
    "wages_salaries_income", "lease", "property_disposal_acquisition",
    "other_income", "divident_income", "individual_business_professional",
    "interest_income", "income_obtaining_price", "no_tax_obligation",
    "tax_incorporation", "income_through_technology_platform",
  ];
  if (zohoValues.includes(r)) return r;

  // Default for personas morales
  return "general_legal_person";
}

// =============================================
// ZOHO BOOKS ADAPTER
// =============================================

async function getZohoAccessToken(supabase: ReturnType<typeof createClient>): Promise<{ token: string; apiDomain: string }> {
  const { data: tokenRow } = await supabase
    .from("zoho_oauth_tokens")
    .select("access_token, refresh_token, access_token_expires_at, api_domain")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tokenRow) throw new Error("No Zoho OAuth token found. Please authorize Zoho Books in Admin Settings.");

  const expiresAt = new Date(tokenRow.access_token_expires_at).getTime();
  const nowMs = Date.now();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt - nowMs > bufferMs) {
    return { token: tokenRow.access_token, apiDomain: tokenRow.api_domain };
  }

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("zoho_client_id, zoho_client_secret, zoho_region")
    .maybeSingle();

  if (!settings?.zoho_client_id || !settings?.zoho_client_secret) {
    throw new Error("Zoho client credentials not configured.");
  }

  const region = settings.zoho_region || "com";
  const tokenUrl = `https://accounts.zoho.${region}/oauth/v2/token`;

  const body = new URLSearchParams({
    refresh_token: tokenRow.refresh_token,
    client_id: settings.zoho_client_id,
    client_secret: settings.zoho_client_secret,
    grant_type: "refresh_token",
  });

  const res = await fetch(tokenUrl, { method: "POST", body });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoho token refresh failed: ${err}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error(`Zoho token refresh returned no access_token: ${JSON.stringify(data)}`);

  const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  const newApiDomain = data.api_domain ?? tokenRow.api_domain;

  await supabase.from("zoho_oauth_tokens").update({
    access_token: data.access_token,
    access_token_expires_at: newExpiry,
    api_domain: newApiDomain,
  }).eq("refresh_token", tokenRow.refresh_token);

  return { token: data.access_token, apiDomain: newApiDomain };
}

function createZohoBooksAdapter(supabase: ReturnType<typeof createClient>, orgId: string): AccountingAdapter {
  async function zhFetch(path: string, method: string, body?: unknown): Promise<unknown> {
    const { token, apiDomain } = await getZohoAccessToken(supabase);
    const url = `${apiDomain}/books/v3${path}?organization_id=${orgId}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const rawText = await res.text();
      let zohoMessage = rawText;
      try {
        const parsed = JSON.parse(rawText);
        if (parsed.message) zohoMessage = parsed.message;
      } catch {
        // no es JSON, usar texto crudo
      }
      throw new Error(`Zoho Books: ${zohoMessage}`);
    }
    return res.json();
  }

  async function syncContact(contact: StandardContact): Promise<AccountingResult> {
    const contactType = contact.type === "agency" ? "vendor" : "customer";

    // Build contact_persons array — per Zoho Books API v3, email goes here
    const contactPersons: Record<string, unknown>[] = [];
    if (contact.email || contact.phone) {
      contactPersons.push({
        first_name: contact.name,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        is_primary_contact: true,
      });
    }

    const payload: Record<string, unknown> = {
      contact_name: contact.razon_social || contact.name,
      company_name: contact.razon_social || contact.name,
      contact_type: contactType,
      contact_persons: contactPersons,
      billing_address: {
        address: contact.address || undefined,
        city: contact.city || undefined,
        state: contact.state || undefined,
        zip: contact.codigo_postal || undefined,
        country: contact.country || "Mexico",
      },
    };

    // Mexico edition fields — only set when values exist
    // tax_treatment is required for tax_reg_no to work in Mexico edition
    // Allowed values: home_country_mexico, border_region_mexico, non_mexico
    payload.tax_treatment = "home_country_mexico";

    if (contact.rfc) {
      // Zoho Mexico edition expects the RFC as a string (12 chars for persona fisica, 13 for moral)
      payload.tax_reg_no = contact.rfc;
    }

    if (contact.razon_social) {
      payload.legal_name = contact.razon_social;
    }

    // tax_regime must be one of Zoho's enum values for Mexico edition.
    // Map the SAT regimen code/description to Zoho's enum value.
    if (contact.regimen_fiscal) {
      payload.tax_regime = mapRegimenToZoho(contact.regimen_fiscal);
    }

    // Check if this contact was already synced before and update instead of create
    const { data: existingLog } = await supabase
      .from("accounting_sync_log")
      .select("external_entity_id")
      .eq("record_type", contact.type === "agency" ? "contact_agency" : "contact_traveler")
      .eq("record_id", contact.id)
      .eq("status", "synced")
      .maybeSingle();

    if (existingLog?.external_entity_id) {
      const contactId = existingLog.external_entity_id;
      await zhFetch(`/contacts/${contactId}`, "PUT", payload);
      return { external_entity_type: "Contact", external_entity_id: contactId };
    }

    const data = await zhFetch("/contacts", "POST", payload) as { contact: { contact_id: string } };
    return { external_entity_type: "Contact", external_entity_id: data.contact.contact_id };
  }

  async function syncInvoice(invoice: StandardInvoice): Promise<AccountingResult> {
    const payload = {
      customer_id: invoice.contact_external_id,
      date: invoice.date,
      due_date: invoice.due_date,
      currency_code: invoice.currency || "MXN",
      reference_number: invoice.reference,
      notes: invoice.notes,
      line_items: invoice.line_items.map((item) => ({
        name: item.description,
        description: item.description,
        quantity: item.quantity,
        rate: item.unit_price,
        tax_percentage: item.tax_percentage ?? 16,
        account_id: item.account_key,
      })),
    };

    const data = await zhFetch("/invoices", "POST", payload) as { invoice: { invoice_id: string } };
    return { external_entity_type: "Invoice", external_entity_id: data.invoice.invoice_id };
  }

  async function syncBill(bill: StandardBill): Promise<AccountingResult> {
    const payload = {
      vendor_id: bill.vendor_external_id,
      date: bill.date,
      due_date: bill.due_date,
      currency_code: bill.currency || "MXN",
      reference_number: bill.reference,
      notes: bill.notes,
      line_items: bill.line_items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        rate: item.unit_price,
        account_id: item.account_key,
      })),
    };

    const data = await zhFetch("/bills", "POST", payload) as { bill: { bill_id: string } };
    return { external_entity_type: "Bill", external_entity_id: data.bill.bill_id };
  }

  async function syncPayment(payment: StandardPayment): Promise<AccountingResult> {
    if (payment.payment_type === "received") {
      const payload = {
        customer_id: payment.contact_external_id,
        payment_mode: payment.payment_method || "online",
        amount: payment.amount,
        date: payment.date,
        reference_number: payment.reference,
        invoices: payment.invoice_external_id
          ? [{ invoice_id: payment.invoice_external_id, amount_applied: payment.amount }]
          : [],
      };
      const data = await zhFetch("/customerpayments", "POST", payload) as { payment: { payment_id: string } };
      return { external_entity_type: "CustomerPayment", external_entity_id: data.payment.payment_id };
    } else {
      const payload = {
        vendor_id: payment.contact_external_id,
        payment_mode: payment.payment_method || "online",
        amount: payment.amount,
        date: payment.date,
        reference_number: payment.reference,
        bills: payment.bill_external_id
          ? [{ bill_id: payment.bill_external_id, amount_applied: payment.amount }]
          : [],
      };
      const data = await zhFetch("/vendorpayments", "POST", payload) as { payment: { payment_id: string } };
      return { external_entity_type: "VendorPayment", external_entity_id: data.payment.payment_id };
    }
  }

  async function healthCheck(): Promise<boolean> {
    try {
      await zhFetch("/organizations", "GET");
      return true;
    } catch {
      return false;
    }
  }

  return { syncContact, syncInvoice, syncBill, syncPayment, healthCheck };
}

// =============================================
// ODOO ADAPTER (stub — implement when needed)
// =============================================
function createOdooAdapter(_config: { url: string; apiKey: string; database: string }): AccountingAdapter {
  async function notImplemented(_name: string): Promise<AccountingResult> {
    throw new Error(`Odoo adapter: ${_name} not yet implemented. See sync-to-accounting/index.ts`);
  }
  return {
    syncContact: (_c) => notImplemented("syncContact"),
    syncInvoice: (_i) => notImplemented("syncInvoice"),
    syncBill: (_b) => notImplemented("syncBill"),
    syncPayment: (_p) => notImplemented("syncPayment"),
    healthCheck: async () => false,
  };
}

// =============================================
// QUICKBOOKS ADAPTER (stub — implement when needed)
// =============================================
function createQuickBooksAdapter(_config: { clientId: string; clientSecret: string; realmId: string }): AccountingAdapter {
  async function notImplemented(_name: string): Promise<AccountingResult> {
    throw new Error(`QuickBooks adapter: ${_name} not yet implemented. See sync-to-accounting/index.ts`);
  }
  return {
    syncContact: (_c) => notImplemented("syncContact"),
    syncInvoice: (_i) => notImplemented("syncInvoice"),
    syncBill: (_b) => notImplemented("syncBill"),
    syncPayment: (_p) => notImplemented("syncPayment"),
    healthCheck: async () => false,
  };
}

// =============================================
// ACCOUNTING PROVIDER FACTORY (dispatcher)
// Add new providers here as a new case
// =============================================
async function getAdapter(
  provider: string,
  supabase: ReturnType<typeof createClient>,
  settings: Record<string, string>
): Promise<AccountingAdapter> {
  switch (provider) {
    case "zoho_books":
      if (!settings.zoho_org_id) throw new Error("Zoho org_id not configured in platform_settings.");
      return createZohoBooksAdapter(supabase, settings.zoho_org_id);

    case "odoo":
      if (!settings.odoo_url || !settings.odoo_api_key || !settings.odoo_database) {
        throw new Error("Odoo credentials (odoo_url, odoo_api_key, odoo_database) not configured.");
      }
      return createOdooAdapter({ url: settings.odoo_url, apiKey: settings.odoo_api_key, database: settings.odoo_database });

    case "quickbooks":
      if (!settings.qb_client_id || !settings.qb_client_secret || !settings.qb_realm_id) {
        throw new Error("QuickBooks credentials not configured.");
      }
      return createQuickBooksAdapter({ clientId: settings.qb_client_id, clientSecret: settings.qb_client_secret, realmId: settings.qb_realm_id });

    default:
      throw new Error(`Unknown accounting provider: ${provider}. Supported: zoho_books, odoo, quickbooks`);
  }
}

// =============================================
// SYNC LOG HELPERS
// =============================================
async function logSync(
  supabase: ReturnType<typeof createClient>,
  provider: string,
  recordType: string,
  recordId: string,
  status: "pending" | "synced" | "error" | "skipped",
  result?: AccountingResult,
  errorMessage?: string,
  payloadSummary?: Record<string, unknown>
): Promise<string> {
  const { data } = await supabase
    .from("accounting_sync_log")
    .upsert({
      provider,
      record_type: recordType,
      record_id: recordId,
      status,
      external_entity_type: result?.external_entity_type,
      external_entity_id: result?.external_entity_id,
      error_message: errorMessage,
      synced_at: status === "synced" ? new Date().toISOString() : null,
      payload_summary: payloadSummary,
    }, { onConflict: "provider,record_type,record_id", ignoreDuplicates: false })
    .select("id")
    .maybeSingle();
  return data?.id ?? "";
}

async function incrementRetryCount(supabase: ReturnType<typeof createClient>, provider: string, recordType: string, recordId: string) {
  await supabase.rpc("increment_accounting_sync_retry_count" as never, {
    p_provider: provider,
    p_record_type: recordType,
    p_record_id: recordId,
  }).catch(async () => {
    // Fallback: read current count and increment manually
    const { data } = await supabase
      .from("accounting_sync_log")
      .select("retry_count")
      .eq("provider", provider)
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .maybeSingle();
    const current = (data?.retry_count ?? 0) + 1;
    await supabase
      .from("accounting_sync_log")
      .update({ retry_count: current })
      .eq("provider", provider)
      .eq("record_type", recordType)
      .eq("record_id", recordId);
  });
}

// =============================================
// MAIN HANDLER
// Accepts: { action, record_type, record_id, data }
// action: "sync_contact" | "sync_invoice" | "sync_bill" | "sync_payment" | "health_check" | "retry_errors"
// =============================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, record_type, record_id, data: payload } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("accounting_provider, accounting_sync_enabled, zoho_org_id, zoho_region, zoho_sandbox_mode")
      .maybeSingle();

    if (action === "health_check") {
      if (!settings?.accounting_provider || settings.accounting_provider === "none") {
        return new Response(JSON.stringify({ healthy: false, message: "No accounting provider configured" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const adapter = await getAdapter(settings.accounting_provider, supabase, settings as Record<string, string>);
        const healthy = await adapter.healthCheck();
        return new Response(JSON.stringify({ healthy, provider: settings.accounting_provider }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ healthy: false, error: String(e) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!settings?.accounting_sync_enabled || settings.accounting_provider === "none") {
      return new Response(JSON.stringify({ skipped: true, reason: "Accounting sync disabled or no provider configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = settings.accounting_provider;
    const adapter = await getAdapter(provider, supabase, settings as Record<string, string>);

    if (action === "retry_errors") {
      const { data: errorRecords } = await supabase
        .from("accounting_sync_log")
        .select("*")
        .eq("provider", provider)
        .eq("status", "error")
        .lt("retry_count", 5)
        .order("created_at", { ascending: true })
        .limit(50);

      let retried = 0, succeeded = 0, failed = 0;
      for (const rec of errorRecords ?? []) {
        retried++;
        try {
          await supabase.functions.invoke("sync-to-accounting", {
            body: { action: `sync_${rec.record_type.replace("contact_agency", "contact").replace("contact_traveler", "contact")}`, record_type: rec.record_type, record_id: rec.record_id },
          });
          succeeded++;
        } catch {
          failed++;
        }
      }
      return new Response(JSON.stringify({ retried, succeeded, failed }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!record_id) {
      return new Response(JSON.stringify({ error: "record_id is required for sync actions" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: AccountingResult;
    let recType = "contact_agency";
    let payloadSummary: Record<string, unknown> = {};

    switch (action) {
      case "sync_contact": {
        if (!payload) throw new Error("payload (StandardContact) is required for sync_contact");
        recType = record_type || "contact_agency";
        payloadSummary = { name: payload.name, email: payload.email, rfc: payload.rfc };
        break;
      }
      case "sync_invoice": {
        if (!payload) throw new Error("payload (StandardInvoice) is required for sync_invoice");
        recType = "booking";
        payloadSummary = { total: payload.total, reference: payload.reference };
        break;
      }
      case "sync_bill": {
        if (!payload) throw new Error("payload (StandardBill) is required for sync_bill");
        recType = "payout";
        payloadSummary = { total: payload.total, reference: payload.reference };
        break;
      }
      case "sync_payment": {
        if (!payload) throw new Error("payload (StandardPayment) is required for sync_payment");
        recType = (payload as StandardPayment).payment_type === "received" ? "booking" : "payout";
        payloadSummary = { amount: payload.amount };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Log as pending before attempting sync
    await logSync(supabase, provider, recType, record_id, "pending", undefined, undefined, payloadSummary);

    try {
      switch (action) {
        case "sync_contact":
          result = await adapter.syncContact(payload as StandardContact);
          break;
        case "sync_invoice":
          result = await adapter.syncInvoice(payload as StandardInvoice);
          break;
        case "sync_bill":
          result = await adapter.syncBill(payload as StandardBill);
          break;
        case "sync_payment":
          result = await adapter.syncPayment(payload as StandardPayment);
          break;
        default:
          result = { external_entity_type: "", external_entity_id: "" };
      }
    } catch (syncErr) {
      const errMsg = String(syncErr);
      console.error(`sync-to-accounting [${action}] ${record_id} failed:`, errMsg);
      await incrementRetryCount(supabase, provider, recType, record_id);
      await logSync(supabase, provider, recType, record_id, "error", undefined, errMsg, payloadSummary);
      // Return 200 with error so bulk sync can detect it without throwing
      return new Response(JSON.stringify({ error: errMsg, record_id, record_type: recType }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logSync(supabase, provider, recType, record_id, "synced", result, undefined, payloadSummary);

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("sync-to-accounting outer error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
