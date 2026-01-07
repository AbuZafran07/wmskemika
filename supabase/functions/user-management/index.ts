import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Valid roles enum
const VALID_ROLES = ["super_admin", "admin", "finance", "purchasing", "warehouse", "sales", "viewer"] as const;
type AppRole = (typeof VALID_ROLES)[number];

// Validation utilities
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 6) return { valid: false, message: "Password must be at least 6 characters" };
  return { valid: true };
}

function isValidRole(role: string): role is AppRole {
  return VALID_ROLES.includes(role as AppRole);
}

function sanitizeString(str: string, maxLength: number = 255): string {
  return String(str ?? "")
    .trim()
    .slice(0, maxLength);
}

function isUuid(v: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v);
}

serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  console.log("INVOKED user-management", req.method, new Date().toISOString());

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    // Client pakai token user (untuk validasi session user yang memanggil)
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    // Admin client pakai service role (untuk create user / listUsers / update password)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Pastikan pemanggil adalah super_admin (berdasarkan table user_roles kamu)
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError) throw roleError;
    if (!userRole || userRole.role !== "super_admin") {
      throw new Error("Only super_admin can manage users");
    }

    const { action, ...params } = await req.json();
    console.log("Action:", action);

    let result: any = null;

    switch (action) {
      case "list": {
        console.log("Fetching users list...");
        
        const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) {
          console.error("Error listing auth users:", listError);
          throw listError;
        }
        console.log("Found auth users:", authUsers?.users?.length || 0);

        const { data: roles, error: rolesError } = await supabaseAdmin.from("user_roles").select("user_id, role");
        if (rolesError) {
          console.error("Error fetching roles:", rolesError);
          throw rolesError;
        }
        console.log("Found roles:", roles?.length || 0);

        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, is_active");
        if (profilesError) {
          console.error("Error fetching profiles:", profilesError);
          throw profilesError;
        }
        console.log("Found profiles:", profiles?.length || 0);

        const users = authUsers.users.map((u) => {
          const userRoles = roles?.filter((r) => r.user_id === u.id) || [];
          const profile = profiles?.find((p) => p.id === u.id);
          return {
            id: u.id,
            email: u.email,
            full_name: profile?.full_name || (u.user_metadata as any)?.full_name || u.email,
            is_active: profile?.is_active ?? true,
            roles: userRoles.map((r) => r.role),
            created_at: u.created_at,
          };
        });

        console.log("Returning users:", users.length);
        result = { users };
        break;
      }

      case "create": {
        const email = sanitizeString(params.email);
        const password = String(params.password ?? "");
        const role = String(params.role ?? "");
        const full_name = params.full_name ? sanitizeString(params.full_name, 100) : undefined;

        if (!email || !password || !role) throw new Error("Email, password, and role are required");
        if (!isValidEmail(email)) throw new Error("Invalid email format");

        const pw = isValidPassword(password);
        if (!pw.valid) throw new Error(pw.message);

        if (!isValidRole(role)) throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });
        if (authError) throw authError;

        const { error: roleInsertError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: authData.user.id, role });
        if (roleInsertError) throw roleInsertError;

        result = { user: { id: authData.user.id, email: authData.user.email } };
        break;
      }

      case "update": {
        const user_id = String(params.user_id ?? "");
        const role = params.role ? String(params.role) : undefined;
        const full_name = params.full_name ? sanitizeString(params.full_name, 100) : undefined;
        const is_active = params.is_active;

        if (!user_id) throw new Error("User ID is required");
        if (!isUuid(user_id)) throw new Error("Invalid user ID format");
        if (role && !isValidRole(role)) throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);

        const updateData: Record<string, unknown> = {};
        if (full_name !== undefined) updateData.full_name = full_name;
        if (typeof is_active === "boolean") updateData.is_active = is_active;

        if (Object.keys(updateData).length > 0) {
          const { error: profileError } = await supabaseAdmin.from("profiles").update(updateData).eq("id", user_id);
          if (profileError) throw profileError;
        }

        if (role) {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
          const { error: roleInsertError } = await supabaseAdmin.from("user_roles").insert({ user_id, role });
          if (roleInsertError) throw roleInsertError;
        }

        result = { success: true };
        break;
      }

      case "delete": {
        const user_id = String(params.user_id ?? "");
        if (!user_id) throw new Error("User ID is required");
        if (!isUuid(user_id)) throw new Error("Invalid user ID format");
        if (user_id === user.id) throw new Error("Cannot delete your own account");

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
        if (deleteError) throw deleteError;

        result = { success: true };
        break;
      }

      case "reset_password": {
        const user_id = String(params.user_id ?? "");
        const new_password = String(params.new_password ?? "");
        if (!user_id || !new_password) throw new Error("User ID and new password are required");
        if (!isUuid(user_id)) throw new Error("Invalid user ID format");

        const pw = isValidPassword(new_password);
        if (!pw.valid) throw new Error(pw.message);

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          password: new_password,
        });
        if (updateError) throw updateError;

        result = { success: true };
        break;
      }

      case "bulk_create": {
        const usersToCreate = params.users;

        if (!Array.isArray(usersToCreate) || usersToCreate.length === 0) {
          throw new Error("Users array is required and cannot be empty");
        }
        if (usersToCreate.length > 50) throw new Error("Maximum 50 users can be created at once");

        const results: { row: number; email: string; success: boolean; error?: string }[] = [];

        for (let i = 0; i < usersToCreate.length; i++) {
          const rowNum = i + 2;
          const u = usersToCreate[i] ?? {};
          const email = sanitizeString(u.email);
          const password = String(u.password ?? "");
          const role = String(u.role ?? "");
          const full_name = u.full_name ? sanitizeString(u.full_name, 100) : undefined;

          try {
            if (!email || !password || !role) {
              results.push({ row: rowNum, email, success: false, error: "Email, password, and role are required" });
              continue;
            }
            if (!isValidEmail(email)) {
              results.push({ row: rowNum, email, success: false, error: "Invalid email format" });
              continue;
            }
            const pw = isValidPassword(password);
            if (!pw.valid) {
              results.push({ row: rowNum, email, success: false, error: pw.message });
              continue;
            }
            if (!isValidRole(role)) {
              results.push({
                row: rowNum,
                email,
                success: false,
                error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
              });
              continue;
            }

            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { full_name },
            });

            if (authError) {
              results.push({ row: rowNum, email, success: false, error: authError.message });
              continue;
            }

            const { error: roleInsertError } = await supabaseAdmin
              .from("user_roles")
              .insert({ user_id: authData.user.id, role });

            if (roleInsertError) {
              await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
              results.push({ row: rowNum, email, success: false, error: roleInsertError.message });
              continue;
            }

            results.push({ row: rowNum, email, success: true });
          } catch (err) {
            results.push({
              row: rowNum,
              email,
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }
        }

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        result = {
          results,
          summary: {
            total: usersToCreate.length,
            success: successCount,
            failed: failCount,
          },
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "An error occurred";

    const status =
      msg === "No authorization header" || msg === "Unauthorized"
        ? 401
        : msg.includes("Only super_admin")
          ? 403
          : msg.startsWith("Invalid") || msg.includes("required") || msg.startsWith("Unknown action")
            ? 400
            : 500;

    console.error("User management error:", error);

    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
