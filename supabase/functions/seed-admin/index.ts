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
    
    // Verify setup token - this should be a one-time secret set during deployment
    const setupToken = Deno.env.get('ADMIN_SETUP_TOKEN');
    const authHeader = req.headers.get('x-setup-token');
    
    if (!setupToken) {
      console.error('ADMIN_SETUP_TOKEN not configured');
      return new Response(
        JSON.stringify({ 
          error: 'Setup not available. Function not configured.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503 
        }
      );
    }
    
    // Validate setup token using constant-time comparison to prevent timing attacks
    if (!authHeader || !constantTimeEqual(authHeader, setupToken)) {
      console.warn('Invalid or missing setup token attempt');
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }
    
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

    // Check if admin has already been seeded (one-time execution check)
    const { data: existingSetting, error: settingError } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'admin_seeded')
      .maybeSingle();
    
    if (settingError) {
      console.error('Error checking admin_seeded setting:', settingError);
    }
    
    if (existingSetting?.value === true) {
      console.log('Admin already seeded - one-time execution check failed');
      return new Response(
        JSON.stringify({ 
          error: 'Setup already completed. This function can only be run once.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409 
        }
      );
    }

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

      // Mark admin as seeded to prevent future runs
      await markAdminSeeded(supabaseAdmin);

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

    // Mark admin as seeded to prevent future runs
    await markAdminSeeded(supabaseAdmin);

    console.log('Super admin created successfully!');

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

// Constant-time string comparison to prevent timing attacks
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

// Mark admin as seeded in settings table
async function markAdminSeeded(supabaseAdmin: ReturnType<typeof createClient>): Promise<void> {
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({
      key: 'admin_seeded',
      value: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'key'
    });
  
  if (error) {
    console.error('Error marking admin as seeded:', error);
  } else {
    console.log('Admin seeded flag set - function will not run again');
  }
}
