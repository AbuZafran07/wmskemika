import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    console.log('Action:', action, 'Params:', params);

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
        
        if (!email || !password || !role) {
          throw new Error('Email, password, and role are required');
        }

        // Create user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name }
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

        result = { user: authData.user };
        break;
      }

      case 'update': {
        const { user_id, full_name, role, is_active } = params;
        
        if (!user_id) {
          throw new Error('User ID is required');
        }

        // Update profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({ full_name, is_active })
          .eq('id', user_id);

        if (profileError) throw profileError;

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
