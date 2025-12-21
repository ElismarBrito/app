import { useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import { Device } from './usePBXData'

/**
 * Hook SIMPLES para detectar dispositivos offline
 * 
 * Verifica periodicamente o campo last_seen no banco de dados
 * Se um dispositivo online tem last_seen desatualizado, marca como offline
 * 
 * MUITO MAIS SIMPLES que o sistema de ping/pong via broadcast
 */
interface UseDeviceHeartbeatOptions {
  devices: Device[]
  onDeviceInactive: (deviceId: string) => void
}

// Tempo máximo (em ms) que um dispositivo pode ficar sem atualizar last_seen antes de ser marcado offline
const OFFLINE_THRESHOLD_MS = 60000 // 1 minuto
// Intervalo de verificação (em ms)
const CHECK_INTERVAL_MS = 30000 // 30 segundos

export const useDeviceHeartbeat = ({
  devices,
  onDeviceInactive
}: UseDeviceHeartbeatOptions) => {
  const { user } = useAuth()
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const devicesRef = useRef(devices)
  const onDeviceInactiveRef = useRef(onDeviceInactive)

  // Atualiza refs quando props mudam
  useEffect(() => {
    devicesRef.current = devices
    onDeviceInactiveRef.current = onDeviceInactive
  }, [devices, onDeviceInactive])

  // Verificar periodicamente se há dispositivos inativos
  useEffect(() => {
    console.log('🔔 [HEARTBEAT] useEffect executado! user?.id =', user?.id)

    if (!user?.id) {
      console.log('⚠️ [HEARTBEAT] user?.id é null/undefined, retornando...')
      return
    }

    console.log('✅ [HEARTBEAT] user?.id válido, configurando timers...')

    const checkInactiveDevices = async () => {
      const now = Date.now()
      const onlineDevices = devicesRef.current.filter(d => d.status === 'online')

      console.log(`🔍 [HEARTBEAT] Verificando ${onlineDevices.length} dispositivos online...`)
      console.log(`🔍 [HEARTBEAT] Dados completos:`, JSON.stringify(devicesRef.current.map(d => ({ id: d.id, name: d.name, status: d.status, last_seen: d.last_seen })), null, 2))

      for (const device of onlineDevices) {
        const lastSeenTime = device.last_seen ? new Date(device.last_seen).getTime() : 0
        const timeSinceLastSeen = now - lastSeenTime

        console.log(`📱 ${device.name}: last_seen há ${Math.round(timeSinceLastSeen / 1000)}s (limite: ${OFFLINE_THRESHOLD_MS / 1000}s)`)

        if (timeSinceLastSeen > OFFLINE_THRESHOLD_MS) {
          console.warn(`⚠️ Dispositivo ${device.id} inativo! last_seen há ${Math.round(timeSinceLastSeen / 1000)}s`)
          onDeviceInactiveRef.current(device.id)
        }
      }
    }

    // Verificação inicial após 10 segundos
    const initialTimeout = setTimeout(() => {
      console.log('🚀 Iniciando verificação periódica de dispositivos inativos...')
      checkInactiveDevices()
    }, 10000)

    // Verificação periódica
    checkIntervalRef.current = setInterval(() => {
      checkInactiveDevices()
    }, CHECK_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimeout)
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [user?.id]) // REMOVIDO onDeviceInactive das dependências!

  return {
    // Mantém a mesma assinatura para compatibilidade, mas agora não faz nada
    sendPing: () => { }
  }
}
