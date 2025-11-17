
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/use-toast'

export interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
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

  // Fetch devices
  const fetchDevices = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('devices' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setDevices((data as unknown as Device[]) || [])
    } catch (error: any) {
      console.log('Devices table not ready yet, using empty array')
      setDevices([])
    }
  }

  // Fetch calls
  const fetchCalls = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('calls' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: false })
        .limit(50)

      if (error) throw error
      setCalls((data as unknown as Call[]) || [])
    } catch (error: any) {
      console.log('Calls table not ready yet, using empty array')
      setCalls([])
    }
  }

  // Fetch number lists
  const fetchLists = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('number_lists' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setLists((data as unknown as NumberList[]) || [])
    } catch (error: any) {
      console.log('Number lists table not ready yet, using empty array')
      setLists([])
    }
  }

  // Calculate stats
  const calculateStats = () => {
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
  }

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

  // Real-time subscriptions with optimistic updates
  useEffect(() => {
    if (!user) return

    const devicesSubscription = supabase
      .channel('devices_channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${user.id}` },
        (payload) => {
          // Optimistic update: atualiza estado localmente em vez de refetch completo
          if (payload.eventType === 'UPDATE' && payload.new) {
            setDevices(prev => prev.map(d => 
              d.id === payload.new.id ? { ...d, ...payload.new } : d
            ));
          } else if (payload.eventType === 'INSERT' && payload.new) {
            setDevices(prev => [...prev, payload.new as Device]);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setDevices(prev => prev.filter(d => d.id !== payload.old.id));
          } else {
            // Fallback: refetch completo para outros eventos
            fetchDevices();
          }
        }
      )
      .subscribe()

    const callsSubscription = supabase
      .channel('calls_channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'calls', filter: `user_id=eq.${user.id}` },
        (payload) => {
          // Optimistic update: atualiza estado localmente
          if (payload.eventType === 'UPDATE' && payload.new) {
            setCalls(prev => prev.map(c => 
              c.id === payload.new.id ? { ...c, ...payload.new } : c
            ));
          } else if (payload.eventType === 'INSERT' && payload.new) {
            setCalls(prev => [payload.new as Call, ...prev]);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setCalls(prev => prev.filter(c => c.id !== payload.old.id));
          } else {
            fetchCalls();
          }
        }
      )
      .subscribe()

    const listsSubscription = supabase
      .channel('lists_channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'number_lists', filter: `user_id=eq.${user.id}` },
        (payload) => {
          // Optimistic update: atualiza estado localmente
          if (payload.eventType === 'UPDATE' && payload.new) {
            setLists(prev => prev.map(l => 
              l.id === payload.new.id ? { ...l, ...payload.new } : l
            ));
          } else if (payload.eventType === 'INSERT' && payload.new) {
            setLists(prev => [...prev, payload.new as NumberList]);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setLists(prev => prev.filter(l => l.id !== payload.old.id));
          } else {
            fetchLists();
          }
        }
      )
      .subscribe()

    return () => {
      devicesSubscription.unsubscribe()
      callsSubscription.unsubscribe()
      listsSubscription.unsubscribe()
    }
  }, [user])

  // Initial data load
  useEffect(() => {
    if (!user) return

    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchDevices(),
        fetchCalls(), 
        fetchLists()
      ])
      setLoading(false)
    }

    loadData()
  }, [user])

  // Update stats when data changes
  useEffect(() => {
    calculateStats()
  }, [devices, calls, lists])

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
    refetch: async () => {
      await Promise.all([fetchDevices(), fetchCalls(), fetchLists()])
    }
  }
}
