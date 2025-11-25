
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/use-toast'

export interface Device {
  id: string
  name: string
  status: 'online' | 'offline' | 'unpaired'
  paired_at: string
  last_seen: string | null
  user_id: string
  internet_status?: string
  signal_status?: string
  line_blocked?: boolean
  active_calls_count?: number
}

export interface Call {
  id: string
  number: string
  status: 'ringing' | 'answered' | 'ended'
  start_time: string
  duration: number | null
  user_id: string
  device_id: string | null
  hidden?: boolean
}

export interface NumberList {
  id: string
  name: string
  numbers: string[]
  is_active: boolean
  user_id: string
  created_at: string
  ddi_prefix?: string | null
}

export interface PBXStats {
  devicesConnected: number
  callsToday: number
  activeLists: number
  serverStatus: 'online' | 'offline'
}

export const usePBXData = () => {
  const { user } = useAuth()
  const [devices, setDevices] = useState<Device[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [lists, setLists] = useState<NumberList[]>([])
  const [stats, setStats] = useState<PBXStats>({
    devicesConnected: 0,
    callsToday: 0,
    activeLists: 0,
    serverStatus: 'online'
  })
  const [loading, setLoading] = useState(true)

  // Fetch devices - otimizado com select específico
  // ✅ CORREÇÃO: Filtra dispositivos 'unpaired' - não mostra dispositivos despareados
  const fetchDevices = useCallback(async () => {
    if (!user) return

    try {
      // Usa índice composto idx_devices_user_status quando filtra por status
      const { data, error } = await supabase
        .from('devices' as any)
        .select('id, name, status, paired_at, last_seen, user_id, internet_status, signal_status, line_blocked, active_calls_count')
        .eq('user_id', user.id)
        .neq('status', 'unpaired') // ✅ Não busca dispositivos despareados
        .order('created_at', { ascending: false })

      if (error) throw error
      const devicesList = (data as unknown as Device[]) || []
      
      // CORREÇÃO: Filtro adicional de segurança para garantir que 'unpaired' nunca entre na lista
      let filteredDevices = devicesList.filter(device => device.status !== 'unpaired')
      
      // CORREÇÃO: Verificar dispositivos 'online' com last_seen antigo (> 5 minutos) e marcar como offline imediatamente
      const now = Date.now()
      const fiveMinutesAgo = now - (5 * 60 * 1000)
      
      const inactiveOnlineDevices = filteredDevices.filter(device => {
        if (device.status !== 'online') return false
        if (!device.last_seen) return true // Sem last_seen = inativo
        
        const lastSeenTime = new Date(device.last_seen).getTime()
        return (now - lastSeenTime) > fiveMinutesAgo // Mais de 5 minutos sem heartbeat
      })
      
      // Marcar dispositivos inativos como offline no banco
      if (inactiveOnlineDevices.length > 0) {
        console.log(`⚠️ fetchDevices() detectou ${inactiveOnlineDevices.length} dispositivo(s) 'online' inativo(s) (last_seen > 5 minutos)`)
        inactiveOnlineDevices.forEach(async (device) => {
          try {
            await supabase
              .from('devices' as any)
              .update({ 
                status: 'offline',
                updated_at: new Date().toISOString()
              })
              .eq('id', device.id)
              .eq('user_id', user.id)
            console.log(`📱 Dispositivo ${device.name} (${device.id}) marcado como offline (inativo)`)
          } catch (error) {
            console.error(`Erro ao marcar dispositivo ${device.id} como offline:`, error)
          }
        })
        
        // Remover da lista local imediatamente
        filteredDevices = filteredDevices.map(device => {
          if (inactiveOnlineDevices.find(d => d.id === device.id)) {
            return { ...device, status: 'offline' as const }
          }
          return device
        })
      }
      
      // Log detalhado para debug
      if (devicesList.length !== filteredDevices.length) {
        const unpairedCount = devicesList.length - filteredDevices.length
        console.warn(`⚠️ fetchDevices() encontrou ${unpairedCount} dispositivo(s) 'unpaired' que foram filtrados`)
      }
      
      console.log('📱 fetchDevices() retornou', filteredDevices.length, 'dispositivos (filtrados, sem unpaired e inativos corrigidos)')
      setDevices(filteredDevices)
    } catch (error: any) {
      console.log('Devices table not ready yet, using empty array')
      setDevices([])
    }
  }, [user])

  // Fetch online devices - OTIMIZADO: usa índice composto idx_devices_user_status
  const fetchOnlineDevices = useCallback(async (): Promise<Device[]> => {
    if (!user) return []

    try {
      // Usa índice composto idx_calls_user_status para queries com filtro de status
      const { data, error } = await supabase
        .from('devices' as any)
        .select('id, name, status, paired_at, last_seen, user_id, internet_status, signal_status, line_blocked, active_calls_count')
        .eq('user_id', user.id)
        .eq('status', 'online') // ✅ Filtra no banco - usa idx_devices_user_status
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as unknown as Device[]) || []
    } catch (error: any) {
      console.log('Error fetching online devices:', error)
      return []
    }
  }, [user])

  // Fetch calls - otimizado para buscar apenas chamadas recentes
  const fetchCalls = useCallback(async () => {
    if (!user) return

    try {
      // Busca apenas chamadas das últimas 24 horas para melhor performance
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      
      const { data, error } = await supabase
        .from('calls' as any)
        .select('id, number, status, start_time, duration, user_id, device_id, hidden')
        .eq('user_id', user.id)
        .gte('start_time', oneDayAgo) // Apenas últimas 24h
        .order('start_time', { ascending: false })
        .limit(100) // Aumentado para 100 mas com filtro de data

      if (error) throw error
      setCalls((data as unknown as Call[]) || [])
    } catch (error: any) {
      console.log('Calls table not ready yet, using empty array')
      setCalls([])
    }
  }, [user])

  // Fetch active calls - OTIMIZADO: usa índice composto idx_calls_user_status
  const fetchActiveCalls = useCallback(async (): Promise<Call[]> => {
    if (!user) return []

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      
      const { data, error } = await supabase
        .from('calls' as any)
        .select('id, number, status, start_time, duration, user_id, device_id, hidden')
        .eq('user_id', user.id)
        .in('status', ['ringing', 'answered', 'dialing', 'queued']) // ✅ Filtra no banco - usa idx_calls_user_status
        .gte('start_time', oneDayAgo)
        .order('start_time', { ascending: false })
        .limit(100)

      if (error) throw error
      return (data as unknown as Call[]) || []
    } catch (error: any) {
      console.log('Error fetching active calls:', error)
      return []
    }
  }, [user])
  
  // Fetch number lists - otimizado com select específico
  const fetchLists = useCallback(async () => {
    if (!user) return

    try {
      // Usa índice composto idx_number_lists_user_active quando filtra por is_active
      const { data, error } = await supabase
        .from('number_lists' as any)
        .select('id, name, numbers, is_active, user_id, created_at, ddi_prefix')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setLists((data as unknown as NumberList[]) || [])
    } catch (error: any) {
      console.log('Number lists table not ready yet, using empty array')
      setLists([])
    }
  }, [user])

  // Fetch active lists - OTIMIZADO: usa índice composto idx_number_lists_user_active
  const fetchActiveLists = useCallback(async (): Promise<NumberList[]> => {
    if (!user) return []

    try {
      const { data, error } = await supabase
        .from('number_lists' as any)
        .select('id, name, numbers, is_active, user_id, created_at, ddi_prefix')
        .eq('user_id', user.id)
        .eq('is_active', true) // ✅ Filtra no banco - usa idx_number_lists_user_active
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as unknown as NumberList[]) || []
    } catch (error: any) {
      console.log('Error fetching active lists:', error)
      return []
    }
  }, [user])
  
  // Calculate stats (memoized para evitar recalculações desnecessárias)
  // OTIMIZADO: Usa dados já filtrados para evitar filtros no cliente
  const calculateStats = useCallback(() => {
    // Usa active_calls_count do trigger em vez de filtrar manualmente
    const devicesConnected = devices.filter(d => d.status === 'online').length
    const today = new Date().toISOString().split('T')[0]
    const callsToday = calls.filter(c => c.start_time.startsWith(today)).length
    const activeLists = lists.filter(l => l.is_active).length

    setStats({
      devicesConnected,
      callsToday,
      activeLists,
      serverStatus: 'online'
    })
  }, [devices, calls, lists])

  // Add device
  const addDevice = async (name: string) => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('devices' as any)
        .insert([{
          name,
          status: 'online',
          paired_at: new Date().toISOString(),
          user_id: user.id
        }])
        .select()
        .single()

      if (error) throw error

      toast({
        title: "Dispositivo adicionado",
        description: `${name} foi pareado com sucesso`
      })

      await fetchDevices()
      return data
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar dispositivo",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Update device status
  const updateDeviceStatus = async (deviceId: string, updates: Partial<Device>) => {
    try {
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('devices' as any)
        .update(updateData)
        .eq('id', deviceId)

      if (error) throw error
      await fetchDevices()
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar dispositivo",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Remove device
  const removeDevice = async (deviceId: string) => {
    try {
      const { error } = await supabase
        .from('devices' as any)
        .delete()
        .eq('id', deviceId)

      if (error) throw error

      toast({
        title: "Dispositivo removido",
        description: "Dispositivo foi desemparelhado"
      })

      await fetchDevices()
    } catch (error: any) {
      toast({
        title: "Erro ao remover dispositivo",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Add call with device synchronization
  const addCall = async (number: string, deviceId?: string) => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('calls' as any)
        .insert([{
          number,
          status: 'ringing',
          start_time: new Date().toISOString(),
          user_id: user.id,
          device_id: deviceId || null
        }])
        .select()
        .single()

      if (error) throw error
      
      // If device_id provided, notify device about the call
      if (deviceId && data) {
        console.log(`Call ${(data as any).id} registered for device ${deviceId}`);
      }
      
      await fetchCalls()
      return data
    } catch (error: any) {
      toast({
        title: "Erro ao registrar chamada",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Update call status with duration tracking and soft delete
  const updateCallStatus = async (callId: string, status?: 'answered' | 'ended', duration?: number, updates?: { hidden?: boolean }) => {
    try {
      const updateData: any = {}
      
      if (status) updateData.status = status
      if (duration !== undefined) updateData.duration = duration  
      if (updates?.hidden !== undefined) updateData.hidden = updates.hidden
      
      updateData.updated_at = new Date().toISOString()

      const { error } = await supabase
        .from('calls' as any)
        .update(updateData)
        .eq('id', callId)

      if (error) throw error
      
      console.log(`Call ${callId} updated:`, updateData);
      await fetchCalls()
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar chamada",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Add number list
  const addNumberList = async (name: string, numbers: string[], ddiPrefix?: string) => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('number_lists' as any)
        .insert([{
          name,
          numbers,
          is_active: true,
          user_id: user.id,
          ddi_prefix: ddiPrefix || null
        }])
        .select()
        .single()

      if (error) throw error

      toast({
        title: "Lista criada",
        description: `Lista "${name}" foi criada com sucesso`
      })

      await fetchLists()
      return data
    } catch (error: any) {
      toast({
        title: "Erro ao criar lista",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Toggle list status
  const toggleListStatus = async (listId: string) => {
    const list = lists.find(l => l.id === listId)
    if (!list) return

    try {
      const { error } = await supabase
        .from('number_lists' as any)
        .update({ is_active: !list.is_active })
        .eq('id', listId)

      if (error) throw error
      await fetchLists()
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar lista",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Update number list
  const updateNumberList = async (listId: string, name: string, numbers: string[], ddiPrefix?: string) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('number_lists' as any)
        .update({
          name,
          numbers,
          ddi_prefix: ddiPrefix || null
        })
        .eq('id', listId)

      if (error) throw error

      toast({
        title: "Lista atualizada",
        description: `Lista "${name}" foi atualizada com sucesso`
      })

      await fetchLists()
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar lista",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Delete number list (only inactive lists)
  const deleteNumberList = async (listId: string) => {
    const list = lists.find(l => l.id === listId)
    if (!list) return

    // Prevent deletion of active lists
    if (list.is_active) {
      toast({
        title: "Erro ao excluir lista",
        description: "Listas ativas não podem ser excluídas. Desative a lista primeiro.",
        variant: "destructive"
      })
      return
    }

    try {
      const { error } = await supabase
        .from('number_lists' as any)
        .delete()
        .eq('id', listId)

      if (error) throw error

      toast({
        title: "Lista excluída",
        description: `Lista "${list.name}" foi excluída com sucesso`
      })

      await fetchLists()
    } catch (error: any) {
      toast({
        title: "Erro ao excluir lista",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  // Real-time subscriptions com debounce para melhor performance
  // CORREÇÃO: Usa useRef para evitar recriações desnecessárias de subscriptions
  const fetchDevicesRef = useRef(fetchDevices)
  const fetchCallsRef = useRef(fetchCalls)
  const fetchListsRef = useRef(fetchLists)
  
  // Atualiza refs quando as funções mudam
  useEffect(() => {
    fetchDevicesRef.current = fetchDevices
    fetchCallsRef.current = fetchCalls
    fetchListsRef.current = fetchLists
  }, [fetchDevices, fetchCalls, fetchLists])

  useEffect(() => {
    if (!user?.id) return

    // Debounce helper para evitar múltiplas chamadas rápidas
    const debounce = <T extends (...args: any[]) => void>(func: T, wait: number) => {
      let timeout: NodeJS.Timeout | null = null
      return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() => func(...args), wait)
      }
    }

    // Debounced fetchers usando refs para evitar recriações
    const debouncedFetchDevices = debounce(() => fetchDevicesRef.current(), 300)
    const debouncedFetchCalls = debounce(() => fetchCallsRef.current(), 300)
    const debouncedFetchLists = debounce(() => fetchListsRef.current(), 500) // Lists mudam menos frequentemente

    const devicesSubscription = supabase
      .channel(`devices_channel_${user.id}`) // Canais únicos por usuário para evitar conflitos
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newStatus = payload.new?.status;
          const oldStatus = payload.old?.status;
          const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'
          console.log('📱 Subscription detectou mudança em devices:', { 
            eventType,
            deviceId: payload.new?.id, 
            oldStatus, 
            newStatus,
            deviceName: payload.new?.name
          });
          
          // Se dispositivo foi marcado como 'unpaired', remover imediatamente da lista local
          if (newStatus === 'unpaired') {
            console.log('🗑️ Dispositivo marcado como unpaired, removendo da lista local');
            setDevices(prev => prev.filter(d => d.id !== payload.new?.id));
            return; // Não precisa recarregar se foi despareado
          }
          
          // CORREÇÃO: Se é um INSERT ou UPDATE para 'online', recarregar imediatamente
          // Isso garante que dispositivos recém-pareados apareçam no dashboard
          if (eventType === 'INSERT' || (eventType === 'UPDATE' && newStatus === 'online')) {
            console.log('✅ Novo dispositivo pareado ou status atualizado para online, recarregando lista...');
            // Não usar debounce para novos dispositivos - atualizar imediatamente
            fetchDevicesRef.current();
          } else {
            // Para outras mudanças, usar debounce
            debouncedFetchDevices();
          }
        }
      )
      .subscribe()

    const callsSubscription = supabase
      .channel(`calls_channel_${user.id}`) // Canais únicos por usuário
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'calls', filter: `user_id=eq.${user.id}` },
        () => debouncedFetchCalls()
      )
      .subscribe()

    const listsSubscription = supabase
      .channel(`lists_channel_${user.id}`) // Canais únicos por usuário
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'number_lists', filter: `user_id=eq.${user.id}` },
        () => debouncedFetchLists()
      )
      .subscribe()

    return () => {
      devicesSubscription.unsubscribe()
      callsSubscription.unsubscribe()
      listsSubscription.unsubscribe()
      // Limpar canais completamente
      supabase.removeChannel(devicesSubscription)
      supabase.removeChannel(callsSubscription)
      supabase.removeChannel(listsSubscription)
    }
  }, [user?.id]) // Apenas user.id como dependência para evitar recriações desnecessárias

  // Initial data load - apenas uma vez quando user muda
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    if (!user || hasLoadedRef.current) return

    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchDevices(),
        fetchCalls(), 
        fetchLists()
      ])
      setLoading(false)
      hasLoadedRef.current = true
    }

    loadData()
    
    // Reset flag quando user muda
    return () => {
      hasLoadedRef.current = false
    }
  }, [user?.id, fetchDevices, fetchCalls, fetchLists])

  // Update stats when data changes - usa useMemo para evitar loops
  useEffect(() => {
    calculateStats()
  }, [devices.length, calls.length, lists.length]) // Usa apenas tamanhos para evitar recriações constantes

  // Delete call function
  const deleteCall = async (callId: string) => {
    try {
      const { error } = await supabase
        .from('calls' as any)
        .delete()
        .eq('id', callId)
        .eq('user_id', user?.id);

      if (error) throw error

      toast({
        title: "Chamada excluída",
        description: "A chamada foi removida permanentemente"
      });

      await fetchCalls();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir chamada", 
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return {
    devices,
    calls,
    lists,
    stats,
    loading,
    addDevice,
    updateDeviceStatus,
    removeDevice,
    addCall,
    updateCallStatus,
    deleteCall,
    addNumberList,
    updateNumberList,
    toggleListStatus,
    deleteNumberList,
    // Funções otimizadas que usam índices compostos
    fetchOnlineDevices,
    fetchActiveCalls,
    fetchActiveLists,
    refetch: async () => {
      await Promise.all([fetchDevices(), fetchCalls(), fetchLists()])
    }
  }
}
