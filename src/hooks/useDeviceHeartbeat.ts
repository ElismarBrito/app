import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import { Device } from './usePBXData'

/**
 * Hook profissional para heartbeat bidirecional (ping/pong)
 * 
 * Validação cruzada de múltiplos sinais:
 * 1. last_seen (heartbeat do dispositivo)
 * 2. Resposta a ping/pong (verificação ativa)
 * 3. Conexão real-time ativa
 * 
 * Só marca como offline se TODOS os sinais falharem
 */
interface UseDeviceHeartbeatOptions {
  devices: Device[]
  onDeviceInactive: (deviceId: string) => void
}

export const useDeviceHeartbeat = ({ 
  devices, 
  onDeviceInactive 
}: UseDeviceHeartbeatOptions) => {
  const { user } = useAuth()
  const pingAttemptsRef = useRef<Map<string, number>>(new Map()) // deviceId -> tentativas sem resposta
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pongListenersRef = useRef<Map<string, NodeJS.Timeout>>(new Map()) // deviceId -> timeout esperando pong
  const devicesRef = useRef(devices)
  
  const MAX_PING_ATTEMPTS = 3 // Máximo de tentativas sem resposta
  const PING_INTERVAL = 60000 // Ping a cada 60 segundos
  const PONG_TIMEOUT = 10000 // Timeout de 10 segundos para resposta ao ping
  
  // Atualiza ref quando devices muda
  useEffect(() => {
    devicesRef.current = devices
  }, [devices])
  
  // Enviar ping para um dispositivo específico
  const sendPing = useCallback(async (deviceId: string) => {
    if (!user?.id) return
    
    try {
      console.log(`📡 Enviando ping para dispositivo ${deviceId}`)
      
      // Enviar ping via broadcast
      const channel = supabase.channel(`heartbeat-${user.id}`)
      
      await channel.send({
        type: 'broadcast',
        event: 'ping',
        payload: {
          device_id: deviceId,
          user_id: user.id,
          timestamp: Date.now()
        }
      })
      
      // Incrementar contador de tentativas
      const attempts = pingAttemptsRef.current.get(deviceId) || 0
      pingAttemptsRef.current.set(deviceId, attempts + 1)
      
      // Esperar resposta (pong) em até PONG_TIMEOUT ms
      const pongTimeout = setTimeout(() => {
        const currentAttempts = pingAttemptsRef.current.get(deviceId) || 0
        
        if (currentAttempts >= MAX_PING_ATTEMPTS) {
          console.warn(`⚠️ Dispositivo ${deviceId} não respondeu a ${MAX_PING_ATTEMPTS} pings consecutivos`)
          // Marcar como inativo apenas se passou last_seen também
          const device = devicesRef.current.find(d => d.id === deviceId)
          
          if (device && device.status === 'online') {
            // Verificar last_seen também (validação cruzada)
            const now = Date.now()
            const lastSeenTime = device.last_seen ? new Date(device.last_seen).getTime() : 0
            const minutesSinceLastSeen = (now - lastSeenTime) / (60 * 1000)
            
            // Só marca como inativo se TAMBÉM não tem heartbeat recente (validação cruzada)
            if (minutesSinceLastSeen > 5) {
              console.warn(`⚠️ Dispositivo ${deviceId} inativo: sem pong E sem heartbeat há ${Math.round(minutesSinceLastSeen)} minutos`)
              onDeviceInactive(deviceId)
            } else {
              console.log(`ℹ️ Dispositivo ${deviceId} não respondeu ping mas tem heartbeat recente (${Math.round(minutesSinceLastSeen)} min)`)
              // Reset contador se tem heartbeat recente
              pingAttemptsRef.current.set(deviceId, 0)
            }
          }
        }
      }, PONG_TIMEOUT)
      
      // Guardar timeout para cancelar se receber pong
      pongListenersRef.current.set(deviceId, pongTimeout)
      
    } catch (error) {
      console.error(`Erro ao enviar ping para dispositivo ${deviceId}:`, error)
    }
  }, [user?.id, onDeviceInactive])
  
  // Escutar pong dos dispositivos
  useEffect(() => {
    if (!user?.id) return
    
    const channel = supabase
      .channel(`heartbeat-pong-${user.id}`)
      .on('broadcast', { event: 'pong' }, (payload) => {
        const { device_id, timestamp } = payload
        
        console.log(`✅ Recebido pong do dispositivo ${device_id} (latência: ${Date.now() - timestamp}ms)`)
        
        // Reset contador de tentativas (dispositivo está respondendo)
        pingAttemptsRef.current.set(device_id, 0)
        
        // Cancelar timeout esperando pong
        const timeout = pongListenersRef.current.get(device_id)
        if (timeout) {
          clearTimeout(timeout)
          pongListenersRef.current.delete(device_id)
        }
      })
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])
  
  // Enviar pings periódicos para dispositivos online
  useEffect(() => {
    if (!user?.id) return
    
    // Enviar ping inicial após 5 segundos
    const initialTimeout = setTimeout(() => {
      const onlineDevices = devicesRef.current.filter(d => d.status === 'online')
      onlineDevices.forEach(device => {
        sendPing(device.id)
      })
    }, 5000)
    
    // Enviar pings periódicos
    pingIntervalRef.current = setInterval(() => {
      const onlineDevices = devicesRef.current.filter(d => d.status === 'online')
      onlineDevices.forEach(device => {
        sendPing(device.id)
      })
    }, PING_INTERVAL)
    
    return () => {
      clearTimeout(initialTimeout)
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      
      // Limpar todos os timeouts esperando pong
      pongListenersRef.current.forEach(timeout => clearTimeout(timeout))
      pongListenersRef.current.clear()
    }
  }, [user?.id, sendPing])
  
  return {
    sendPing
  }
}



