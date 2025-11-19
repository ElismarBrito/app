# 🔧 Guia de Troubleshooting - PBX Mobile

## 📋 Índice
1. [Erros Comuns e Soluções](#erros-comuns-e-soluções)
2. [Padrões de Problemas](#padrões-de-problemas)
3. [Checklist de Verificação](#checklist-de-verificação)
4. [Arquitetura Crítica](#arquitetura-crítica)
5. [Logs e Debug](#logs-e-debug)

---

## 🚨 Erros Comuns e Soluções

### 1. **ReferenceError: Cannot access 'X' before initialization**

#### Sintomas
- Tela preta no app
- Erro no console: `ReferenceError: Cannot access 'Bt' before initialization`
- App não inicia após compilação

#### Causa
Função ou variável sendo usada em `useEffect` antes de ser declarada no componente React.

#### Solução
```typescript
// ❌ ERRADO - Função usada antes de ser declarada
useEffect(() => {
  if (deviceId) {
    handleUnpaired(); // Erro: handleUnpaired ainda não foi declarada
  }
}, [deviceId]);

const handleUnpaired = () => {
  // ...
};

// ✅ CORRETO - Função declarada antes de ser usada
const handleUnpaired = () => {
  // ...
};

useEffect(() => {
  if (deviceId) {
    handleUnpaired(); // OK: handleUnpaired já foi declarada
  }
}, [deviceId]);
```

#### Prevenção
- **Sempre declarar funções ANTES dos `useEffect` que as usam**
- Usar `useCallback` para funções que serão usadas em dependências
- Organizar código: funções → hooks → efeitos → render

---

### 2. **Pareamento não persiste entre sessões**

#### Sintomas
- App desemparea ao fechar e reabrir
- Precisa escanear QR Code novamente
- `localStorage` parece não estar funcionando

#### Causa
- `localStorage` não está disponível no momento da inicialização
- `deviceId` está sendo gerado dinamicamente ao invés de persistir
- Verificação no banco não está sendo feita corretamente

#### Solução
```typescript
// ✅ CORRETO - Função fora do componente para evitar problemas de inicialização
const getOrCreateDeviceId = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    if (typeof localStorage === 'undefined') return null;
    
    const storageKey = 'pbx_device_id';
    let storedDeviceId = localStorage.getItem(storageKey);
    
    if (!storedDeviceId) {
      storedDeviceId = crypto.randomUUID();
      localStorage.setItem(storageKey, storedDeviceId);
    }
    
    return storedDeviceId;
  } catch (error) {
    console.error('❌ Erro ao obter/criar deviceId:', error);
    return null;
  }
};

// ✅ CORRETO - Verificação robusta com delay
useEffect(() => {
  if (!user) return;

  const restoreTimeout = setTimeout(() => {
    const restorePairingState = async () => {
      // Verifica localStorage
      if (typeof localStorage === 'undefined') return;
      
      const persistentDeviceId = getOrCreateDeviceId();
      if (!persistentDeviceId) return;
      
      // Verifica no banco
      const { data: device, error } = await supabase
        .from('devices')
        .select('*')
        .eq('id', persistentDeviceId)
        .eq('user_id', user.id)
        .single();

      if (error || !device) return;

      // ✅ CRÍTICO: Verifica se foi desconectado no dashboard
      const deviceStatus = device.status?.toLowerCase()?.trim();
      if (deviceStatus === 'offline') {
        localStorage.removeItem('pbx_is_paired');
        return; // NÃO restaura pareamento se estiver offline
      }

      // Restaura pareamento apenas se não estiver offline
      setDeviceId(device.id);
      setIsPaired(true);
      setIsConnected(true);
    };

    restorePairingState();
  }, 500); // Delay para garantir inicialização completa

  return () => clearTimeout(restoreTimeout);
}, [user]);
```

#### Prevenção
- Sempre verificar disponibilidade de `localStorage` antes de usar
- Adicionar delay na restauração para garantir inicialização completa
- **SEMPRE verificar status 'offline' antes de restaurar pareamento**
- Usar verificação case-insensitive para status

---

### 3. **App reconecta automaticamente após desconexão no dashboard**

#### Sintomas
- Desconecta dispositivo no dashboard
- Ao abrir app novamente, reconecta automaticamente
- Status muda para 'online' mesmo após desconexão

#### Causa
- `useDeviceStatus` marca como 'online' sem verificar status atual
- `restorePairingState` não verifica status 'offline' antes de restaurar
- Hook atualiza status mesmo quando dispositivo foi explicitamente desconectado

#### Solução
```typescript
// ✅ CORRETO - Hook verifica status antes de atualizar
const setOnline = async () => {
  if (!user || !deviceId || isOnlineRef.current) return;

  try {
    // ✅ CRÍTICO: Verifica status atual ANTES de atualizar
    const { data: device, error: checkError } = await supabase
      .from('devices')
      .select('status')
      .eq('id', deviceId)
      .eq('user_id', user.id)
      .single();

    if (checkError || !device) return;

    // ✅ CRÍTICO: Se estiver offline, NÃO marca como online
    const deviceStatus = device.status?.toLowerCase()?.trim();
    if (deviceStatus === 'offline') {
      console.log('⚠️ Dispositivo desconectado, não marcando como online');
      isOnlineRef.current = false;
      return;
    }

    // Só atualiza se não estiver offline
    const { error } = await supabase
      .from('devices')
      .update({
        status: 'online',
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', deviceId)
      .eq('user_id', user.id);
    
    if (!error) {
      isOnlineRef.current = true;
    }
  } catch (error) {
    console.error('Erro ao marcar dispositivo como online:', error);
  }
};
```

#### Prevenção
- **SEMPRE verificar status atual no banco antes de atualizar**
- Respeitar status 'offline' explicitamente setado no dashboard
- Usar subscriptions real-time para detectar mudanças de status

---

### 4. **Race Condition na Inicialização**

#### Sintomas
- Comportamento inconsistente ao abrir app
- Algumas vezes funciona, outras vezes não
- `localStorage` às vezes está disponível, outras vezes não

#### Causa
- Componente tenta acessar recursos antes de estarem prontos
- Não há delay para garantir inicialização completa

#### Solução
```typescript
// ✅ CORRETO - Delay e verificações robustas
useEffect(() => {
  if (!user) return;

  // Delay para garantir inicialização completa
  const restoreTimeout = setTimeout(() => {
    const restorePairingState = async () => {
      // Verifica disponibilidade ANTES de usar
      if (typeof window === 'undefined') return;
      if (typeof localStorage === 'undefined') {
        console.log('📱 localStorage não disponível ainda');
        return;
      }

      // Resto da lógica...
    };

    restorePairingState();
  }, 500); // Delay de 500ms

  return () => clearTimeout(restoreTimeout);
}, [user]);
```

#### Prevenção
- Sempre adicionar delay em operações de inicialização críticas
- Verificar disponibilidade de recursos antes de usar
- Usar `try-catch` em operações que podem falhar silenciosamente

---

## 🔍 Padrões de Problemas

### Padrão 1: Ordem de Declaração em React
**Problema:** Funções usadas antes de serem declaradas

**Padrão de Solução:**
```typescript
// Ordem correta:
1. Imports
2. Funções helper (fora do componente)
3. Componente:
   a. Hooks de estado (useState)
   b. Hooks de contexto/autenticação (useAuth)
   c. Funções do componente (antes dos useEffect)
   d. useEffect hooks
   e. Render/return
```

### Padrão 2: Verificação de Status
**Problema:** Atualizações que não respeitam estado atual

**Padrão de Solução:**
```typescript
// SEMPRE seguir este padrão:
1. Verificar status atual no banco
2. Validar se a operação é permitida
3. Apenas então realizar a atualização
```

### Padrão 3: Persistência de Estado
**Problema:** Estado não persiste entre sessões

**Padrão de Solução:**
```typescript
// Para persistência:
1. Verificar disponibilidade de localStorage
2. Usar função helper fora do componente
3. Adicionar delay na restauração
4. Validar dados restaurados no banco
```

---

## ✅ Checklist de Verificação

### Antes de Implementar Nova Funcionalidade

- [ ] Funções declaradas ANTES dos `useEffect` que as usam?
- [ ] Verificações de disponibilidade de recursos (`localStorage`, `window`)?
- [ ] `try-catch` em operações que podem falhar?
- [ ] Delay em operações de inicialização crítica?
- [ ] Verificação de status atual antes de atualizar?
- [ ] Logs adequados para debug?

### Ao Implementar Persistência

- [ ] `localStorage` verificado antes de usar?
- [ ] Função helper fora do componente?
- [ ] Delay na restauração?
- [ ] Validação no banco após restaurar?
- [ ] Limpeza do `localStorage` quando necessário?

### Ao Implementar Status de Dispositivo

- [ ] Status verificado ANTES de atualizar?
- [ ] Status 'offline' é respeitado?
- [ ] Subscription real-time configurada?
- [ ] `localStorage` limpo quando desconectado?
- [ ] Verificação case-insensitive?

---

## 🏗️ Arquitetura Crítica

### Fluxo de Pareamento

```
1. App abre
   ↓
2. Verifica localStorage (deviceId, isPaired)
   ↓
3. Se encontrado, consulta banco (verifica se ainda está pareado)
   ↓
4. Verifica status no banco:
   - Se 'offline': NÃO restaura, limpa localStorage
   - Se 'online'/'configured': Restaura pareamento
   ↓
5. Inicia subscription real-time para mudanças de status
```

### Fluxo de Desconexão

```
1. Dashboard: Usuário clica "Desconectar"
   ↓
2. Dashboard: Atualiza status para 'offline' no banco
   ↓
3. App: Subscription real-time detecta mudança
   ↓
4. App: handleUnpaired() é chamado
   ↓
5. App: Limpa localStorage (pbx_is_paired)
   ↓
6. App: Para heartbeat e atualiza estado local
   ↓
7. Se app reabrir: Verifica status 'offline' e NÃO reconecta
```

### Hook useDeviceStatus

**Fluxo Crítico:**
```
1. Hook monta → Verifica status atual no banco
2. Se status 'offline' → NÃO marca como online
3. Se status 'online'/'configured' → Marca como online
4. Sempre verifica ANTES de atualizar
```

---

## 📊 Logs e Debug

### Comandos Úteis

```bash
# Logs do Android
adb logcat | grep PbxMobile

# Logs do React (no navegador)
# F12 → Console → Filtrar por "📱" ou "⚠️"

# Verificar localStorage
# No navegador: Application → Local Storage
```

### Padrão de Logs

```typescript
// ✅ BOM - Logs informativos com emojis para facilitar busca
console.log('📱 DeviceId recuperado:', deviceId);
console.log('⚠️ Dispositivo desconectado, não restaurando');
console.log('✅ Pareamento restaurado:', device);
console.error('❌ Erro ao restaurar pareamento:', error);

// ❌ RUIM - Logs genéricos
console.log('Device:', device);
console.log('Error:', error);
```

### O Que Procurar nos Logs

1. **Tela preta / App não inicia:**
   - Buscar por `ReferenceError`
   - Buscar por `Cannot access`

2. **Pareamento não persiste:**
   - Buscar por `📱 DeviceId`
   - Buscar por `⚠️ Dispositivo desconectado`
   - Verificar se `localStorage` está sendo acessado

3. **Reconexão automática:**
   - Buscar por `✅ Pareamento restaurado`
   - Verificar se status 'offline' está sendo checado
   - Buscar por `⚠️ Dispositivo está desconectado no dashboard`

---

## 🎯 Lições Aprendidas

### 1. **Sempre Verificar ANTES de Atualizar**
- Nunca atualize status sem verificar o estado atual no banco
- Especialmente importante para status 'offline'

### 2. **Ordem de Declaração Importa**
- Funções devem ser declaradas antes dos `useEffect` que as usam
- Helpers devem estar fora do componente

### 3. **Race Conditions São Reais**
- Adicione delays em operações de inicialização crítica
- Verifique disponibilidade de recursos antes de usar

### 4. **Status 'Offline' É Explícito**
- Se o dashboard marca como 'offline', o app deve respeitar
- Não tente "ser inteligente" e reconectar automaticamente

### 5. **LocalStorage Precisa de Verificações**
- Sempre verifique `typeof localStorage !== 'undefined'`
- Trate erros silenciosamente quando possível

---

## 📝 Próximos Passos para Prevenir

1. **Criar testes automatizados** para esses cenários críticos
2. **Documentar padrões de código** para nova equipe
3. **Code review checklist** baseado neste guia
4. **Monitoring** para detectar problemas em produção
5. **Alertas** quando status 'offline' é ignorado

---

**Última atualização:** Baseado nos aprendizados da branch `and-08`

