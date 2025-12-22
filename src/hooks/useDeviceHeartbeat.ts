import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import { Device } from './usePBXData'

/**
 * Hook para monitorar status de dispositivos
 * 
 * NOTA: A marcação offline foi DESABILITADA porque o HeartbeatForegroundService
 * no Android já atualiza o status para 'online' a cada 30 segundos via PATCH
 * direto no banco. Quando o app é fechado ou perde conexão, o serviço nativo
 * para de enviar heartbeats e o status permanece desatualizado naturalmente.
 * 
 * A lógica anterior causava falsos positivos quando:
 * - Android Doze mode atrasava heartbeats
 * - Havia atrasos temporários de rede
 * - A WebView marcava offline via eventos web (window.offline)
 */
interface UseDeviceHeartbeatOptions {
  devices: Device[]
  onDeviceInactive: (deviceId: string) => void
}

// Threshold e intervalo mantidos para referência futura
const OFFLINE_THRESHOLD_MS = 300000 // 5 minutos
const CHECK_INTERVAL_MS = 120000 // 2 minutos

export const useDeviceHeartbeat = ({
  devices,
  onDeviceInactive
}: UseDeviceHeartbeatOptions) => {
  const { user } = useAuth()
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const onDeviceInactiveRef = useRef(onDeviceInactive)

  useEffect(() => {
    onDeviceInactiveRef.current = onDeviceInactive
  }, [onDeviceInactive])

  useEffect(() => {
    if (!user?.id) return

    // DESABILITADO: O HeartbeatForegroundService no Android já cuida do status
    // A verificação periódica foi removida para evitar conflitos
    // O serviço nativo envia heartbeats a cada 30s e atualiza o banco diretamente

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [user?.id])

  return { sendPing: () => { } }
}
