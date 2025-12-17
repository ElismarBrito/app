# Análise de Conflitos: Branch `and-11` vs `and-19`

## 🔴 RESUMO EXECUTIVO

**Sim, há risco de conflitos** entre as branches `and-11-correcoes-banco-dados` e `and-19`.

### Arquivos com Risco de Conflito:
1. ⚠️ **`src/components/MobileApp.tsx`** - **ALTO RISCO**
2. ⚠️ **`src/hooks/usePBXData.ts`** - **ALTO RISCO**
3. ⚠️ **`src/hooks/useDeviceStatus.ts`** - **MÉDIO RISCO**
4. ⚠️ **`src/hooks/useDeviceValidation.ts`** - **MÉDIO RISCO**

---

## 📋 ANÁLISE DETALHADA DE CONFLITOS

### 1. **`src/components/MobileApp.tsx`** 🔴 ALTO RISCO

#### O que foi implementado na `and-11`:
- ✅ Função `extractSessionCode()` robusta com múltiplos fallbacks
- ✅ Função `pairDevice()` com parâmetro `codeOverride` para evitar race conditions
- ✅ Device ID persistente em `localStorage` com key específica por usuário
- ✅ Mapeamento in-memory (`callMapRef`, `campaignNumberToDbCallIdRef`) para rastrear callId nativo → dbCallId
- ✅ Listener `dialerCallStateChanged` com fallback inteligente (busca no banco se mapeamento falha)
- ✅ `dialerListenerReadyRef` para garantir listener está pronto antes de iniciar campanha

#### O que foi implementado na `and-19`:
- ✅ Função `getOrCreateDeviceId()` (removida na and-11 e substituída por implementação mais robusta)
- ✅ `useCallStatusSync` hook para sincronização de status
- ✅ Persistência de pareamento (implementação diferente)
- ✅ Integração com Power Dialer
- ✅ QR Scanner nativo (integrado via `useQRScanner`)

#### ⚠️ CONFLITOS IDENTIFICADOS:

1. **Implementação de Pareamento**:
   - **and-19**: Usa `getOrCreateDeviceId()` (função externa)
   - **and-11**: Implementação inline em `pairDevice()` com `localStorage` key por usuário
   - **Conflito**: Abordagens diferentes de persistência de deviceId

2. **Sincronização de Chamadas**:
   - **and-19**: Usa `useCallStatusSync` hook
   - **and-11**: Implementação direta no listener `dialerCallStateChanged` com mapeamento in-memory
   - **Conflito**: Pode haver duplicação ou lógica conflitante

3. **Função `pairDevice()`**:
   - **and-19**: Versão básica
   - **and-11**: Versão melhorada com `codeOverride`, logs detalhados, e validações robustas
   - **Conflito**: A versão da and-11 é superior e deve ser mantida

4. **Função `extractSessionCode()`**:
   - **and-19**: Implementação básica
   - **and-11**: Implementação robusta com múltiplos fallbacks e suporte a diferentes formatos
   - **Conflito**: A versão da and-11 é superior e deve ser mantida

---

### 2. **`src/hooks/usePBXData.ts`** 🔴 ALTO RISCO

#### O que foi implementado na `and-11`:
- ✅ Filtro para dispositivos 'unpaired' (`.neq('status', 'unpaired')`)
- ✅ Validação de dispositivos offline baseado em `last_seen > 5 minutos`
- ✅ Subscription detecta `INSERT` e `UPDATE` para 'online', recarregando imediatamente
- ✅ Uso de `useCallback`, `useRef` para otimização
- ✅ Select específico de colunas ao invés de `select('*')`
- ✅ Status `'unpaired'` adicionado ao tipo `Device`

#### O que foi implementado na `and-19`:
- ✅ Versão básica sem filtros específicos
- ✅ Select com `select('*')` (menos otimizado)
- ✅ Sem validação de dispositivos offline baseado em last_seen

#### ⚠️ CONFLITOS IDENTIFICADOS:

1. **Filtro de Dispositivos Unpaired**:
   - **and-19**: Não filtra dispositivos 'unpaired'
   - **and-11**: Filtra explicitamente dispositivos 'unpaired'
   - **Conflito**: A versão da and-11 é necessária para não mostrar dispositivos despareados

2. **Validação de Dispositivos Offline**:
   - **and-19**: Sem validação baseada em last_seen
   - **and-11**: Valida e marca offline dispositivos sem heartbeat há mais de 5 minutos
   - **Conflito**: A versão da and-11 adiciona funcionalidade importante

3. **Otimizações**:
   - **and-19**: Menos otimizada (select('*'), sem useCallback)
   - **and-11**: Mais otimizada (select específico, useCallback, useRef)
   - **Conflito**: A versão da and-11 tem melhor performance

4. **Subscription de Dispositivos**:
   - **and-19**: Versão básica
   - **and-11**: Detecta `INSERT` e recarrega imediatamente (sem debounce)
   - **Conflito**: A versão da and-11 garante que novos dispositivos apareçam no dashboard

---

### 3. **`src/hooks/useDeviceStatus.ts`** 🟡 MÉDIO RISCO

#### O que foi implementado na `and-11`:
- ✅ Possíveis melhorias específicas (precisa verificar)

#### O que foi implementado na `and-19`:
- ✅ Implementação de heartbeat básico

#### ⚠️ CONFLITOS POTENCIAIS:
- Mudanças podem não ser conflitantes se forem complementares
- Precisa verificar se há modificações específicas na and-11

---

### 4. **`src/hooks/useDeviceValidation.ts`** 🟡 MÉDIO RISCO

#### O que foi implementado na `and-11`:
- ✅ Possíveis melhorias (precisa verificar)

#### O que foi implementado na `and-19`:
- ✅ Validação de dispositivos básica

#### ⚠️ CONFLITOS POTENCIAIS:
- Similar ao useDeviceStatus, pode não haver conflitos se forem complementares

---

## 🆕 FUNCIONALIDADES EXCLUSIVAS

### Funcionalidades apenas na `and-11`:
1. ✅ **`useDeviceHeartbeat.ts`** - Hook de ping/pong bidirecional (não existe na and-19)
2. ✅ **Trigger de validação de status** (`supabase/migrations/20250122000000_trigger_device_status_validation.sql`)
3. ✅ **Mapeamento melhorado de chamadas** com fallback no banco
4. ✅ **Logs detalhados** (130+ pontos de logging)

### Funcionalidades apenas na `and-19`:
1. ✅ **QR Scanner nativo** (ML Kit e CameraX)
2. ✅ **Power Dialer** completo
3. ✅ **Sistema de logging e métricas** (and-16)
4. ✅ **Migrations da and-09**

---

## 🎯 ESTRATÉGIA DE MERGE RECOMENDADA

### Opção 1: Merge `and-11` → `and-19` (RECOMENDADO)
**Prioridade**: Manter as melhorias da `and-11` que são superiores

**Passos**:
1. Fazer merge da `and-11` na `and-19`
2. Resolver conflitos mantendo a versão da `and-11` para:
   - `pairDevice()` e `extractSessionCode()`
   - Filtros e validações em `usePBXData.ts`
   - Mapeamento de chamadas
3. Integrar funcionalidades exclusivas da `and-19`:
   - QR Scanner nativo
   - Power Dialer (se não conflitar)
   - Sistema de logging e métricas

**Vantagens**:
- Mantém as melhorias mais recentes e robustas da `and-11`
- Preserva funcionalidades da `and-19` que não conflitam
- Garante que correções críticas da `and-11` sejam aplicadas

### Opção 2: Merge `and-19` → `and-11`
**Prioridade**: Adicionar funcionalidades da `and-19` na `and-11`

**Passos**:
1. Fazer merge da `and-19` na `and-11`
2. Resolver conflitos mantendo a versão da `and-11`
3. Adicionar funcionalidades exclusivas da `and-19`

**Vantagens**:
- Mantém a base da `and-11` (mais recente e robusta)
- Adiciona funcionalidades da `and-19` sem perder melhorias

---

## ⚠️ PONTOS DE ATENÇÃO

1. **`pairDevice()` e `extractSessionCode()`**:
   - ⚠️ **CRÍTICO**: Manter versão da `and-11` (muito mais robusta)
   - A versão da `and-11` corrige problemas de pareamento na primeira tentativa

2. **Filtros em `usePBXData.ts`**:
   - ⚠️ **CRÍTICO**: Manter filtro de 'unpaired' da `and-11`
   - Sem esse filtro, dispositivos despareados aparecerão no dashboard

3. **Mapeamento de Chamadas**:
   - ⚠️ **IMPORTANTE**: Manter implementação da `and-11` com fallback
   - Previne chamadas "presas" no banco

4. **`useCallStatusSync` vs. Implementação Direta**:
   - ⚠️ **AVALIAR**: Se `useCallStatusSync` da `and-19` é compatível com mapeamento da `and-11`
   - Pode haver duplicação de lógica

5. **QR Scanner Nativo**:
   - ✅ **COMPATÍVEL**: Não conflita com melhorias da `and-11`
   - Pode ser integrado sem problemas

---

## 📝 CHECKLIST PARA MERGE

### Antes do Merge:
- [ ] Fazer backup da branch de destino
- [ ] Verificar se todas as migrations da `and-11` estão aplicadas
- [ ] Verificar se todas as migrations da `and-19` estão aplicadas

### Durante o Merge:
- [ ] Resolver conflitos em `MobileApp.tsx` mantendo versão da `and-11`
- [ ] Resolver conflitos em `usePBXData.ts` mantendo versão da `and-11`
- [ ] Integrar `useCallStatusSync` se não duplicar lógica
- [ ] Adicionar `useDeviceHeartbeat` da `and-11`
- [ ] Garantir que QR Scanner da `and-19` funcione com pareamento da `and-11`

### Após o Merge:
- [ ] Testar pareamento com QR Code
- [ ] Testar pareamento manual
- [ ] Testar sincronização de chamadas
- [ ] Verificar se dispositivos despareados não aparecem
- [ ] Validar que novos dispositivos aparecem no dashboard

---

**Conclusão**: Há conflitos significativos, mas são **resolvíveis** mantendo a versão superior da `and-11` e integrando funcionalidades complementares da `and-19`.

