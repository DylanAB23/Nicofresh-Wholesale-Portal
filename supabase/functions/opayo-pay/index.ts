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
    const integrationKey = Deno.env.get("OPAYO_INTEGRATION_KEY")!;
    const integrationPassword = Deno.env.get("OPAYO_INTEGRATION_PASSWORD")!;
    const vendorName = Deno.env.get("OPAYO_VENDOR_NAME")!;
    const env = Deno.env.get("OPAYO_ENV") ?? "test";

    const baseUrl = env === "live"
      ? "https://live.opayo.eu.elavon.com/api/v1"
      : "https://sandbox.opayo.eu.elavon.com/api/v1";

    const credentials = btoa(`${integrationKey}:${integrationPassword}`);

    // Verify the calling user via JWT
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader ?? "" } } },
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      cardIdentifier,
      merchantSessionKey,
      orderId,
      invoiceId,
      amount, // in pence (integer)
      description,
      billingAddress,
      customerFirstName,
      customerLastName,
    } = body;

    // Submit payment to Opayo
    const transactionRef = `WH-${Date.now()}`;
    const opayoPayload = {
      transactionType: "Payment",
      paymentMethod: {
        card: {
          merchantSessionKey,
          cardIdentifier,
        },
      },
      vendorTxCode: transactionRef,
      amount,
      currency: "GBP",
      description: description ?? "Wholesale order payment",
      apply3DSecure: "Disable",
      customerFirstName: customerFirstName ?? "Customer",
      customerLastName: customerLastName ?? "Account",
      billingAddress: billingAddress ?? {
        address1: "88",
        city: "London",
        postalCode: "412",
        country: "GB",
      },
      entryMethod: "Ecommerce",
    };

    const opayoRes = await fetch(`${baseUrl}/transactions`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(opayoPayload),
    });

    const opayoData = await opayoRes.json();

    if (!opayoRes.ok || (opayoData.status !== "Ok" && opayoData.status !== "Authenticated")) {
      return new Response(JSON.stringify({ error: opayoData }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountDecimal = amount / 100;

    // Record payment in DB
    if (invoiceId) {
      // Pay against an invoice
      const { data: invoice } = await supabase
        .from("invoices")
        .select("amount_due, amount_paid")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invoice) {
        const newAmountPaid = invoice.amount_paid + amountDecimal;
        const newStatus = newAmountPaid >= invoice.amount_due ? "paid" : "partial";

        await supabase.from("payments").insert({
          invoice_id: invoiceId,
          profile_id: user.id,
          amount: amountDecimal,
          method: "card",
          reference: opayoData.transactionId ?? transactionRef,
          notes: `Opayo transaction: ${opayoData.transactionId}`,
          paid_at: new Date().toISOString(),
        });

        await supabase.from("invoices").update({
          amount_paid: newAmountPaid,
          status: newStatus,
        }).eq("id", invoiceId);
      }
    }

    // Update order payment status if orderId provided
    if (orderId) {
      await supabase.from("orders").update({
        payment_status: "paid",
      }).eq("id", orderId);
    }

    // Log transaction
    await supabase.from("opayo_transactions").insert({
      profile_id: user.id,
      order_id: orderId ?? null,
      invoice_id: invoiceId ?? null,
      opayo_transaction_id: opayoData.transactionId,
      vendor_tx_code: transactionRef,
      amount: amountDecimal,
      status: opayoData.status,
    }).then(() => {}).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      transactionId: opayoData.transactionId,
      status: opayoData.status,
      statusCode: opayoData.statusCode,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
