import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'

export const useDeviceStatus = (deviceId: string) => {
  const { user } = useAuth()
  const isOnlineRef = useRef(false)

  // Atualizar status para online (chamado apenas quando necessário)
  // Verifica se o dispositivo não foi explicitamente desconectado antes de marcar como online
  const setOnline = async () => {
    if (!user || !deviceId || isOnlineRef.current) return

    try {
      // Verifica o status atual antes de atualizar
      const { data: device, error: checkError } = await supabase
        .from('devices')
        .select('status')
        .eq('id', deviceId)
        .eq('user_id', user.id)
        .single()

      if (checkError || !device) {
        console.log('⚠️ Dispositivo não encontrado ao tentar marcar como online')
        return
      }

      // Se o dispositivo foi explicitamente desconectado no dashboard, NÃO marca como online
      // Verificação case-insensitive para garantir que funciona mesmo com variações de case
      const deviceStatus = device.status?.toLowerCase()?.trim()
      if (deviceStatus === 'offline') {
        console.log('⚠️ Dispositivo está desconectado no dashboard (status: offline), não marcando como online')
        isOnlineRef.current = false
        return
      }

      // Só atualiza se o status não for 'offline'
      const { error } = await supabase
        .from('devices')
        .update({
          status: 'online',
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', deviceId)
        .eq('user_id', user.id)
      
      if (!error) {
        isOnlineRef.current = true
        console.log('Dispositivo marcado como online')
      }
    } catch (error) {
      console.error('Erro ao marcar dispositivo como online:', error)
    }
  }

  // Atualizar status para offline (chamado apenas quando necessário)
  const setOffline = async () => {
    if (!user || !deviceId || !isOnlineRef.current) return

    try {
      await supabase
        .from('devices')
        .update({
          status: 'offline',
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', deviceId)
        .eq('user_id', user.id)
      
      isOnlineRef.current = false
      console.log('Dispositivo marcado como offline')
    } catch (error) {
      console.error('Erro ao marcar dispositivo como offline:', error)
    }
  }

  // Detectar quando o app vai para background/foreground
  // NÃO marca como offline quando vai para background - mantém online para continuar campanhas
  const handleVisibilityChange = () => {
    // Quando volta para foreground, apenas atualiza last_seen
    if (!document.hidden) {
      setOnline()
    }
    // Quando vai para background, NÃO marca como offline - deixa continuar online
  }

  // Detectar quando o app perde/recupera conexão
  const handleOnline = () => {
    setOnline()
  }

  // Só marca como offline se realmente perdeu conexão de internet
  const handleOffline = () => {
    // Não marca como offline imediatamente - pode ser apenas um problema temporário
    // O dispositivo continua pareado mesmo sem internet momentânea
    console.log('⚠️ Conexão de internet perdida, mas mantendo dispositivo pareado')
  }

  // Detectar quando a janela/aba é fechada
  // NÃO marca como offline - o dispositivo continua pareado mesmo após fechar o app
  // O Android pode manter o serviço rodando em background para campanhas
  const handleBeforeUnload = () => {
    // Apenas atualiza last_seen, mas mantém status online
    // O dispositivo só é marcado como offline se o usuário desemparear manualmente no dashboard
    if (user && deviceId && isOnlineRef.current) {
      // Atualiza last_seen sem mudar status
      const data = JSON.stringify({
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      
      try {
        navigator.sendBeacon(
          `https://jovnndvixqymfvnxkbep.supabase.co/rest/v1/devices?id=eq.${deviceId}&user_id=eq.${user.id}`,
          data
        )
      } catch (e) {
        // Ignora erros no sendBeacon
      }
    }
  }

  useEffect(() => {
    if (!user || !deviceId) return

    // Verifica o status atual do dispositivo no banco antes de marcar como online
    // Se o dispositivo foi desconectado no dashboard (status = 'offline'), NÃO marca como online
    const checkAndSetOnline = async () => {
      try {
        const { data: device, error } = await supabase
          .from('devices')
          .select('status')
          .eq('id', deviceId)
          .eq('user_id', user.id)
          .single()

        if (error || !device) {
          console.log('⚠️ Dispositivo não encontrado no banco')
          return
        }

        // Se o dispositivo foi explicitamente desconectado no dashboard, NÃO marca como online
        // Verificação case-insensitive para garantir que funciona mesmo com variações de case
        const deviceStatus = device.status?.toLowerCase()?.trim()
        if (deviceStatus === 'offline') {
          console.log('⚠️ Dispositivo está desconectado no dashboard (status: offline), não marcando como online')
          isOnlineRef.current = false
          return
        }

        // Só marca como online se o status não for 'offline'
        if (deviceStatus === 'online' || deviceStatus === 'configured') {
          await setOnline()
        }
      } catch (error) {
        console.error('Erro ao verificar status do dispositivo:', error)
      }
    }

    // Verifica o status antes de marcar como online
    checkAndSetOnline()

    // Listeners para detectar mudanças de estado
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Cleanup ao desmontar o hook
    // NÃO marca como offline no cleanup - dispositivo continua pareado
    return () => {
      // Apenas remove listeners, não marca como offline
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user, deviceId])

  return {
    startHeartbeat: setOnline,
    stopHeartbeat: setOffline
  }
}