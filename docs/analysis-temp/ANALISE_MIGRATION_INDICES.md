# Análise da Migration: Índices Compostos

## 🎯 Objetivo
Avaliar se a migration `20250117000001_create_composite_indexes.sql` agrega valor ao projeto.

## 📊 Situação Atual

### Índices Existentes (schema.sql)
- `idx_devices_user_id` - user_id
- `idx_devices_status` - status
- `idx_calls_user_id` - user_id
- `idx_calls_status` - status
- `idx_calls_start_time` - start_time
- `idx_calls_cleanup` - (status, start_time) WHERE status IN (...)

### Queries do Código

#### 1. fetchDevices (usePBXData.ts:66)
```typescript
.from('devices')
.select('*')
.eq('user_id', user.id)
.order('created_at', { ascending: false })
```
**Status:** ✅ Usa user_id (já tem índice)
**Filtra status:** ❌ NO CLIENTE (`devices.filter(d => d.status === 'online')`)

#### 2. fetchCalls (usePBXData.ts:85)
```typescript
.from('calls')
.select('*')
.eq('user_id', user.id)
.order('start_time', { ascending: false })
.limit(50)
```
**Status:** ✅ Usa user_id (já tem índice)
**Filtra status:** ❌ NO CLIENTE (`calls.filter(c => c.status === 'ended')`)

#### 3. calculateStats (usePBXData.ts:121)
```typescript
devices.filter(d => d.status === 'online').length
```
**Status:** ❌ Filtra NO CLIENTE, não no banco

## 🔍 Análise dos Índices Compostos Propostos

### 1. `idx_devices_user_status` (user_id, status)
**Quando ajuda:** Query `.eq('user_id', X).eq('status', 'online')`
**Situação atual:** Código faz `.eq('user_id', X)` e filtra status no cliente
**Benefício:** BAIXO (código não usa esse filtro)

### 2. `idx_calls_device_status` (device_id, status)
**Quando ajuda:** Query `.eq('device_id', X).eq('status', 'ringing')`
**Situação atual:** Código não faz essa query composta diretamente
**Benefício:** MÉDIO (pode ser útil no futuro)

### 3. `idx_calls_user_status` (user_id, status)
**Quando ajuda:** Query `.eq('user_id', X).eq('status', 'ended')`
**Situação atual:** Código faz `.eq('user_id', X)` e filtra status no cliente
**Benefício:** BAIXO (código não usa esse filtro)

### 4. `idx_calls_user_device` (user_id, device_id)
**Quando ajuda:** Query `.eq('user_id', X).eq('device_id', Y)`
**Situação atual:** Não vi essa query no código
**Benefício:** BAIXO (não está sendo usado)

### 5. `idx_calls_device_start_time` (device_id, start_time DESC)
**Quando ajuda:** Query `.eq('device_id', X).order('start_time', DESC)`
**Situação atual:** Não vi essa query específica
**Benefício:** MÉDIO (útil para histórico de chamadas do dispositivo)

### 6. `idx_qr_sessions_user_valid` (user_id, used, expires_at)
**Quando ajuda:** Query `.eq('user_id', X).eq('used', false).gt('expires_at', NOW())`
**Situação atual:** `fetchQRSessions` provavelmente faz isso
**Benefício:** ALTO (query comum no pareamento)

### 7. `idx_number_lists_user_active` (user_id, is_active)
**Quando ajuda:** Query `.eq('user_id', X).eq('is_active', true)`
**Situação atual:** `fetchLists` faz `.eq('user_id', X)` e filtra no cliente
**Benefício:** BAIXO (código não usa esse filtro)

## 📈 Ganho de Performance

### Cenários que se beneficiam:
1. **Dashboard buscando dispositivos online** - Se mudar para filtrar no banco
2. **Histórico de chamadas por dispositivo** - `idx_calls_device_start_time`
3. **Validação de QR sessions** - `idx_qr_sessions_user_valid` ✅

### Cenários que NÃO se beneficiam:
1. Queries atuais que filtram status no cliente
2. Índices que não têm queries correspondentes

## ⚠️ Conflitos com Migrations Existentes

### Não há conflitos diretos
- Os índices compostos são **complementares** aos índices simples
- Índice parcial `idx_calls_cleanup` é diferente (WHERE clause específica)
- PostgreSQL pode usar múltiplos índices se necessário

## 💡 Recomendação

### ✅ Aplicar com ajustes:
1. **Manter:** `idx_qr_sessions_user_valid` - ALTO valor (query comum)
2. **Manter:** `idx_calls_device_start_time` - MÉDIO valor (útil no futuro)
3. **Manter:** `idx_calls_device_status` - MÉDIO valor (pode ser útil)
4. **Reconsiderar:** Outros índices - BAIXO valor (código não usa)

### ⚠️ Custo vs Benefício:
- **Custo:** Índices ocupam espaço em disco e tornam INSERTs mais lentos
- **Benefício:** Queries mais rápidas (se forem usadas)
- **Conclusão:** Índices compostos são úteis, mas apenas se o código usar

## 🔄 Sugestão de Melhoria

Para maximizar o benefício, considerar:
1. Mover filtros de status do cliente para o banco
2. Aplicar apenas índices que têm queries correspondentes
3. Monitorar uso dos índices após aplicação


