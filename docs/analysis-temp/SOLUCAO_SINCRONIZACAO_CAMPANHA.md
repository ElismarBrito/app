# 🔧 Solução: Sincronização de Campanhas com Banco de Dados

## 🎯 **PROBLEMA ATUAL**

Quando uma campanha é iniciada via `start_campaign`:
- ✅ O `PowerDialerManager` nativo gerencia as chamadas corretamente
- ✅ Os eventos `callStateChanged` são disparados
- ❌ **NENHUMA chamada é criada/atualizada no banco de dados**
- ❌ O trigger `active_calls_count` não funciona para campanhas
- ❌ O dashboard não mostra as chamadas da campanha

---

## 📋 **SOLUÇÃO: Implementar Sincronização**

### **Opção 1: Usar `useCallStatusSync` no `MobileApp.tsx` (RECOMENDADA)**

O `useCallStatusSync` já existe e funciona, mas **não está configurado** para campanhas.

**Passos:**

1. **Configurar mapeamento de CallIds no `MobileApp.tsx`:**
   ```typescript
   // Map para armazenar: callId nativo → callId do banco
   const campaignCallMapRef = useRef<Map<string, string>>(new Map());
   const campaignStartTimesRef = useRef<Map<string, number>>(new Map());
   ```

2. **Criar registros no banco quando a campanha inicia:**
   - Ao receber `start_campaign`, criar registros `calls` ANTES de iniciar o plugin nativo
   - Mapear cada número para um `callId` do banco

3. **Sincronizar eventos nativos com banco:**
   - Configurar `useCallStatusSync` com o `campaignCallMapRef`
   - Quando `callStateChanged` disparar, atualizar o banco automaticamente

4. **Mapear CallIds nativos para CallIds do banco:**
   - Quando o plugin nativo retornar um `callId`, associá-lo ao `callId` do banco correspondente
   - Usar o número da chamada como chave de associação

---

### **Opção 2: Plugin nativo criar/atualizar chamadas (ALTERNATIVA)**

Modificar `PowerDialerManager.kt` para criar/atualizar chamadas no banco via HTTP.

**Desvantagens:**
- Requer mudanças no código Kotlin
- Mais complexo (autenticação, tratamento de erros)
- Duplicação de lógica (React já tem código para isso)

---

## 🚀 **IMPLEMENTAÇÃO RECOMENDADA (Opção 1)**

### **Arquivos a modificar:**

1. **`src/components/MobileApp.tsx`:**
   - Adicionar `campaignCallMapRef` e `campaignStartTimesRef`
   - Modificar `handleCommand` para criar chamadas no banco ANTES de iniciar campanha
   - Configurar `useCallStatusSync` para campanhas

2. **`src/hooks/useCallStatusSync.ts`:**
   - Já existe e funciona! Apenas precisa ser usado corretamente

---

## 📝 **FLUXO PROPOSTO**

### **Quando campanha inicia:**

```typescript
// 1. Dashboard envia comando start_campaign
handleCommand({ command: 'start_campaign', data: { numbers: [...] } })

// 2. Criar registros no banco ANTES de iniciar plugin nativo
for (const number of numbers) {
  const { data: call } = await supabase
    .from('calls')
    .insert({
      user_id: user.id,
      device_id: deviceId,
      number: number,
      status: 'ringing',
      start_time: new Date().toISOString()
    })
    .select()
    .single();
  
  // Armazenar temporariamente: número → callId do banco
  pendingCallsMap.set(number, call.id);
}

// 3. Iniciar plugin nativo
await PbxMobile.startCampaign({ numbers });

// 4. Quando evento callStateChanged disparar, mapear:
// - callId nativo (do plugin) → número
// - número → callId do banco (do map pendente)
// - callId nativo → callId do banco (no campaignCallMapRef)
```

---

## ✅ **BENEFÍCIOS**

1. ✅ Chamadas aparecem no histórico do banco
2. ✅ Trigger `active_calls_count` funciona automaticamente
3. ✅ Dashboard mostra estatísticas corretas
4. ✅ Melhorias da branch `and-11` funcionam completamente
5. ✅ Reutiliza código existente (`useCallStatusSync`)

---

**Status**: 🔴 **AGUARDANDO IMPLEMENTAÇÃO**

