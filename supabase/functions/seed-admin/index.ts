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

    const adminEmail = 'ferry@kemika.co.id';
    const adminPassword = '123456';
    const adminName = 'Ferry Admin';

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

      return new Response(
        JSON.stringify({ 
          message: 'Admin user already exists', 
          userId: existingUser.id,
          email: adminEmail
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

    console.log('Admin user created:', authData.user.id);

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

    return new Response(
      JSON.stringify({ 
        message: 'Super admin created successfully!',
        userId: authData.user.id,
        email: adminEmail,
        password: adminPassword,
        role: 'super_admin'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to seed admin user';
    console.error('Seed admin error:', error);
    return new Response(
      JSON.stringify({ 
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
