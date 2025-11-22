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

    // Tentar fazer parse do JSON com tratamento de erro
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (jsonError) {
      console.error('Erro ao fazer parse do JSON da requisição:', jsonError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Erro ao processar dados da requisição. Verifique se o formato JSON está correto.' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { session_code, user_id, device_info } = requestBody;

    console.log('Pareamento iniciado:', { session_code, user_id, device_info });

    // Validar dados obrigatórios
    if (!session_code || !user_id || !device_info) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Dados incompletos: session_code, user_id e device_info são obrigatórios' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!device_info.device_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'device_info.device_id é obrigatório' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 1. Validar se a sessão QR existe e é válida
    const { data: session, error: sessionError } = await supabase
      .from('qr_sessions')
      .select('*')
      .eq('session_code', session_code)
      .eq('user_id', user_id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError) {
      console.error('Erro ao buscar sessão QR:', sessionError);
      const errorMsg = sessionError.message || sessionError.code || 'Erro desconhecido ao buscar sessão';
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Erro ao validar QR Code: ${errorMsg}` 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!session) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'QR Code inválido ou expirado. Gere um novo QR Code no dashboard.' 
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
      .maybeSingle();

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

      if (updateError) {
        console.error('Erro ao atualizar dispositivo:', updateError);
        const errorMsg = updateError.message || updateError.code || updateError.hint || 'Erro desconhecido';
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Erro ao atualizar dispositivo: ${errorMsg}` 
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      if (!updatedDevice) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Dispositivo não foi atualizado corretamente' 
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
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

      if (insertError) {
        console.error('Erro ao criar dispositivo:', insertError);
        const errorMsg = insertError.message || insertError.code || insertError.hint || 'Erro desconhecido';
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Erro ao criar dispositivo: ${errorMsg}` 
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      if (!newDevice) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Dispositivo não foi criado corretamente' 
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      device = newDevice;
    }

    // 3. Marcar sessão QR como usada
    const { error: markUsedError } = await supabase
      .from('qr_sessions')
      .update({ used: true })
      .eq('id', session.id);
    
    if (markUsedError) {
      console.error('Erro ao marcar sessão como usada:', markUsedError);
      // Não falha o pareamento se isso der erro, apenas loga
    }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage || 'Erro interno do servidor' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});