# 📐 Padrões de Código React - PBX Mobile

## 🎯 Organização de Componentes

### Estrutura Padrão

```typescript
import React, { useState, useEffect, useRef, useCallback } from 'react';
// ... outros imports

// ✅ Funções helper FORA do componente
const helperFunction = () => {
  // Lógica que não depende do componente
};

export const MeuComponente = () => {
  // 1. HOOKS DE CONTEXTO/AUTENTICAÇÃO
  const { user } = useAuth();
  const { toast } = useToast();
  
  // 2. HOOKS DE ESTADO
  const [state1, setState1] = useState(null);
  const [state2, setState2] = useState(false);
  
  // 3. REFS
  const ref1 = useRef(null);
  
  // 4. FUNÇÕES DO COMPONENTE (ANTES dos useEffect)
  const handleAction = useCallback(() => {
    // Lógica da função
  }, [dependencies]);
  
  const anotherFunction = () => {
    // Outra função
  };
  
  // 5. HOOKS CUSTOMIZADOS
  const { data } = useCustomHook();
  
  // 6. USEEFFECT HOOKS
  useEffect(() => {
    // Efeito 1
  }, [dependencies]);
  
  useEffect(() => {
    // Efeito 2
  }, [dependencies]);
  
  // 7. RENDER/RETURN
  return (
    // JSX
  );
};
```

---

## 🔧 Padrões Críticos

### 1. Funções Helper (Fora do Componente)

```typescript
// ✅ CORRETO - Função fora do componente
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
    console.error('❌ Erro:', error);
    return null;
  }
};

export const MobileApp = () => {
  // Usa getOrCreateDeviceId aqui
};

// ❌ ERRADO - Função dentro do componente (pode causar problemas)
export const MobileApp = () => {
  const getOrCreateDeviceId = () => {
    // Problema: Pode não estar disponível quando useEffect precisa
  };
  
  useEffect(() => {
    const id = getOrCreateDeviceId(); // Pode falhar
  }, []);
};
```

**Razão:** Funções helper precisam estar disponíveis desde o início e não devem ser recriadas a cada render.

---

### 2. Ordem de Declaração

```typescript
// ✅ CORRETO - Funções antes dos useEffect
export const MeuComponente = () => {
  // Funções declaradas PRIMEIRO
  const handleUnpaired = () => {
    // Lógica
  };
  
  const handleCommand = () => {
    // Lógica
  };
  
  // useEffect usa as funções DEPOIS
  useEffect(() => {
    if (condition) {
      handleUnpaired(); // ✅ OK: Função já foi declarada
    }
  }, []);
};

// ❌ ERRADO - useEffect antes das funções
export const MeuComponente = () => {
  useEffect(() => {
    handleUnpaired(); // ❌ ERRO: Função ainda não foi declarada
  }, []);
  
  const handleUnpaired = () => {
    // Lógica
  };
};
```

**Razão:** JavaScript precisa que funções sejam declaradas antes de serem usadas em algumas situações (especialmente em módulos).

---

### 3. Verificação de Recursos

```typescript
// ✅ CORRETO - Verificações robustas
const checkAndUseLocalStorage = () => {
  // Verifica window
  if (typeof window === 'undefined') {
    console.warn('Window não disponível');
    return null;
  }
  
  // Verifica localStorage
  if (typeof localStorage === 'undefined') {
    console.warn('localStorage não disponível');
    return null;
  }
  
  // Tenta usar com try-catch
  try {
    const value = localStorage.getItem('key');
    return value;
  } catch (error) {
    console.error('Erro ao acessar localStorage:', error);
    return null;
  }
};

// ❌ ERRADO - Acesso direto sem verificação
const badExample = () => {
  const value = localStorage.getItem('key'); // Pode quebrar em SSR ou Capacitor
};
```

**Razão:** `localStorage` e `window` podem não estar disponíveis em todos os ambientes (SSR, testes, inicialização).

---

### 4. Verificação de Status (Padrão CRÍTICO)

```typescript
// ✅ CORRETO - Sempre verificar ANTES de atualizar
const updateStatus = async (deviceId: string) => {
  // PASSO 1: Verifica status atual
  const { data: device, error } = await supabase
    .from('devices')
    .select('status')
    .eq('id', deviceId)
    .single();

  if (error || !device) {
    console.log('⚠️ Dispositivo não encontrado');
    return;
  }

  // PASSO 2: Valida se operação é permitida
  const deviceStatus = device.status?.toLowerCase()?.trim();
  if (deviceStatus === 'offline') {
    console.log('⚠️ Dispositivo desconectado, não atualizando');
    return; // NÃO atualiza se estiver offline
  }

  // PASSO 3: Apenas então atualiza
  await supabase
    .from('devices')
    .update({ status: 'online' })
    .eq('id', deviceId);
};

// ❌ ERRADO - Atualiza sem verificar
const badUpdate = async (deviceId: string) => {
  // Atualiza diretamente sem verificar status atual
  await supabase
    .from('devices')
    .update({ status: 'online' })
    .eq('id', deviceId);
};
```

**Razão:** Pode sobrescrever status 'offline' explicitamente setado pelo dashboard.

---

### 5. Delay em Inicialização

```typescript
// ✅ CORRETO - Delay para garantir inicialização
useEffect(() => {
  if (!user) return;

  const timeout = setTimeout(() => {
    const initialize = async () => {
      // Verifica recursos
      if (typeof localStorage === 'undefined') return;
      
      // Operações de inicialização
      const data = await fetchData();
      setData(data);
    };

    initialize();
  }, 500); // Delay de 500ms

  return () => clearTimeout(timeout);
}, [user]);

// ❌ ERRADO - Sem delay
useEffect(() => {
  if (!user) return;
  
  // Pode executar antes de recursos estarem prontos
  const data = localStorage.getItem('key');
}, [user]);
```

**Razão:** Capacitor e recursos do navegador podem não estar prontos imediatamente após o componente montar.

---

### 6. useCallback para Funções em Dependencies

```typescript
// ✅ CORRETO - useCallback para evitar recriação
const handleAction = useCallback(() => {
  // Lógica
}, [dependency1, dependency2]);

useEffect(() => {
  handleAction();
}, [handleAction]); // ✅ Seguro: handleAction é estável

// ❌ ERRADO - Função recriada a cada render
const handleAction = () => {
  // Lógica
};

useEffect(() => {
  handleAction();
}, [handleAction]); // ⚠️ handleAction muda a cada render
```

**Razão:** Evita loops infinitos em `useEffect` e melhora performance.

---

### 7. Case-Insensitive para Status

```typescript
// ✅ CORRETO - Case-insensitive
const deviceStatus = device.status?.toLowerCase()?.trim();
if (deviceStatus === 'offline') {
  // Trata offline
}

// ❌ ERRADO - Case-sensitive
if (device.status === 'offline') {
  // Pode não funcionar se vier 'Offline', 'OFFLINE', etc.
}
```

**Razão:** Banco de dados pode retornar status em diferentes cases, especialmente após migrations.

---

### 8. Logs Informativos

```typescript
// ✅ CORRETO - Logs com emojis e contexto
console.log('📱 DeviceId recuperado:', deviceId);
console.log('⚠️ Dispositivo desconectado, não restaurando');
console.log('✅ Pareamento restaurado:', device);
console.error('❌ Erro ao restaurar pareamento:', error);

// ❌ ERRADO - Logs genéricos
console.log('Device:', device);
console.log('Error:', error);
```

**Razão:** Facilita busca e debugging, especialmente em logs grandes.

---

### 9. Cleanup em useEffect

```typescript
// ✅ CORRETO - Sempre limpar recursos
useEffect(() => {
  const subscription = supabase
    .channel('my-channel')
    .on('postgres_changes', handler)
    .subscribe();

  return () => {
    // Cleanup: Remove subscription
    supabase.removeChannel(subscription);
  };
}, [dependencies]);

useEffect(() => {
  const timeout = setTimeout(() => {
    // Lógica
  }, 500);

  return () => {
    // Cleanup: Limpa timeout
    clearTimeout(timeout);
  };
}, [dependencies]);
```

**Razão:** Previne memory leaks e comportamentos inesperados quando componente desmonta.

---

### 10. Validação de Dados Restaurados

```typescript
// ✅ CORRETO - Valida no banco após restaurar
const restorePairing = async () => {
  const deviceId = localStorage.getItem('pbx_device_id');
  if (!deviceId) return;

  // Valida no banco
  const { data: device, error } = await supabase
    .from('devices')
    .select('*')
    .eq('id', deviceId)
    .eq('user_id', user.id)
    .single();

  if (error || !device) {
    // Limpa localStorage se não existe mais
    localStorage.removeItem('pbx_device_id');
    return;
  }

  // Verifica status
  if (device.status === 'offline') {
    localStorage.removeItem('pbx_is_paired');
    return;
  }

  // Restaura apenas se válido
  setDeviceId(device.id);
  setIsPaired(true);
};

// ❌ ERRADO - Confia apenas no localStorage
const badRestore = () => {
  const deviceId = localStorage.getItem('pbx_device_id');
  if (deviceId) {
    setDeviceId(deviceId); // Pode estar desatualizado
    setIsPaired(true);
  }
};
```

**Razão:** `localStorage` pode estar desatualizado se dispositivo foi desconectado em outra sessão.

---

## 📋 Checklist Antes de Commit

- [ ] Funções declaradas antes dos `useEffect`?
- [ ] Helpers estão fora do componente?
- [ ] Verificações de recursos (`localStorage`, `window`)?
- [ ] Status verificado ANTES de atualizar?
- [ ] `try-catch` em operações que podem falhar?
- [ ] Delay em inicialização crítica?
- [ ] Cleanup em `useEffect` que criam recursos?
- [ ] Logs informativos com emojis?
- [ ] Case-insensitive para comparações de status?
- [ ] `useCallback` para funções em dependencies?

---

**Última atualização:** Baseado nos aprendizados da branch `and-08`

