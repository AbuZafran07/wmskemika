import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Valid roles enum
const VALID_ROLES = ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'] as const;
type AppRole = typeof VALID_ROLES[number];

// Validation utilities
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 12) {
    return { valid: false, message: 'Password must be at least 12 characters' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true };
}

function isValidRole(role: string): role is AppRole {
  return VALID_ROLES.includes(role as AppRole);
}

function sanitizeString(str: string, maxLength: number = 255): string {
  return str.trim().slice(0, maxLength);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create Supabase client with user's token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Create admin client for user management
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if requesting user is super_admin
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError || !userRole || userRole.role !== 'super_admin') {
      throw new Error('Only super_admin can manage users');
    }

    const { action, ...params } = await req.json();
    console.log('Action:', action);

    let result;

    switch (action) {
      case 'list': {
        // Get all users with their roles
        const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const { data: roles, error: rolesError } = await supabaseAdmin
          .from('user_roles')
          .select('user_id, role');
        if (rolesError) throw rolesError;

        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, is_active');
        if (profilesError) throw profilesError;

        const users = authUsers.users.map(u => {
          const userRoles = roles?.filter(r => r.user_id === u.id) || [];
          const profile = profiles?.find(p => p.id === u.id);
          return {
            id: u.id,
            email: u.email,
            full_name: profile?.full_name || u.user_metadata?.full_name || u.email,
            is_active: profile?.is_active ?? true,
            roles: userRoles.map(r => r.role),
            created_at: u.created_at,
          };
        });

        result = { users };
        break;
      }

      case 'create': {
        const { email, password, full_name, role } = params;
        
        // Validate required fields
        if (!email || !password || !role) {
          throw new Error('Email, password, and role are required');
        }

        // Validate email format
        if (!isValidEmail(email)) {
          throw new Error('Invalid email format');
        }

        // Validate password strength
        const passwordCheck = isValidPassword(password);
        if (!passwordCheck.valid) {
          throw new Error(passwordCheck.message);
        }

        // Validate role
        if (!isValidRole(role)) {
          throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
        }

        // Sanitize full_name
        const sanitizedFullName = full_name ? sanitizeString(full_name, 100) : undefined;

        // Create user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: sanitizeString(email),
          password,
          email_confirm: true,
          user_metadata: { full_name: sanitizedFullName }
        });

        if (authError) throw authError;

        // Add role
        const { error: roleInsertError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: role
          });

        if (roleInsertError) throw roleInsertError;

        result = { user: { id: authData.user.id, email: authData.user.email } };
        break;
      }

      case 'update': {
        const { user_id, full_name, role, is_active } = params;
        
        if (!user_id) {
          throw new Error('User ID is required');
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(user_id)) {
          throw new Error('Invalid user ID format');
        }

        // Validate role if provided
        if (role && !isValidRole(role)) {
          throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
        }

        // Sanitize full_name if provided
        const sanitizedFullName = full_name ? sanitizeString(full_name, 100) : undefined;

        // Update profile
        const updateData: Record<string, unknown> = {};
        if (sanitizedFullName !== undefined) updateData.full_name = sanitizedFullName;
        if (typeof is_active === 'boolean') updateData.is_active = is_active;

        if (Object.keys(updateData).length > 0) {
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update(updateData)
            .eq('id', user_id);

          if (profileError) throw profileError;
        }

        // Update role if provided
        if (role) {
          // Delete existing roles and add new one
          await supabaseAdmin
            .from('user_roles')
            .delete()
            .eq('user_id', user_id);

          const { error: roleInsertError } = await supabaseAdmin
            .from('user_roles')
            .insert({
              user_id,
              role
            });

          if (roleInsertError) throw roleInsertError;
        }

        result = { success: true };
        break;
      }

      case 'delete': {
        const { user_id } = params;
        
        if (!user_id) {
          throw new Error('User ID is required');
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(user_id)) {
          throw new Error('Invalid user ID format');
        }

        // Prevent deleting self
        if (user_id === user.id) {
          throw new Error('Cannot delete your own account');
        }

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
        if (deleteError) throw deleteError;

        result = { success: true };
        break;
      }

      case 'reset_password': {
        const { user_id, new_password } = params;
        
        if (!user_id || !new_password) {
          throw new Error('User ID and new password are required');
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(user_id)) {
          throw new Error('Invalid user ID format');
        }

        // Validate password strength
        const passwordCheck = isValidPassword(new_password);
        if (!passwordCheck.valid) {
          throw new Error(passwordCheck.message);
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          user_id,
          { password: new_password }
        );

        if (updateError) throw updateError;

        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    console.error('User management error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
