import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'

export const useDeviceStatus = (deviceId: string) => {
  const { user } = useAuth()
  const isOnlineRef = useRef(false)

  // Atualizar status para online (chamado apenas quando necessário)
  const setOnline = async () => {
    if (!user || !deviceId || isOnlineRef.current) return

    try {
      await supabase
        .from('devices')
        .update({
          status: 'online',
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', deviceId)
        .eq('user_id', user.id)

      isOnlineRef.current = true
      console.log('Dispositivo marcado como online')
    } catch (error) {
      console.error('Erro ao marcar dispositivo como online:', error)
    }
  }

  // Atualizar status para offline (chamado apenas quando necessário)
  // CORREÇÃO: Não atualiza se status já for 'unpaired' (despareamento intencional)
  const setOffline = async () => {
    if (!user || !deviceId || !isOnlineRef.current) return

    try {
      // Verificar status atual antes de mudar para offline
      const { data: currentDevice } = await supabase
        .from('devices')
        .select('status')
        .eq('id', deviceId)
        .eq('user_id', user.id)
        .single()

      // Se já está 'unpaired', não fazer nada (foi despareamento intencional)
      if (currentDevice?.status === 'unpaired') {
        console.log('Dispositivo já está unpaired, não mudando para offline')
        isOnlineRef.current = false
        return
      }

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
  // CORREÇÃO: Não desconecta quando tela apaga, apenas atualiza last_seen
  const handleVisibilityChange = async () => {
    if (document.hidden) {
      // Tela apagada: apenas atualiza last_seen, NÃO muda status para offline
      if (user && deviceId) {
        try {
          await supabase
            .from('devices')
            .update({
              last_seen: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', deviceId)
            .eq('user_id', user.id)
          console.log('Tela apagada: last_seen atualizado (status mantido)')
        } catch (error) {
          console.error('Erro ao atualizar last_seen:', error)
        }
      }
    } else {
      // Tela ligou novamente: marcar como online
      setOnline()
    }
  }

  // Detectar quando o app perde/recupera conexão
  const handleOnline = () => {
    setOnline()
  }

  const handleOffline = () => {
    // CORREÇÃO: NÃO marcar offline via eventos web da WebView
    // O HeartbeatForegroundService.kt (nativo) já cuida do status em background
    // Se marcarmos offline aqui, sobrescrevemos o status que o serviço nativo mantém correto
    console.log('⚠️ Evento offline da WebView ignorado - HeartbeatForegroundService cuida do status')
  }

  // Detectar quando a janela/aba é fechada
  const handleBeforeUnload = () => {
    // Usar navigator.sendBeacon para garantir que o request seja enviado
    if (user && deviceId && isOnlineRef.current) {
      const data = JSON.stringify({
        status: 'offline',
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      navigator.sendBeacon(
        `https://jovnndvixqymfvnxkbep.supabase.co/rest/v1/devices?id=eq.${deviceId}&user_id=eq.${user.id}`,
        data
      )
    }
  }

  useEffect(() => {
    if (!user || !deviceId) return

    // Marcar como online quando o hook é montado
    setOnline()

    // Listeners para detectar mudanças de estado
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Cleanup ao desmontar o hook
    // CORREÇÃO: NÃO chamar setOffline() aqui pois o HeartbeatForegroundService
    // continua rodando em background e mantendo o status correto
    return () => {
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