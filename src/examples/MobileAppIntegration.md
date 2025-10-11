# Integração App Mobile com PBX Dashboard

## Fluxo Completo de Pareamento

### 1. App Mobile - Leitura do QR Code e Pareamento

```typescript
// No App Mobile - após ler o QR Code
interface QRCodeData {
  session: string;
  user: string;
  expires: number;
}

interface DeviceInfo {
  device_id: string;
  name: string;
  model: string;
  os: string;
  app_version: string;
  push_token?: string;
}

const pairDevice = async (qrData: QRCodeData) => {
  // 1. Validar se QR Code não expirou
  if (Date.now() > qrData.expires) {
    throw new Error('QR Code expirado');
  }

  // 2. Gerar ID único do dispositivo (salvar no AsyncStorage)
  const deviceId = await getOrCreateDeviceId();
  
  // 3. Coletar informações do dispositivo
  const deviceInfo: DeviceInfo = {
    device_id: deviceId,
    name: `${Device.modelName} - ${await getUserName()}`,
    model: Device.modelName,
    os: `${Device.osName} ${Device.osVersion}`,
    app_version: Application.nativeApplicationVersion,
    push_token: await getPushToken()
  };

  // 4. Chamar Edge Function de pareamento
  const response = await fetch('https://jovnndvixqymfvnxkbep.supabase.co/functions/v1/pair-device', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      session_code: qrData.session,
      user_id: qrData.user,
      device_info: deviceInfo
    })
  });

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error);
  }

  // 5. Salvar dados do dispositivo localmente
  await AsyncStorage.setItem('device_paired', JSON.stringify(result.device));
  
  return result.device;
};
```

### 2. App Mobile - Monitoramento de Status

```typescript
// Hook para manter status online/offline
const useDeviceStatus = (deviceId: string) => {
  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout;
    
    const startHeartbeat = () => {
      // Enviar heartbeat a cada 30 segundos
      heartbeatInterval = setInterval(async () => {
        try {
          await fetch('https://jovnndvixqymfvnxkbep.supabase.co/functions/v1/device-heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId })
          });
        } catch (error) {
          console.error('Heartbeat failed:', error);
        }
      }, 30000);
    };

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        startHeartbeat();
      } else {
        clearInterval(heartbeatInterval);
      }
    };

    // Iniciar heartbeat
    startHeartbeat();
    
    // Listeners de estado do app
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      clearInterval(heartbeatInterval);
      subscription?.remove();
    };
  }, [deviceId]);
};
```

### 3. App Mobile - Recebimento de Comandos

```typescript
// Escutar comandos do dashboard em tempo real
const useCommandListener = (deviceId: string) => {
  useEffect(() => {
    const channel = supabase
      .channel(`device-${deviceId}`)
      .on('broadcast', { event: 'command' }, (payload) => {
        handleCommand(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId]);

  const handleCommand = async (payload: any) => {
    const { type, data } = payload;
    
    switch (type) {
      case 'make_call':
        await makeCall(data.number);
        break;
      case 'answer_call':
        await answerCall(data.call_id);
        break;
      case 'end_call':
        await endCall(data.call_id);
        break;
      case 'update_status':
        await updateDeviceStatus(data.status);
        break;
    }
  };
};
```

## Estados que o Dashboard monitora:

### 1. **Estados do Dispositivo:**
- `online` - Dispositivo ativo e enviando heartbeats
- `offline` - Sem heartbeat há mais de 60 segundos
- `pairing` - Em processo de pareamento

### 2. **Estados das Chamadas:**
- `ringing` - Chamada tocando no dispositivo
- `answered` - Chamada atendida
- `ended` - Chamada encerrada
- `busy` - Linha ocupada
- `failed` - Falha na chamada

### 3. **Dados sincronizados em tempo real:**
- Status de conexão do dispositivo
- Chamadas ativas
- Histórico de chamadas
- Estatísticas de uso

## Como o Dashboard identifica mudanças:

```typescript
// No Dashboard - escutar mudanças em tempo real
useEffect(() => {
  const channel = supabase
    .channel('schema-db-changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'devices' },
      (payload) => {
        console.log('Device updated:', payload);
        refetchDevices();
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'calls' },
      (payload) => {
        console.log('Call updated:', payload);
        refetchCalls();
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, []);
```

## Segurança e Validação:

1. **Validação de Sessão:** QR Code expira em 10 minutos
2. **Associação de Usuário:** Dispositivos só podem ser pareados pelo dono da sessão
3. **RLS Policies:** Cada usuário só vê seus próprios dispositivos
4. **Heartbeat:** Detecta desconexões automaticamente
5. **Tokens de Push:** Para notificações quando offline