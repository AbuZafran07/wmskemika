import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Public, unauthenticated endpoint. Returns ONLY public certificate fields.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = new URL(req.url);
    let number = url.searchParams.get("number") ?? "";
    let token = url.searchParams.get("token") ?? "";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      number = typeof body.number === "string" ? body.number : number;
      token = typeof body.token === "string" ? body.token : token;
    }

    number = number.trim().slice(0, 100);
    token = token.trim().slice(0, 200);

    if (!number) return json({ error: "Nomor sertifikat wajib diisi" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("verify_certificate", {
      p_number: number,
      p_token: token,
    });

    if (error) {
      console.error("verify_certificate error", error.message);
      return json({ error: "Gagal memverifikasi sertifikat" }, 500);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return json({ status: "not_found", certificate_number: number });

    // Whitelist of public-safe fields only.
    const isMasked = !token || token.length < 8;
    return json({
      status: row.status,
      certificate_number: row.certificate_number,
      certificate_issued_at: row.certificate_issued_at,
      // aliases for the public portal client
      issued_at: row.certificate_issued_at,
      valid_until: row.expires_at,
      measuring_range: row.measurement_range,
      brand_model: row.brand_model,
      expires_at: row.expires_at,
      instrument_name: row.instrument_name,
      serial_number: row.serial_number,
      measurement_range: row.measurement_range,
      calibration_method: row.calibration_method,
      customer_name: row.customer_name,
      revoked_at: row.revoked_at,
      revoked_reason: row.revoked_reason,
      is_masked: isMasked,
    });
  } catch (e) {
    console.error("unexpected", e instanceof Error ? e.message : String(e));
    return json({ error: "Terjadi kesalahan" }, 500);
  }
});