# 🗄️ Análise Completa da Estrutura do Banco de Dados

## 📊 Estrutura Atual do Banco de Dados

### 1. **Tabela `devices`**

#### Colunas Base (schema.sql):
```sql
CREATE TABLE public.devices (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT CHECK (status IN ('online', 'offline')) DEFAULT 'offline',
    paired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Colunas Adicionadas (migrations):
```sql
-- Migration 20250904024545: Informações do dispositivo
model TEXT
os TEXT
os_version TEXT
sim_type TEXT
has_physical_sim BOOLEAN DEFAULT false
has_esim BOOLEAN DEFAULT false

-- Migration 20250903223947: Status de conexão
internet_status TEXT DEFAULT 'unknown'
signal_status TEXT DEFAULT 'unknown'
line_blocked BOOLEAN DEFAULT false
active_calls_count INTEGER DEFAULT 0
```

#### Estrutura Final (`devices`):
```sql
devices (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT CHECK (status IN ('online', 'offline')) DEFAULT 'offline',
    paired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Colunas adicionadas
    model TEXT,
    os TEXT,
    os_version TEXT,
    sim_type TEXT,
    has_physical_sim BOOLEAN DEFAULT false,
    has_esim BOOLEAN DEFAULT false,
    internet_status TEXT DEFAULT 'unknown',
    signal_status TEXT DEFAULT 'unknown',
    line_blocked BOOLEAN DEFAULT false,
    active_calls_count INTEGER DEFAULT 0
)
```

#### ⚠️ Problemas Identificados:
1. **Status Limitado**: Apenas `'online' | 'offline'`, mas código tenta usar `'unpaired'`
2. **Sem Índice Composto**: `(user_id, status)` para queries frequentes
3. **active_calls_count**: Pode ficar desatualizado (sem trigger)
4. **Falta `session_code`**: Usado no pareamento, mas não está na tabela

---

### 2. **Tabela `calls`**

#### Colunas Base (schema.sql):
```sql
CREATE TABLE public.calls (
    id UUID PRIMARY KEY,
    number TEXT NOT NULL,
    status TEXT CHECK (status IN ('ringing', 'answered', 'ended')) DEFAULT 'ringing',
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration INTEGER DEFAULT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Colunas Adicionadas (migrations):
```sql
-- Migration 20250903223947: Hidden flag
hidden BOOLEAN NOT NULL DEFAULT false

-- Migration 20251014180000: Status ENUM e campos de campanha
-- Status agora é ENUM:
CREATE TYPE call_status_enum AS ENUM (
    'queued', 
    'dialing', 
    'ringing', 
    'answered', 
    'completed', 
    'busy',
    'failed', 
    'no_answer'
);
campaign_id UUID REFERENCES public.number_lists(id) ON DELETE SET NULL
session_id TEXT
failure_reason TEXT

-- Migration 20250831165031: Removido depois
-- ddi_prefix TEXT (removido em 20250831180638)
```

#### Estrutura Final (`calls`):
```sql
calls (
    id UUID PRIMARY KEY,
    number TEXT NOT NULL,
    status call_status_enum DEFAULT 'ringing',  -- ⚠️ ENUM, não TEXT!
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration INTEGER DEFAULT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Colunas adicionadas
    hidden BOOLEAN NOT NULL DEFAULT false,
    campaign_id UUID REFERENCES public.number_lists(id) ON DELETE SET NULL,
    session_id TEXT,
    failure_reason TEXT
)
```

#### ⚠️ Problemas Identificados:
1. **Inconsistência de Status**: 
   - Schema base: `'ringing' | 'answered' | 'ended'`
   - Migration: ENUM com 8 valores
   - Código usa: `'dialing' | 'ringing' | 'active' | 'disconnected'`
   - **⚠️ INCOMPATIBILIDADE!**

2. **Sem Índice em `device_id`**: Queries por dispositivo são lentas
3. **duration** calculado manualmente (deveria ter trigger)
4. **Sem `native_call_id`**: App precisa mapear `callId` nativo → DB ID

---

### 3. **Tabela `qr_sessions`**

#### Estrutura (schema.sql):
```sql
CREATE TABLE public.qr_sessions (
    id UUID PRIMARY KEY,
    qr_code TEXT NOT NULL,
    session_link TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Estrutura Real (types.ts):
```sql
qr_sessions (
    id UUID PRIMARY KEY,
    session_code TEXT NOT NULL,  -- ⚠️ Nome diferente!
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,  -- ⚠️ Adicionado
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()  -- ⚠️ Adicionado
)
```

#### ⚠️ Problemas Identificados:
1. **Schema.sql desatualizado**: Colunas diferentes (`qr_code` vs `session_code`)
2. **Sem coluna `used`** no schema base (mas existe na migration)
3. **Falta `updated_at`** no schema base

---

### 4. **Tabela `number_lists`**

#### Estrutura (schema.sql):
```sql
CREATE TABLE public.number_lists (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    numbers TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Colunas Adicionadas:
```sql
-- Migration 20250831180638
ddi_prefix TEXT
```

#### Estrutura Final:
```sql
number_lists (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    numbers TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ddi_prefix TEXT
)
```

#### ✅ Está OK, mas pode melhorar:
- Array `TEXT[]` pode ser ineficiente para listas grandes
- Sem validação de formato de números

---

## 🚨 Problemas Críticos Identificados

### 1. **Inconsistência de Status em `calls`**

**Problema:** Schema, migration e código usam valores diferentes

| Fonte | Valores de Status |
|-------|------------------|
| schema.sql | `'ringing' | 'answered' | 'ended'` |
| Migration | ENUM: `'queued', 'dialing', 'ringing', 'answered', 'completed', 'busy', 'failed', 'no_answer'` |
| Código TypeScript | `'ringing' | 'answered' | 'ended'` |
| Código App (useCallStatusSync) | `'dialing' | 'ringing' | 'active' | 'disconnected'` |

**Impacto:**
- ❌ App tenta atualizar com `'active'` e `'disconnected'` → ERRO
- ❌ Migration cria ENUM, mas código não usa
- ❌ Possível erro ao inserir/atualizar chamadas

**Solução:**
1. Alinhar valores de status entre todos
2. Atualizar código para usar ENUM
3. Criar migration de sincronização

---

### 2. **Status Limitado em `devices`**

**Problema:** Apenas `'online' | 'offline'`, mas código usa `'unpaired'`

```typescript
// MobileApp.tsx
if (payload.new.status === 'unpaired') {
  handleUnpaired();
}
```

**Impacto:**
- ❌ Banco não aceita `'unpaired'`
- ❌ Check constraint falha

**Solução:**
```sql
-- Adicionar status 'unpaired'
ALTER TABLE devices DROP CONSTRAINT devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check 
  CHECK (status IN ('online', 'offline', 'unpaired', 'pairing'));
```

---

### 3. **Falta de Índices Compostos**

**Problema:** Queries frequentes sem índices otimizados

**Queries Frequentes:**
```sql
-- Dashboard: Buscar dispositivos do usuário por status
SELECT * FROM devices WHERE user_id = ? AND status = 'online';

-- Dashboard: Buscar chamadas do dispositivo
SELECT * FROM calls WHERE device_id = ? AND status != 'ended';

-- Dashboard: Buscar chamadas ativas do usuário
SELECT * FROM calls WHERE user_id = ? AND status IN ('ringing', 'answered');
```

**Solução:**
```sql
-- Índices compostos
CREATE INDEX idx_devices_user_status ON devices(user_id, status);
CREATE INDEX idx_calls_device_status ON calls(device_id, status);
CREATE INDEX idx_calls_user_status ON calls(user_id, status);
CREATE INDEX idx_calls_user_device ON calls(user_id, device_id);
```

---

### 4. **`active_calls_count` Desatualizado**

**Problema:** Campo calculado sem trigger

**Solução:**
```sql
-- Trigger para atualizar contador
CREATE OR REPLACE FUNCTION update_device_call_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('ringing', 'answered') THEN
            UPDATE devices 
            SET active_calls_count = active_calls_count + 1 
            WHERE id = NEW.device_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IN ('ringing', 'answered') AND NEW.status NOT IN ('ringing', 'answered') THEN
            UPDATE devices 
            SET active_calls_count = GREATEST(0, active_calls_count - 1) 
            WHERE id = NEW.device_id;
        ELSIF OLD.status NOT IN ('ringing', 'answered') AND NEW.status IN ('ringing', 'answered') THEN
            UPDATE devices 
            SET active_calls_count = active_calls_count + 1 
            WHERE id = NEW.device_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('ringing', 'answered') THEN
            UPDATE devices 
            SET active_calls_count = GREATEST(0, active_calls_count - 1) 
            WHERE id = OLD.device_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_call_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON calls
FOR EACH ROW EXECUTE FUNCTION update_device_call_count();
```

---

### 5. **Schema.sql Desatualizado**

**Problema:** Schema base não reflete estrutura real do banco

**Solução:**
- Atualizar `schema.sql` com todas as migrations
- Criar script de validação
- Documentar estrutura final

---

## 💡 Recomendações de Melhoria

### 1. **Criar Tabela de Eventos de Chamada (Event Sourcing)**

```sql
CREATE TABLE call_events (
    id UUID PRIMARY KEY,
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,  -- 'started', 'answered', 'ended', etc.
    event_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

CREATE INDEX idx_call_events_call_id ON call_events(call_id);
CREATE INDEX idx_call_events_device_id ON call_events(device_id);
CREATE INDEX idx_call_events_timestamp ON call_events(timestamp);
```

**Benefícios:**
- ✅ Histórico completo
- ✅ Auditoria
- ✅ Replay de eventos
- ✅ Debug facilitado

---

### 2. **Adicionar Tabela de Comandos Pendentes**

```sql
CREATE TABLE device_commands (
    id UUID PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    command_type TEXT NOT NULL,
    command_data JSONB NOT NULL,
    status TEXT CHECK (status IN ('pending', 'sent', 'acknowledged', 'failed')) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

CREATE INDEX idx_device_commands_device_status ON device_commands(device_id, status);
CREATE INDEX idx_device_commands_pending ON device_commands(status) WHERE status = 'pending';
```

**Benefícios:**
- ✅ Queue de comandos
- ✅ Retry automático
- ✅ Confirmação de entrega
- ✅ Histórico de comandos

---

### 3. **Criar Materialized View para Estatísticas**

```sql
CREATE MATERIALIZED VIEW device_stats AS
SELECT 
    d.id AS device_id,
    d.user_id,
    d.status,
    COUNT(CASE WHEN c.status IN ('ringing', 'answered') THEN 1 END) AS active_calls,
    COUNT(CASE WHEN c.status = 'completed' THEN 1 END) AS completed_calls,
    COUNT(CASE WHEN c.status = 'failed' THEN 1 END) AS failed_calls,
    SUM(c.duration) AS total_duration,
    AVG(c.duration) AS avg_duration,
    MAX(c.start_time) AS last_call_time
FROM devices d
LEFT JOIN calls c ON c.device_id = d.id
GROUP BY d.id, d.user_id, d.status;

CREATE UNIQUE INDEX idx_device_stats_device ON device_stats(device_id);

-- Refresh periódico
REFRESH MATERIALIZED VIEW CONCURRENTLY device_stats;
```

---

## 📋 Checklist de Correções Necessárias

### Urgente:
- [ ] Corrigir inconsistência de status em `calls`
- [ ] Adicionar status `'unpaired'` em `devices`
- [ ] Criar índices compostos
- [ ] Atualizar `schema.sql` com estrutura real

### Importante:
- [ ] Criar trigger para `active_calls_count`
- [ ] Adicionar `native_call_id` em `calls` para mapeamento
- [ ] Criar tabela de eventos de chamada
- [ ] Criar tabela de comandos pendentes

### Desejável:
- [ ] Materialized views para estatísticas
- [ ] Funções de limpeza automática
- [ ] Validação de dados (triggers)
- [ ] Documentação completa

---

## 🎯 Próximos Passos

1. **Criar migration de correção**:
   - Sincronizar status de chamadas
   - Adicionar índices
   - Adicionar triggers

2. **Atualizar código TypeScript**:
   - Usar valores corretos de status
   - Usar ENUM do banco

3. **Atualizar documentação**:
   - Schema.sql completo
   - Diagrama ER
   - Documentação de APIs

