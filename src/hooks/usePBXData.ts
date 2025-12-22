
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
      // CORREÇÃO: Remover filtro .neq() da query e fazer filtro no cliente
      // Isso evita problemas se o dispositivo for criado com status NULL ou diferente
      const { data, error } = await supabase
        .from('devices' as any)
        .select('id, name, status, paired_at, last_seen, user_id, internet_status, signal_status, line_blocked, active_calls_count')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Erro ao buscar dispositivos:', error);
        throw error;
      }
      const devicesList = (data as unknown as Device[]) || []
      console.log(`📱 fetchDevices() encontrou ${devicesList.length} dispositivo(s) no banco (antes do filtro)`)

      // Log detalhado de cada dispositivo encontrado
      const now = Date.now();
      devicesList.forEach((device, index) => {
        const lastSeenTime = device.last_seen ? new Date(device.last_seen).getTime() : 0;
        const diff = device.last_seen ? Math.round((now - lastSeenTime) / 1000) : 'N/A';
        // console.log(`  [${index + 1}] ${device.name} (${device.id}) - Status: ${device.status}, LastSeen: ${device.last_seen}, Diff: ${diff}s`)
      })

      // CORREÇÃO: Filtrar dispositivos 'unpaired' mas incluir dispositivos pareados recentemente
      // Mesmo se status for 'unpaired', incluir se foi pareado nos últimos 10 minutos (pode ser problema de sincronização)
      const tenMinutesAgo = now - (10 * 60 * 1000);

      let filteredDevices = devicesList.filter(device => {
        // Se status é 'unpaired', verificar se foi pareado recentemente
        if (device.status === 'unpaired') {
          // Se foi pareado nos últimos 10 minutos, incluir mesmo com status 'unpaired' (problema de sincronização)
          if (device.paired_at) {
            const pairedAtTime = new Date(device.paired_at).getTime();
            const timeSincePaired = now - pairedAtTime;
            // Se foi pareado há menos de 10 minutos, incluir mesmo com status 'unpaired'
            if (timeSincePaired < (10 * 60 * 1000)) {
              console.log(`⚠️ Dispositivo ${device.name} tem status 'unpaired' mas foi pareado recentemente (${Math.floor(timeSincePaired / 1000)}s atrás), incluindo na lista`);
              return true; // Incluir mesmo com status 'unpaired' se foi pareado recentemente
            }
          }
          return false; // Excluir dispositivos 'unpaired' antigos
        }
        // Se não tem status ou status é null/undefined, incluir (pode ser dispositivo recém-criado)
        if (!device.status || device.status === null || device.status === undefined) {
          return true;
        }
        // Incluir todos os outros status (online, offline)
        return true;
      });

      // Ordenar por paired_at mais recente primeiro (dispositivos pareados recentemente aparecem primeiro)
      filteredDevices.sort((a, b) => {
        const aPaired = a.paired_at ? new Date(a.paired_at).getTime() : 0;
        const bPaired = b.paired_at ? new Date(b.paired_at).getTime() : 0;
        return bPaired - aPaired; // Mais recente primeiro
      });

      console.log(`📱 fetchDevices() após filtro unpaired: ${filteredDevices.length} dispositivo(s)`)

      // Log detalhado dos dispositivos filtrados
      filteredDevices.forEach((device, index) => {
        console.log(`  ✅ [${index + 1}] ${device.name} (${device.id}) - Status: ${device.status || 'null'}, Pareado: ${device.paired_at || 'N/A'}`)
      })

      // CORREÇÃO: Verificar dispositivos 'online' com last_seen antigo (> 2 minutos) e marcar como offline
      // Ajustado para 2 minutos para teste (HeartbeatForegroundService roda a cada 30s)
      const TIMEOUT_MS = 2 * 60 * 1000
      const GRACE_PERIOD_MS = 2 * 60 * 1000 // Grace period inicial para dispositivos recém-pareados

      const inactiveOnlineDevices = filteredDevices.filter(device => {
        if (device.status !== 'online') return false

        // Se foi pareado recentemente, não marcar como offline
        if (device.paired_at) {
          const timeSincePaired = now - new Date(device.paired_at).getTime()
          if (timeSincePaired < GRACE_PERIOD_MS) {
            console.log(`⏳ Dispositivo ${device.name} pareado recentemente (${Math.round(timeSincePaired / 1000)}s atrás), mantendo online`);
            return false
          }
        }

        if (!device.last_seen) {
          const timeSincePaired = device.paired_at ? now - new Date(device.paired_at).getTime() : Infinity
          return timeSincePaired > GRACE_PERIOD_MS
        }

        const timeSinceLastSeen = now - new Date(device.last_seen).getTime()
        console.log(`📊 Device ${device.name}: last_seen=${device.last_seen}, diff=${Math.round(timeSinceLastSeen / 1000)}s, threshold=${TIMEOUT_MS / 1000}s`)
        return timeSinceLastSeen > TIMEOUT_MS // Mais de 2 minutos sem heartbeat
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

  // Fetch calls - Limite fixo para evitar loops infinitos de dependência
  // 100 é suficiente: 12 dispositivos × 6 chamadas = 72 máximo
  const fetchCalls = useCallback(async () => {
    if (!user) return

    try {
      // Busca chamadas das últimas 24 horas
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('calls' as any)
        .select('id, number, status, start_time, duration, user_id, device_id, hidden')
        .eq('user_id', user.id)
        .gte('start_time', oneDayAgo) // Últimas 24h
        .order('start_time', { ascending: false })
        .limit(100) // Suficiente para 12 dispositivos × 6 chamadas + margem

      if (error) throw error
      setCalls((data as unknown as Call[]) || [])
    } catch (error: any) {
      console.log('Calls table not ready yet, using empty array')
      setCalls([])
    }
  }, [user]) // Removido devices das dependências para evitar loop infinito

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

  // OTIMIZAÇÃO: Adicionar múltiplas chamadas em lote (batch insert)
  // Muito mais rápido que addCall em loop para campanhas com 100+ números
  const addCallsBatch = async (calls: Array<{ number: string; deviceId: string }>) => {
    if (!user) return { inserted: 0, errors: 0 }

    const now = new Date().toISOString()
    const callRecords = calls.map(call => ({
      number: call.number,
      status: 'ringing',
      start_time: now,
      user_id: user.id,
      device_id: call.deviceId
    }))

    // Dividir em chunks de 500 para evitar limites do Supabase
    const CHUNK_SIZE = 500
    let totalInserted = 0
    let totalErrors = 0

    console.log(`📤 Inserindo ${callRecords.length} chamadas em lote...`)

    for (let i = 0; i < callRecords.length; i += CHUNK_SIZE) {
      const chunk = callRecords.slice(i, i + CHUNK_SIZE)

      try {
        const { data, error } = await supabase
          .from('calls' as any)
          .insert(chunk)
          .select()

        if (error) {
          console.error(`❌ Erro na inserção em lote:`, error.message)
          totalErrors += chunk.length
        } else {
          totalInserted += data?.length || 0
          console.log(`✅ Chunk ${Math.floor(i / CHUNK_SIZE) + 1} inserido: ${data?.length || 0} chamadas`)
        }
      } catch (err: any) {
        console.error(`❌ Erro no chunk:`, err?.message)
        totalErrors += chunk.length
      }
    }

    console.log(`📊 Resultado: ${totalInserted} inseridos, ${totalErrors} erros`)

    await fetchCalls()
    return { inserted: totalInserted, errors: totalErrors }
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
        (payload: any) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          const newStatus = newRecord?.status;
          const oldStatus = oldRecord?.status;
          const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'
          console.log('📱 Subscription detectou mudança em devices:', {
            eventType,
            deviceId: newRecord?.id,
            oldStatus,
            newStatus,
            deviceName: newRecord?.name
          });

          // Se dispositivo foi marcado como 'unpaired', remover imediatamente da lista local
          if (newStatus === 'unpaired') {
            console.log('🗑️ Dispositivo marcado como unpaired, removendo da lista local');
            setDevices(prev => prev.filter(d => d.id !== newRecord?.id));
            return; // Não precisa recarregar se foi despareado
          }

          // CORREÇÃO: Se é um INSERT ou UPDATE para 'online', recarregar imediatamente
          // Isso garante que dispositivos recém-pareados apareçam no dashboard
          if (eventType === 'INSERT' || (eventType === 'UPDATE' && newStatus === 'online')) {
            console.log('✅ Novo dispositivo pareado ou status atualizado para online, recarregando lista IMEDIATAMENTE...');
            // Não usar debounce para novos dispositivos - atualizar imediatamente
            // Forçar múltiplas tentativas para garantir que aparece
            fetchDevicesRef.current();
            // Refetch adicional após 500ms para garantir (caso haja delay no banco)
            setTimeout(() => {
              console.log('🔄 Refetch adicional após pareamento...');
              fetchDevicesRef.current();
            }, 500);
          } else {
            // Para outras mudanças, usar debounce
            debouncedFetchDevices();
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status devices:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscription de devices ativa - mudanças serão detectadas em tempo real');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Erro na subscription de devices - usando apenas polling como fallback');
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Subscription de devices expirou - usando apenas polling como fallback');
        } else if (status === 'CLOSED') {
          console.warn('🔒 Subscription de devices fechada - usando apenas polling como fallback');
        }
      })

    const callsSubscription = supabase
      .channel(`calls_channel_${user.id}`) // Canais únicos por usuário
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'calls', filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          console.log('📞 Subscription detectou mudança em calls:', {
            eventType: payload.eventType,
            callId: payload.new?.id || payload.old?.id,
            status: payload.new?.status,
            number: payload.new?.number
          });
          // CORREÇÃO: Buscar imediatamente (sem debounce) para updates de status
          if (payload.eventType === 'UPDATE') {
            fetchCallsRef.current();
          } else {
            debouncedFetchCalls();
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status calls:', status);
      })

    const listsSubscription = supabase
      .channel(`lists_channel_${user.id}`) // Canais únicos por usuário
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'number_lists', filter: `user_id=eq.${user.id}` },
        () => debouncedFetchLists()
      )
      .subscribe()

    // CORREÇÃO: Polling periódico para dispositivos E chamadas
    // Devices: 3 segundos, Calls: 5 segundos
    const devicesPollingInterval = setInterval(() => {
      fetchDevicesRef.current();
    }, 3000);

    const callsPollingInterval = setInterval(() => {
      console.log('🔄 Polling periódico: verificando chamadas...');
      fetchCallsRef.current();
    }, 5000); // 5 segundos para chamadas

    return () => {
      clearInterval(devicesPollingInterval);
      clearInterval(callsPollingInterval);
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

  // Delete call function - CORREÇÃO: Removido filtro user_id, RLS do Supabase cuida da segurança
  const deleteCall = async (callId: string) => {
    try {
      const { error } = await supabase
        .from('calls' as any)
        .delete()
        .eq('id', callId);

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

  // Delete all calls (ended + orphans + queued + ringing) - exclusão em massa completa do histórico
  const deleteAllEndedCalls = async () => {
    if (!user) return;

    try {
      // Primeiro, contar quantas chamadas serão deletadas
      const { count, error: countError } = await supabase
        .from('calls' as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const totalToDelete = count || 0;

      // Delete TODAS as chamadas do usuário (não apenas ended)
      const { error } = await supabase
        .from('calls' as any)
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Histórico limpo!",
        description: `${totalToDelete} chamada(s) foram removidas permanentemente`
      });

      await fetchCalls();
    } catch (error: any) {
      toast({
        title: "Erro ao limpar histórico",
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
    addCallsBatch, // NOVO: Inserção em lote para campanhas
    updateCallStatus,
    deleteCall,
    deleteAllEndedCalls, // Nova função para limpar histórico
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
