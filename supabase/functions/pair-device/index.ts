import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { session_code, user_id, device_info } = await req.json();

    console.log('Pareamento iniciado:', { session_code, user_id, device_info });

    // 1. Validar se a sessão QR existe e é válida
    const { data: session, error: sessionError } = await supabase
      .from('qr_sessions')
      .select('*')
      .eq('session_code', session_code)
      .eq('user_id', user_id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'QR Code inválido ou expirado' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 2. Verificar se o dispositivo já existe
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('*')
      .eq('id', device_info.device_id)
      .eq('user_id', user_id)
      .single();

    let device;

    if (existingDevice) {
      // Atualizar dispositivo existente
      const { data: updatedDevice, error: updateError } = await supabase
        .from('devices')
        .update({
          name: device_info.name,
          model: device_info.model,
          os: device_info.os,
          os_version: device_info.os_version,
          sim_type: device_info.sim_type,
          has_physical_sim: device_info.has_physical_sim,
          has_esim: device_info.has_esim,
          status: 'online',
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', device_info.device_id)
        .select()
        .single();

      if (updateError) throw updateError;
      device = updatedDevice;
    } else {
      // Criar novo dispositivo
      const { data: newDevice, error: insertError } = await supabase
        .from('devices')
        .insert({
          id: device_info.device_id,
          user_id: user_id,
          name: device_info.name,
          model: device_info.model || 'Smartphone',
          os: device_info.os || 'Android',
          os_version: device_info.os_version || '',
          sim_type: device_info.sim_type || 'physical',
          has_physical_sim: device_info.has_physical_sim || true,
          has_esim: device_info.has_esim || false,
          status: 'online',
          paired_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) throw insertError;
      device = newDevice;
    }

    // 3. Marcar sessão QR como usada
    await supabase
      .from('qr_sessions')
      .update({ used: true })
      .eq('id', session.id);

    // 4. Retornar dados do dispositivo pareado
    return new Response(
      JSON.stringify({
        success: true,
        device,
        message: 'Dispositivo pareado com sucesso'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Erro no pareamento:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Erro interno do servidor' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});