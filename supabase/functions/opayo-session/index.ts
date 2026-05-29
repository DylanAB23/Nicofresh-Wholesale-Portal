import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

    const response = await fetch(`${baseUrl}/merchant-session-keys`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({ vendorName }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
