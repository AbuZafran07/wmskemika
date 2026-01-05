import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting seed-admin function...');
    
    // Create Supabase admin client
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

    // Get credentials from environment variables - never hardcode
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');
    const adminName = Deno.env.get('ADMIN_NAME') ?? 'System Administrator';

    if (!adminEmail || !adminPassword) {
      console.error('Missing required environment variables: ADMIN_EMAIL and ADMIN_PASSWORD');
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error. Contact administrator.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    // Validate password strength
    if (adminPassword.length < 12) {
      console.error('Admin password does not meet minimum security requirements');
      return new Response(
        JSON.stringify({ 
          error: 'Password does not meet security requirements (minimum 12 characters)'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log('Checking if admin user exists...');
    
    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      throw listError;
    }

    const existingUser = existingUsers?.users?.find(u => u.email === adminEmail);

    if (existingUser) {
      console.log('Admin user already exists, checking role...');
      
      // Check if role exists
      const { data: existingRole, error: roleError } = await supabaseAdmin
        .from('user_roles')
        .select('*')
        .eq('user_id', existingUser.id)
        .maybeSingle();

      if (roleError) {
        console.error('Error checking role:', roleError);
      }

      if (!existingRole) {
        console.log('Adding super_admin role to existing user...');
        const { error: insertRoleError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: existingUser.id,
            role: 'super_admin'
          });

        if (insertRoleError) {
          console.error('Error inserting role:', insertRoleError);
          throw insertRoleError;
        }
      }

      // Do not expose user details in response
      return new Response(
        JSON.stringify({ 
          message: 'Admin user configuration complete',
          success: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    console.log('Creating new admin user...');
    
    // Create the admin user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName
      }
    });

    if (authError) {
      console.error('Error creating user:', authError);
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Failed to create user');
    }

    console.log('Admin user created successfully');

    // Add super_admin role
    console.log('Adding super_admin role...');
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role: 'super_admin'
      });

    if (roleError) {
      console.error('Error inserting role:', roleError);
      throw roleError;
    }

    console.log('Super admin created successfully!');

    // Do not expose credentials or user details in response
    return new Response(
      JSON.stringify({ 
        message: 'Super admin created successfully',
        success: true
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    // Do not expose internal error details
    console.error('Seed admin error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred during admin setup. Check server logs.'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
