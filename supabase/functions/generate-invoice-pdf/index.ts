import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Fetch invoice
    const { data: invoice, error: invoiceErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch customer profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("store_name, contact_name, email")
      .eq("id", invoice.profile_id)
      .maybeSingle();

    // Fetch order items if linked
    let items: any[] = [];
    if (invoice.order_id) {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("sku, name, quantity, unit_price, total")
        .eq("order_id", invoice.order_id);
      items = orderItems || [];
    }

    // Generate HTML invoice
    const html = generateInvoiceHTML({
      invoice,
      profile,
      items,
    });

    // Use html2pdf-like approach by returning HTML to client
    // Client will use jsPDF to convert
    return new Response(JSON.stringify({ html }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateInvoiceHTML({
  invoice,
  profile,
  items,
}: {
  invoice: any;
  profile: any;
  items: any[];
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(n);

  const itemsHTML = items
    .map(
      (item) =>
        `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.sku}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${fmt(item.unit_price)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${fmt(item.total)}</td>
    </tr>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      color: #333;
      line-height: 1.6;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 32px;
      color: #111;
    }
    .header-right {
      text-align: right;
    }
    .invoice-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }
    .invoice-meta-section h3 {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 8px 0;
    }
    .invoice-meta-section p {
      margin: 4px 0;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 8px;
    }
    .status-paid {
      background: #dcfce7;
      color: #166534;
    }
    .status-unpaid {
      background: #fecdd3;
      color: #991b1b;
    }
    .status-partial {
      background: #fed7aa;
      color: #7c2d12;
    }
    .status-overdue {
      background: #fee2e2;
      color: #7f1d1d;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #f3f4f6;
      padding: 12px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      border-bottom: 2px solid #e5e7eb;
    }
    .summary {
      display: flex;
      justify-content: flex-end;
      margin: 40px 0;
    }
    .summary-box {
      width: 300px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #f3f4f6;
    }
    .summary-row.total {
      border-bottom: none;
      font-weight: bold;
      font-size: 16px;
    }
    .summary-label {
      color: #666;
    }
    .summary-value {
      font-weight: 600;
    }
    .notes {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      margin-top: 40px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>INVOICE</h1>
    </div>
    <div class="header-right">
      <p style="margin: 0; color: #666;">Invoice No.</p>
      <p style="margin: 0; font-size: 20px; font-weight: bold;">${invoice.invoice_number}</p>
      <span class="status-badge status-${invoice.status}">${invoice.status.toUpperCase()}</span>
    </div>
  </div>

  <div class="invoice-meta">
    <div>
      <div class="invoice-meta-section">
        <h3>Bill To</h3>
        <p><strong>${profile?.store_name || profile?.contact_name || "Customer"}</strong></p>
        <p>${profile?.email || ""}</p>
      </div>
    </div>
    <div>
      <div class="invoice-meta-section">
        <h3>Invoice Details</h3>
        <p><strong>Issued:</strong> ${new Date(invoice.issued_date).toLocaleDateString()}</p>
        <p><strong>Due:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
        <p><strong>Amount Due:</strong> <span style="font-weight: bold; color: #3b82f6;">${fmt(invoice.amount_due)}</span></p>
      </div>
    </div>
  </div>

  ${items.length > 0 ? `
    <h3 style="margin-top: 40px; margin-bottom: 16px;">Line Items</h3>
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Product</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
  ` : ""}

  <div class="summary">
    <div class="summary-box">
      <div class="summary-row">
        <span class="summary-label">Subtotal</span>
        <span class="summary-value">${fmt(invoice.amount_due)}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Already Paid</span>
        <span class="summary-value">${fmt(invoice.amount_paid)}</span>
      </div>
      <div class="summary-row total">
        <span>Outstanding Balance</span>
        <span style="color: ${invoice.amount_due - invoice.amount_paid > 0 ? "#dc2626" : "#059669"};">${fmt(invoice.amount_due - invoice.amount_paid)}</span>
      </div>
    </div>
  </div>

  ${invoice.notes ? `
    <div class="notes">
      <strong>Notes:</strong><br>
      ${invoice.notes}
    </div>
  ` : ""}
</body>
</html>
`;
}
