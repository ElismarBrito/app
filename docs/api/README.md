# 📚 Documentação da API - PBX Mobile

## 🔗 Endpoints

### Edge Functions (Supabase)

#### POST `/functions/v1/pair-device`
Pareia um dispositivo móvel com o dashboard.

**Request Body:**
```json
{
  "session_code": "1763331114470",
  "user_id": "uuid-do-usuario",
  "device_info": {
    "device_id": "uuid-do-dispositivo",
    "name": "Samsung Galaxy S21",
    "model": "Samsung Galaxy S21",
    "os": "Android",
    "os_version": "13",
    "sim_type": "physical",
    "has_physical_sim": true,
    "has_esim": false
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "device": {
    "id": "uuid",
    "name": "Samsung Galaxy S21",
    "status": "online",
    ...
  },
  "message": "Dispositivo pareado com sucesso"
}
```

---

## 📡 Comunicação em Tempo Real

### Canais Supabase Realtime

#### Canal: `device:${deviceId}:commands`
**Tipo:** Broadcast  
**Uso:** Dashboard → Dispositivo específico  
**Evento:** `command`

**Payload:**
```typescript
{
  id: string; // UUID do comando
  device_id: string;
  command: string; // 'make_call', 'start_campaign', etc.
  data: any;
  timestamp: number;
  timeout?: number;
  retries?: number;
}
```

---

#### Canal: `device:${deviceId}:acks`
**Tipo:** Broadcast  
**Uso:** Dispositivo → Dashboard  
**Evento:** `ack`

**Payload:**
```typescript
{
  command_id: string;
  device_id: string;
  status: 'received' | 'processed' | 'failed';
  error?: string;
  timestamp: number;
}
```

---

#### Canal: `device:${deviceId}:events`
**Tipo:** Broadcast  
**Uso:** Dispositivo → Dashboard  
**Evento:** `call_event`

**Payload:**
```typescript
{
  type: 'call_started' | 'call_answered' | 'call_ended';
  call_id: string;
  device_id: string;
  data: any;
  timestamp: number;
}
```

---

## 🗄️ Banco de Dados

### Tabela: `devices`

**Colunas principais:**
- `id` (UUID) - Primary Key
- `name` (TEXT) - Nome do dispositivo
- `status` (TEXT) - Status: 'online', 'offline', 'unpaired', 'pairing'
- `user_id` (UUID) - Foreign Key para auth.users
- `model`, `os`, `os_version` - Informações do dispositivo
- `active_calls_count` (INTEGER) - Contador automático de chamadas ativas

---

### Tabela: `calls`

**Colunas principais:**
- `id` (UUID) - Primary Key
- `number` (TEXT) - Número chamado
- `status` (ENUM) - Status da chamada
- `device_id` (UUID) - Foreign Key para devices
- `user_id` (UUID) - Foreign Key para auth.users
- `campaign_id` (UUID) - Foreign Key para number_lists
- `duration` (INTEGER) - Duração em segundos

---

### Tabela: `device_commands`

**Colunas principais:**
- `id` (UUID) - Primary Key
- `device_id` (UUID) - Foreign Key para devices
- `command_type` (TEXT) - Tipo de comando
- `command_data` (JSONB) - Dados do comando
- `status` (TEXT) - Status: 'pending', 'sent', 'acknowledged', 'failed', 'expired'
- `retry_count` (INTEGER) - Número de tentativas
- `max_retries` (INTEGER) - Máximo de tentativas

---

## 📝 Exemplos de Uso

### Dashboard Envia Comando para Dispositivo

```typescript
import { deviceCommunicationService } from '@/lib/device-communication';

const result = await deviceCommunicationService.sendCommand(
  deviceId,
  'make_call',
  { number: '+5511999999999' },
  {
    timeout: 5000,
    retries: 3
  }
);

if (result.success) {
  console.log('Comando enviado:', result.commandId);
} else {
  console.error('Erro:', result.error);
}
```

### Dispositivo Escuta Comandos

```typescript
import { useDeviceCommunication } from '@/hooks/useDeviceCommunication';

useDeviceCommunication({
  deviceId: deviceId || null,
  enabled: !!deviceId && isConnected,
  onCommand: async (command) => {
    // Processa comando
    await handleCommand(command);
  }
});
```

---

## 🔐 Autenticação

Todas as requisições requerem autenticação via Supabase Auth:

```typescript
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Headers
{
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

---

## 📊 Métricas e Logs

### Logging

```typescript
import { logger } from '@/lib/logger';

logger.debug('Mensagem de debug', { context: 'value' });
logger.info('Informação', { data: 'value' });
logger.warn('Aviso', { warning: 'value' });
logger.error('Erro', error, { context: 'value' });
```

### Métricas

```typescript
import { metrics } from '@/lib/metrics';

metrics.increment('command_sent', { device_id: deviceId });
metrics.timer('command_duration', durationMs, { device_id: deviceId });

// Mede duração de função assíncrona
await metrics.measureAsync('api_call', async () => {
  return await fetch('/api/endpoint');
});
```

