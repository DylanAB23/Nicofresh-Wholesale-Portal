import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SS_V2_BASE = "https://api.shipstation.com/v2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { supabase: null, error: "No authorization header" };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader ?? "" } } },
  );
  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser();
  if (error || !user) return { supabase: null, error: `Auth error: ${error?.message || "No user found"}` };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return { supabase: null, error: `Profile not found for user ${user.id}` };
  if (profile.role !== "admin")
    return { supabase: null, error: `User role is '${profile.role}', admin required` };

  return { supabase, error: null };
}

// Verify any authenticated user (not just admin) — for auto order push
async function verifyUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { supabase: null, userId: null, error: "No authorization header" };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader ?? "" } } },
  );
  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser();
  if (error || !user) return { supabase: null, userId: null, error: `Auth error: ${error?.message || "No user found"}` };

  return { supabase, userId: user.id, error: null };
}

function getApiKey(): string | null {
  return Deno.env.get("SHIPSTATION_API_KEY") || null;
}

function ssHeaders(apiKey: string) {
  return {
    "API-Key": apiKey,
    "Content-Type": "application/json",
  };
}

// ── Inventory Sync: pull stock levels from ShipStation V2, match by SKU ──

interface SSInventoryItem {
  sku: string;
  on_hand: number;
  available: number;
  allocated: number;
  quantity?: number;
}

async function handleInventorySync(req: Request): Promise<Response> {
  const { supabase, error: authErr } = await verifyAdmin(req);
  if (authErr || !supabase) return jsonResponse({ error: authErr }, 401);

  const apiKey = getApiKey();
  if (!apiKey)
    return jsonResponse({ error: "ShipStation API key not configured" }, 500);

  // Fetch ALL products (not just first 1000) with pagination
  let allProducts: Array<{ id: string; sku: string; stock_qty: number }> = [];
  let productPage = 0;
  let hasMore = true;
  const pageSize = 1000;

  while (hasMore) {
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, sku, stock_qty")
      .range(productPage * pageSize, (productPage + 1) * pageSize - 1);

    if (prodErr) return jsonResponse({ error: `Product fetch error: ${prodErr.message}` }, 500);

    if (!products || products.length === 0) {
      hasMore = false;
    } else {
      allProducts = allProducts.concat(products);
      if (products.length < pageSize) {
        hasMore = false;
      } else {
        productPage++;
      }
    }
  }

  if (allProducts.length === 0)
    return jsonResponse({ success: true, summary: { shipstation_items: 0, updated: 0, skipped: 0, total_products: 0 } });

  // Create SKU maps for flexible matching
  const skuMap = new Map<string, { id: string; currentQty: number; originalSku: string }>();
  const skuMapByNormalized = new Map<string, string>(); // normalized -> original mapping

  for (const p of allProducts) {
    const normalized = p.sku.toUpperCase().trim();
    skuMap.set(normalized, { id: p.id, currentQty: p.stock_qty, originalSku: p.sku });
    skuMapByNormalized.set(normalized, p.sku);
  }

  let updated = 0;
  let skipped = 0;
  let ssTotal = 0;
  let page = 1;
  let totalPages = 1;
  const skippedSkus: Array<{ sku: string; reason: string }> = [];

  while (page <= totalPages) {
    const url = new URL(`${SS_V2_BASE}/inventory`);
    url.searchParams.set("page_size", "500");
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), {
      headers: { "API-Key": apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonResponse(
        { error: `ShipStation API error ${res.status}: ${text}` },
        400,
      );
    }

    const data = await res.json();
    const items = (data.inventory ?? []) as SSInventoryItem[];

    for (const item of items) {
      ssTotal++;
      const sku = (item.sku || "").toUpperCase().trim();
      const match = skuMap.get(sku);

      if (!match) {
        skipped++;
        if (skippedSkus.length < 20) {
          skippedSkus.push({
            sku: item.sku || 'unknown',
            reason: 'SKU not found in products table'
          });
        }
        continue;
      }

      const available = item.available ?? item.on_hand ?? 0;
      // Update stock regardless of whether it changed (in case it was 0 before)
      await supabase
        .from("products")
        .update({ stock_qty: available })
        .eq("id", match.id);
      updated++;
    }

    totalPages = data.pages ?? 1;
    page++;
  }

  return jsonResponse({
    success: true,
    summary: { shipstation_items: ssTotal, updated, skipped, total_products: allProducts.length },
    skipped_details: skippedSkus.length > 0 ? skippedSkus : undefined,
    skipped_count: skippedSkus.length,
  });
}

// ── Order Push: send order to ShipStation V2 via POST /v2/shipments ──

async function handleOrderPush(req: Request): Promise<Response> {
  const { supabase, error: authErr } = await verifyAdmin(req);
  if (authErr || !supabase) return jsonResponse({ error: authErr }, 401);

  const apiKey = getApiKey();
  if (!apiKey)
    return jsonResponse({ error: "ShipStation API key not configured" }, 500);

  const body = await req.json();
  const { orderId } = body;
  if (!orderId)
    return jsonResponse({ error: "orderId is required" }, 400);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      *,
      profiles(store_name, contact_name, email, phone)
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    return jsonResponse({ error: `Database error: ${orderErr.message}` }, 400);
  }

  if (!order) {
    return jsonResponse({ error: `Order not found (ID: ${orderId})` }, 404);
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("*, products(sku, name, weight, wholesale_price)")
    .eq("order_id", orderId);

  const prof = order.profiles as Record<string, string> | null;

  const { data: settings } = await supabase
    .from("portal_settings")
    .select("company_name")
    .eq("id", "global")
    .maybeSingle();

  const companyName = settings?.company_name || "Wholesale Portal";

  const ssItems = (items ?? []).map((item: Record<string, unknown>) => {
    const product = item.products as Record<string, unknown> | null;
    return {
      name: (product?.name as string) ?? "",
      sku: (product?.sku as string) ?? "",
      quantity: item.quantity as number,
      unit_price: item.unit_price as number,
      weight: {
        value: ((product?.weight as number) ?? 0.1) || 0.1,
        unit: "pound",
      },
    };
  });

  const totalWeight = ssItems.reduce(
    (s: number, i: { weight: { value: number }; quantity: number }) =>
      s + i.weight.value * i.quantity,
    0,
  );

  const shipment = {
    shipment_number: order.order_number,
    external_shipment_id: order.id,
    create_sales_order: true,
    ship_to: {
      name: order.shipping_name ?? prof?.contact_name ?? prof?.store_name ?? "Customer",
      company_name: order.shipping_company ?? prof?.store_name ?? "",
      phone: prof?.phone ?? "0000000000",
      email: prof?.email ?? "",
      address_line1: order.shipping_address ?? "",
      address_line2: "",
      city_locality: order.shipping_city ?? "",
      state_province: order.shipping_state ?? "",
      postal_code: order.shipping_postcode ?? "",
      country_code: order.shipping_country ?? "GB",
      address_residential_indicator: "no",
    },
    ship_from: {
      name: companyName,
      phone: "0000000000",
      address_line1: "Warehouse",
      city_locality: "London",
      state_province: "England",
      postal_code: "SW1A 1AA",
      country_code: "GB",
      address_residential_indicator: "no",
    },
    items: ssItems,
    packages: [
      {
        weight: {
          value: totalWeight || 1,
          unit: "pound",
        },
      },
    ],
  };

  const ssRes = await fetch(`${SS_V2_BASE}/shipments`, {
    method: "POST",
    headers: ssHeaders(apiKey),
    body: JSON.stringify({ shipments: [shipment] }),
  });

  const rawText = await ssRes.text();
  let ssData: Record<string, unknown> = {};
  try {
    ssData = JSON.parse(rawText);
  } catch {
    /* non-JSON response */
  }

  if (!ssRes.ok) {
    const errors = ssData.errors as Array<Record<string, string>> | undefined;
    const msg = errors?.[0]?.message
      ?? (ssData.message as string)
      ?? (ssData.error as string)
      ?? rawText
      ?? "ShipStation error";
    return jsonResponse({ error: `HTTP ${ssRes.status}: ${msg}` }, 400);
  }

  const shipments = ssData.shipments as Array<Record<string, unknown>> | undefined;
  const createdId = shipments?.[0]?.shipment_id ?? "";

  await supabase
    .from("orders")
    .update({
      shipstation_order_id: String(createdId),
    })
    .eq("id", orderId);

  return jsonResponse({
    success: true,
    shipstationShipmentId: createdId,
    shipmentNumber: order.order_number,
  });
}

// ── Auto Order Push: called when customer places an order ──
// Pushes order to ShipStation + deducts inventory locally

async function handleAutoOrderPush(req: Request): Promise<Response> {
  const { supabase, userId, error: authErr } = await verifyUser(req);
  if (authErr || !supabase || !userId) return jsonResponse({ error: authErr }, 401);

  const apiKey = getApiKey();
  if (!apiKey)
    return jsonResponse({ error: "ShipStation API key not configured" }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const orderId = body.orderId as string;
  if (!orderId)
    return jsonResponse({ error: "orderId is required" }, 400);

  // Verify the order belongs to this user
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      *,
      profiles(store_name, contact_name, email, phone)
    `)
    .eq("id", orderId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (orderErr) return jsonResponse({ error: `Database error: ${orderErr.message}` }, 400);
  if (!order) return jsonResponse({ error: "Order not found or doesn't belong to you" }, 404);

  // Fetch order items
  const { data: items } = await supabase
    .from("order_items")
    .select("*, products(id, sku, name, weight, wholesale_price, stock_qty)")
    .eq("order_id", orderId);

  // ── Step 1: Deduct local inventory ──
  for (const item of items ?? []) {
    const product = item.products as Record<string, unknown> | null;
    if (product) {
      const currentStock = (product.stock_qty as number) ?? 0;
      const newStock = Math.max(0, currentStock - (item.quantity as number));
      await supabase
        .from("products")
        .update({ stock_qty: newStock, in_stock: newStock > 0 })
        .eq("id", product.id as string);
    }
  }

  // ── Step 2: Push order to ShipStation ──
  const prof = order.profiles as Record<string, string> | null;

  const { data: settings } = await supabase
    .from("portal_settings")
    .select("company_name")
    .eq("id", "global")
    .maybeSingle();

  const companyName = settings?.company_name || "Wholesale Portal";

  const ssItems = (items ?? []).map((item: Record<string, unknown>) => {
    const product = item.products as Record<string, unknown> | null;
    return {
      name: (product?.name as string) ?? "",
      sku: (product?.sku as string) ?? "",
      quantity: item.quantity as number,
      unit_price: item.unit_price as number,
      weight: {
        value: ((product?.weight as number) ?? 0.1) || 0.1,
        unit: "pound",
      },
    };
  });

  const totalWeight = ssItems.reduce(
    (s: number, i: { weight: { value: number }; quantity: number }) =>
      s + i.weight.value * i.quantity,
    0,
  );

  const shipment = {
    shipment_number: order.order_number,
    external_shipment_id: order.id,
    create_sales_order: true,
    ship_to: {
      name: order.shipping_name ?? prof?.contact_name ?? prof?.store_name ?? "Customer",
      company_name: order.shipping_company ?? prof?.store_name ?? "",
      phone: prof?.phone ?? "0000000000",
      email: prof?.email ?? "",
      address_line1: order.shipping_address ?? "",
      address_line2: "",
      city_locality: order.shipping_city ?? "",
      state_province: order.shipping_state ?? "",
      postal_code: order.shipping_postcode ?? "",
      country_code: order.shipping_country ?? "GB",
      address_residential_indicator: "no",
    },
    ship_from: {
      name: companyName,
      phone: "0000000000",
      address_line1: "Warehouse",
      city_locality: "London",
      state_province: "England",
      postal_code: "SW1A 1AA",
      country_code: "GB",
      address_residential_indicator: "no",
    },
    items: ssItems,
    packages: [
      {
        weight: {
          value: totalWeight || 1,
          unit: "pound",
        },
      },
    ],
  };

  let shipstationId = "";
  try {
    const ssRes = await fetch(`${SS_V2_BASE}/shipments`, {
      method: "POST",
      headers: ssHeaders(apiKey),
      body: JSON.stringify({ shipments: [shipment] }),
    });

    const rawText = await ssRes.text();
    console.log(`[AUTO-ORDER] ShipStation response: ${rawText}`);

    let ssData: Record<string, unknown> = {};
    try {
      ssData = JSON.parse(rawText);
    } catch {
      /* non-JSON response */
    }

    if (ssRes.ok) {
      const shipments = ssData.shipments as Array<Record<string, unknown>> | undefined;
      console.log(`[AUTO-ORDER] Full response:`, JSON.stringify(ssData));
      console.log(`[AUTO-ORDER] Shipments array:`, shipments);

      if (shipments && shipments.length > 0) {
        const firstShipment = shipments[0];
        // Try different field names for the shipment ID
        shipstationId = String(
          firstShipment?.shipment_id ??
          firstShipment?.id ??
          firstShipment?.shipmentId ??
          ""
        );
        console.log(`[AUTO-ORDER] Extracted shipstation_id: ${shipstationId}`);
      } else {
        console.warn(`[AUTO-ORDER] No shipments in response array`);
      }
    } else {
      console.error(`[AUTO-ORDER] ShipStation API error: ${ssRes.status}`);
    }
    // Don't fail the whole order if ShipStation push fails — order is already placed
  } catch (err) {
    // ShipStation push failed but order + inventory deduction still succeeded
    console.error(`[AUTO-ORDER] Exception during ShipStation push:`, err);
  }

  // ── Step 3: Update order with ShipStation ID and set to processing ──
  console.log(`[AUTO-ORDER] Updating order ${orderId} with shipstation_id: ${shipstationId || "null"}`);
  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      status: "processing",
      shipstation_order_id: shipstationId || null,
    })
    .eq("id", orderId);

  if (updateErr) {
    console.error(`[AUTO-ORDER] Database update error:`, updateErr);
  } else {
    console.log(`[AUTO-ORDER] Order updated successfully`);
  }

  return jsonResponse({
    success: !updateErr,
    inventory_deducted: true,
    shipstation_pushed: !!shipstationId,
    shipstation_id: shipstationId || null,
    database_updated: !updateErr,
    debug: {
      shipstationId,
      updateError: updateErr?.message || null,
      message: updateErr ? "Database update failed" : "Success"
    },
  });
}

// ── Order Status Sync: pull shipment status from ShipStation and update order status ──

interface SSShipment {
  shipment_id?: string;
  order_id?: string;
  status?: string; // For V1 API
  shipment_status?: string; // For V2 Shipments API
  order_status?: string; // For V1 Orders API (awaiting_payment, awaiting_shipment, pending_fulfillment, on_hold, shipped, cancelled, rejected_fulfillment)
  ship_date?: string; // When marked as shipped
  modified_at?: string; // Last modified timestamp
  [key: string]: unknown; // Allow other fields from ShipStation API
}

// Deduct inventory when order is shipped
async function deductInventoryForOrder(supabase: ReturnType<typeof createClient>, orderId: string) {
  try {
    // Get order items
    const { data: items, error: itemsErr } = await supabase
      .from("order_items")
      .select("product_id, sku, quantity")
      .eq("order_id", orderId);

    if (itemsErr || !items) {
      console.error(`[INVENTORY] Error fetching order items for ${orderId}:`, itemsErr);
      return;
    }

    // Deduct inventory for each item
    for (const item of items) {
      if (!item.product_id) {
        console.warn(`[INVENTORY] Order item has no product_id, trying to find by SKU: ${item.sku}`);
        // Try to find product by SKU
        const { data: product } = await supabase
          .from("products")
          .select("id, stock_qty")
          .eq("sku", item.sku)
          .maybeSingle();

        if (!product) {
          console.warn(`[INVENTORY] Product not found for SKU ${item.sku}`);
          continue;
        }

        const newStock = Math.max(0, (product.stock_qty || 0) - item.quantity);
        await supabase
          .from("products")
          .update({ stock_qty: newStock, in_stock: newStock > 0 })
          .eq("id", product.id);
        console.log(`[INVENTORY] Deducted ${item.quantity} from SKU ${item.sku} (product ${product.id}), new stock: ${newStock}`);
      } else {
        // Get current stock
        const { data: product } = await supabase
          .from("products")
          .select("stock_qty")
          .eq("id", item.product_id)
          .maybeSingle();

        if (!product) {
          console.warn(`[INVENTORY] Product not found for ID ${item.product_id}`);
          continue;
        }

        const newStock = Math.max(0, (product.stock_qty || 0) - item.quantity);
        await supabase
          .from("products")
          .update({ stock_qty: newStock, in_stock: newStock > 0 })
          .eq("id", item.product_id);
        console.log(`[INVENTORY] Deducted ${item.quantity} from product ${item.product_id}, new stock: ${newStock}`);
      }
    }
  } catch (err) {
    console.error(`[INVENTORY] Error deducting inventory for order ${orderId}:`, err);
  }
}

async function handleOrderStatusSync(req: Request): Promise<Response> {
  // For automated syncs (GitHub Actions, cron jobs), use service role directly
  // Otherwise verify admin for manual trigger
  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Optional: verify if user is making request (for UI-triggered syncs)
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const { supabase: userSupabase, error: authErr } = await verifyAdmin(req);
    if (authErr || !userSupabase) return jsonResponse({ error: authErr }, 401);
    supabase = userSupabase;
  }
  // If no auth header, that's OK for automated syncs - use service role

  const apiKey = getApiKey();
  if (!apiKey)
    return jsonResponse({ error: "ShipStation API key not configured" }, 500);

  // Fetch all orders with shipstation_order_id (not null and not empty)
  const { data: orders, error: orderErr } = await supabase
    .from("orders")
    .select("id, shipstation_order_id, status")
    .not("shipstation_order_id", "is", null)
    .neq("shipstation_order_id", "");

  if (orderErr) {
    return jsonResponse({ error: `Database error: ${orderErr.message}` }, 500);
  }

  if (!orders || orders.length === 0) {
    return jsonResponse({
      success: true,
      summary: { checked: 0, updated: 0, errors: 0 },
    });
  }

  let updated = 0;
  let errors = 0;
  let firstError = null;
  const updates: Array<{ orderId: string; newStatus: string }> = [];
  const checkedOrders: Array<{ orderNumber: string; shipstationId: string; appStatus: string; ssShipmentStatus: string; tracking: string; wouldUpdate: boolean }> = [];

  // Fetch each shipment's status from ShipStation
  for (const order of orders) {
    try {
      console.log(`[MANUAL-SYNC] Fetching shipment status for ${order.shipstation_order_id}`);

      // Use V2 shipments endpoint (we store shipment IDs, not order IDs)
      let res = await fetch(`${SS_V2_BASE}/shipments/${order.shipstation_order_id}`, {
        headers: { "API-Key": apiKey },
      });

      // If that fails with se- prefix, it's definitely a shipment, not an order
      if (!res.ok && order.shipstation_order_id?.startsWith('se-')) {
        console.log(`[MANUAL-SYNC] Trying sales orders endpoint instead`);
        res = await fetch(`${SS_V2_BASE}/orders/${order.shipstation_order_id}`, {
          headers: { "API-Key": apiKey },
        });
      }

      console.log(`[MANUAL-SYNC] Response status: ${res.status}`);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[MANUAL-SYNC] Failed to fetch order ${order.shipstation_order_id}: HTTP ${res.status}`);
        console.error(`[MANUAL-SYNC] Error response: ${errText}`);
        if (!firstError) {
          firstError = { status: res.status, text: errText };
        }
        errors++;
        continue;
      }

      const data = await res.json();

      // ShipStation V2 API returns the shipment directly, not wrapped
      const shipment = data as SSShipment | undefined;

      if (!shipment || !shipment.shipment_id) {
        console.warn(`[MANUAL-SYNC] Invalid shipment response for ${order.shipstation_order_id}`);
        if (!firstError) {
          firstError = { error: "Invalid shipment response", hasShipmentId: !!shipment?.shipment_id };
        }
        errors++;
        continue;
      }

      // Get shipment status from ShipStation
      const shipmentStatus = shipment.shipment_status || shipment.status || "unknown";
      const modifiedAt = (shipment.modified_at as string | undefined);
      const trackingNumber = (shipment.tracking_number as string | undefined);
      const carrier = (shipment.carrier as string | undefined);

      console.log(`[MANUAL-SYNC] Order ${order.order_number}: Shipment_Status="${shipmentStatus}", Tracking="${trackingNumber}", Carrier="${carrier}", Current_App_Status="${order.status}"`);
      console.log(`[FULL-SHIPMENT-DATA] ${JSON.stringify(shipment)}`);

      // Log for first order for debugging
      if (!firstError && orders[0]?.id === order.id) {
        if (!firstError) firstError = {};
        firstError.shipmentStatus = shipmentStatus;
        firstError.trackingNumber = trackingNumber;
        firstError.carrier = carrier;
        firstError.modifiedAt = modifiedAt;
        firstError.fullShipment = shipment;
      }

      // Map ShipStation shipment status to app status
      // Check for indicators that shipment was actually shipped:
      // - shipment_status === "shipped"
      // - Has tracking number + carrier
      // - shipment_status === "label_purchased" (label was bought = manual mark as shipped)
      let appStatus = order.status;

      if (shipmentStatus === "shipped") {
        appStatus = "shipped";
        console.log(`  → Updated: shipment_status is 'shipped'`);
      } else if (shipmentStatus === "label_purchased") {
        // Label purchased = manually marked as shipped in ShipStation UI
        appStatus = "shipped";
        console.log(`  → Updated: shipment_status is 'label_purchased' (manual mark as shipped)`);
      } else if (trackingNumber && carrier) {
        // Has both tracking number AND carrier = shipment picked up/in transit
        appStatus = "shipped";
        console.log(`  → Updated: has tracking number + carrier (${carrier})`);
      } else if (shipmentStatus === "cancelled") {
        appStatus = "cancelled";
        console.log(`  → Updated: shipment_status is 'cancelled'`);
      } else {
        console.log(`  → No action: shipment_status='${shipmentStatus}' (keeping current: '${order.status}')`);
      }

      // Track updates if status changed
      const wouldUpdate = appStatus !== order.status;
      if (wouldUpdate) {
        console.log(`[MANUAL-SYNC] ✓ Will update order ${order.id} from '${order.status}' to '${appStatus}'`);
        updates.push({ orderId: order.id, newStatus: appStatus });
      } else {
        console.log(`[MANUAL-SYNC] ✗ No change needed for order ${order.id}`);
      }

      // Track this order for debug response
      checkedOrders.push({
        orderNumber: order.order_number,
        shipstationId: order.shipstation_order_id,
        appStatus: order.status,
        ssShipmentStatus: shipmentStatus,
        tracking: trackingNumber || "none",
        wouldUpdate,
      });
    } catch (err) {
      console.error(`[MANUAL-SYNC] Error fetching shipment status:`, err);
      errors++;
    }
  }

  // Apply all updates to database
  for (const update of updates) {
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ status: update.newStatus })
      .eq("id", update.orderId);
    if (updateErr) {
      console.error(`[MANUAL-SYNC] Update error for order ${update.orderId}:`, updateErr);
      errors++;
    } else {
      updated++;

      // If marking as shipped, deduct inventory
      if (update.newStatus === "shipped") {
        console.log(`[INVENTORY] Deducting inventory for order ${update.orderId}`);
        await deductInventoryForOrder(supabase, update.orderId);
      }
    }
  }

  // Update last sync time in portal_settings
  try {
    await supabase
      .from("portal_settings")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", "global");
    console.log(`[MANUAL-SYNC] Updated last_sync_at timestamp`);
  } catch (err) {
    console.error(`[MANUAL-SYNC] Failed to update sync timestamp:`, err);
  }

  // Return debug info for troubleshooting
  const debugInfo = {
    firstOrderId: orders[0]?.id,
    firstShipstationId: orders[0]?.shipstation_order_id,
    firstOrderStatus: orders[0]?.status,
    firstError: firstError,
    firstFullShipment: firstError?.fullShipment,
    allCheckedOrders: checkedOrders,
    message: `Checked ${orders.length} orders, found ${updates.length} needing updates, successfully updated ${updated} orders`,
  };

  return jsonResponse({
    success: errors === 0,
    summary: { checked: orders.length, updated, errors },
    debug: debugInfo,
  });
}

// ── Cancel Order: user cancels a net30 order and we void it in ShipStation ──

async function handleCancelOrder(req: Request): Promise<Response> {
  console.log(`[CANCEL-ORDER] Handler called`);
  const { supabase, userId, error: authErr } = await verifyUser(req);
  console.log(`[CANCEL-ORDER] Auth result - userId: ${userId}, error: ${authErr}`);
  if (authErr || !supabase || !userId) return jsonResponse({ error: authErr }, 401);

  const apiKey = getApiKey();
  if (!apiKey)
    return jsonResponse({ error: "ShipStation API key not configured" }, 500);

  let body: { orderId: string } = { orderId: "" };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (!body.orderId) {
    return jsonResponse({ error: "orderId is required" }, 400);
  }

  const orderId = body.orderId;

  try {
    // Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return jsonResponse({ error: `Order not found: ${orderErr?.message || "Unknown error"}` }, 404);
    }

    // Verify ownership
    if (order.profile_id !== userId) {
      return jsonResponse({ error: "You do not have permission to cancel this order" }, 403);
    }

    // Check constraints
    if (order.payment_method !== "net30") {
      return jsonResponse({ error: "Only Net-30 orders can be cancelled" }, 400);
    }

    if (order.status === "shipped") {
      return jsonResponse({ error: "Cannot cancel an order that has already shipped" }, 400);
    }

    if (order.status === "cancelled") {
      return jsonResponse({ error: "This order is already cancelled" }, 400);
    }

    console.log(`[CANCEL-ORDER] Cancelling order ${orderId} (shipstation_id: ${order.shipstation_order_id})`);

    // Cancel the shipment in ShipStation if it exists
    const shipstationDebug: Record<string, unknown> = {};

    if (order.shipstation_order_id) {
      try {
        console.log(`[CANCEL-ORDER] Attempting to cancel ShipStation shipment ${order.shipstation_order_id}`);

        // Step 1: Get shipment details to check for labels
        console.log(`[CANCEL-ORDER] Step 1: Fetching shipment details`);
        const getRes = await fetch(`${SS_V2_BASE}/shipments/${order.shipstation_order_id}`, {
          method: "GET",
          headers: ssHeaders(apiKey),
        });

        shipstationDebug.step1_get_status = getRes.status;

        if (getRes.ok) {
          const shipmentData = await getRes.json();
          const shipment = shipmentData.shipments?.[0] || shipmentData;
          const labelId = shipment.label_id || shipment.labelId;

          shipstationDebug.shipment_status = shipment.shipment_status;
          shipstationDebug.has_label = !!labelId;

          console.log(`[CANCEL-ORDER] Shipment details: ${JSON.stringify({ label_id: labelId, shipment_status: shipment.shipment_status })}`);

          // Step 2: Void the label if it exists
          if (labelId) {
            console.log(`[CANCEL-ORDER] Step 2: Voiding label ${labelId}`);
            const voidRes = await fetch(`${SS_V2_BASE}/labels/${labelId}/void`, {
              method: "PUT",
              headers: ssHeaders(apiKey),
            });

            shipstationDebug.step2_void_status = voidRes.status;
            console.log(`[CANCEL-ORDER] Void label response: ${voidRes.status}`);
            if (!voidRes.ok) {
              const voidErr = await voidRes.text();
              shipstationDebug.step2_void_error = voidErr;
              console.warn(`[CANCEL-ORDER] ⚠️ Failed to void label: ${voidErr}`);
            } else {
              console.log(`[CANCEL-ORDER] ✅ Label voided successfully`);
            }
          } else {
            console.log(`[CANCEL-ORDER] ℹ️ No label found on shipment`);
          }
        } else {
          const errText = await getRes.text();
          shipstationDebug.step1_error = errText;
          console.warn(`[CANCEL-ORDER] ⚠️ Failed to fetch shipment details: ${getRes.status} - ${errText}`);
        }

        // Step 3: Cancel the shipment (use PUT method)
        console.log(`[CANCEL-ORDER] Step 3: Cancelling shipment`);
        const cancelUrl = `${SS_V2_BASE}/shipments/${order.shipstation_order_id}/cancel`;
        const ssRes = await fetch(cancelUrl, {
          method: "PUT",
          headers: ssHeaders(apiKey),
        });

        shipstationDebug.step3_cancel_status = ssRes.status;
        console.log(`[CANCEL-ORDER] Cancel response status: ${ssRes.status}`);

        if (ssRes.status === 204) {
          shipstationDebug.step3_success = true;
          console.log(`[CANCEL-ORDER] ✅ ShipStation shipment cancelled successfully (HTTP 204 No Content)`);
        } else if (ssRes.ok) {
          const responseText = await ssRes.text();
          shipstationDebug.step3_response = responseText;
          console.log(`[CANCEL-ORDER] ✅ ShipStation response: ${ssRes.status} - ${responseText}`);
        } else {
          const errText = await ssRes.text();
          shipstationDebug.step3_error = errText;
          console.warn(`[CANCEL-ORDER] ⚠️ ShipStation cancel returned ${ssRes.status}: ${errText}`);
        }
      } catch (err) {
        shipstationDebug.exception = String(err);
        console.error(`[CANCEL-ORDER] ❌ Error calling ShipStation:`, err);
      }
    } else {
      shipstationDebug.no_shipstation_id = true;
      console.log(`[CANCEL-ORDER] ℹ️ No shipstation_order_id found, skipping ShipStation sync`);
    }

    // Update order status to cancelled
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId);

    if (updateErr) {
      console.error(`[CANCEL-ORDER] Failed to update order status:`, updateErr);
      return jsonResponse({ error: `Failed to cancel order: ${updateErr.message}` }, 500);
    }

    // Restore the credit for Net-30 orders
    try {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("current_balance")
        .eq("id", userId)
        .maybeSingle();

      if (profileErr || !profile) {
        console.error(`[CANCEL-ORDER] Failed to fetch profile:`, profileErr);
      } else {
        const newBalance = Math.max(0, (profile.current_balance || 0) - (order.total || 0));
        const { error: balanceErr } = await supabase
          .from("profiles")
          .update({ current_balance: newBalance })
          .eq("id", userId);

        if (balanceErr) {
          console.error(`[CANCEL-ORDER] Failed to restore credit:`, balanceErr);
          return jsonResponse({ error: `Failed to restore credit: ${balanceErr.message}` }, 500);
        }
        console.log(`[CANCEL-ORDER] Credit restored: £${order.total} (new balance: £${newBalance})`);
      }
    } catch (err) {
      console.error(`[CANCEL-ORDER] Error restoring credit:`, err);
      // Order is already cancelled, so we don't fail here
    }

    return jsonResponse({
      success: true,
      message: "Order cancelled successfully and credit has been restored",
      cancelled_order_id: orderId,
      credit_restored: order.total,
      debug: {
        shipstation_order_id: order.shipstation_order_id,
        order_status: order.status,
        payment_method: order.payment_method,
        shipstation: shipstationDebug,
      },
    });
  } catch (err) {
    console.error(`[CANCEL-ORDER] Unexpected error:`, err);
    return jsonResponse({ error: `Failed to cancel order: ${String(err)}` }, 500);
  }
}


// ── Main router ──

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Client-Info, Apikey",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop()?.toLowerCase().trim() || "";

    console.log(`[ROUTER] Received path: "${path}" from URL: ${url.pathname}`);

    if (path === "inventory") {
      return await handleInventorySync(req);
    }

    if (path === "auto-order") {
      return await handleAutoOrderPush(req);
    }

    if (path === "status-sync") {
      return await handleOrderStatusSync(req);
    }

    if (path === "cancel-order") {
      return await handleCancelOrder(req);
    }

    console.log(`[ROUTER] No specific handler matched for path "${path}", using default handleOrderPush`);
    return await handleOrderPush(req);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
