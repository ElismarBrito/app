# 📊 Análise do Logcat - Branch and-11

## ✅ **O QUE ESTÁ FUNCIONANDO**

1. **Campanha iniciada corretamente:**
   - ✅ Comando `start_campaign` recebido do dashboard
   - ✅ Campanha iniciada no plugin nativo (`PowerDialerManager`)
   - ✅ Pool de 6 chamadas simultâneas configurado
   - ✅ Retry de 3 tentativas configurado

2. **Chamada iniciada corretamente:**
   - ✅ Chamada discada: `*8486`
   - ✅ Estado `DIALING` detectado
   - ✅ Estado `ACTIVE` detectado (chamada atendida)
   - ✅ Chamada permaneceu ativa por ~37 segundos

3. **Eventos sendo disparados:**
   - ✅ `callStateChanged` disparado
   - ✅ `activeCallsChanged` disparado
   - ✅ `dialerCampaignProgress` disparado (a cada ~500ms)

---

## ❌ **PROBLEMA IDENTIFICADO**

### **Chamadas não estão sendo atualizadas no banco!**

**Evidências do logcat completo:**
- ❌ Não há logs de criação de chamada no banco quando a campanha inicia (13:38:45)
- ❌ Não há logs de atualização de status no banco (`Call X updated to Y`)
- ❌ Não há logs de `INSERT INTO calls` ou `UPDATE calls`
- ❌ Evento `dialerCallStateChanged` não tem listeners: `No listeners found for event dialerCallStateChanged`
- ❌ O trigger do banco não está sendo acionado porque as chamadas não existem no banco!

**Fluxo observado:**
1. ✅ Campanha iniciada corretamente (`start_campaign` recebido)
2. ✅ Chamadas sendo discadas (3 números)
3. ✅ Estados sendo detectados (DIALING → ACTIVE → HOLDING → DISCONNECTED)
4. ✅ Eventos nativos sendo disparados (`callStateChanged`, `activeCallsChanged`, `dialerCampaignProgress`)
5. ❌ **NENHUMA sincronização com banco de dados!**
6. ✅ Campanha concluída com sumário (13:40:56)

**Causa raiz:**
1. Quando a campanha é iniciada via `start_campaign`, ela usa o `PowerDialerManager` nativo
2. O `PowerDialerManager` gerencia as chamadas internamente, mas **NÃO cria/atualiza registros no banco**
3. O listener `callStateChanged` no `MobileApp.tsx` (linha 197-200) apenas atualiza o estado local, **não atualiza o banco**

**Código problemático:**
```typescript
// src/components/MobileApp.tsx - linha 197
PbxMobile.addListener('callStateChanged', async (event) => {
  console.log('Event: callStateChanged', event);
  if (event.state === 'disconnected') removeFromActive(event.callId);
  updateActiveCalls(); // ❌ Apenas atualiza estado local, não atualiza banco!
}),
```

---

## 🔧 **SOLUÇÃO**

### **Opção 1: Usar `useCallStatusSync` no `MobileApp.tsx`**

O `useCallStatusSync` já existe e está configurado no `useCallQueue`, mas **não está sendo usado** no fluxo de campanha porque a campanha usa o plugin nativo diretamente.

**Implementação:**
1. Criar um mapeamento de `callId` nativo → `callId` do banco no `MobileApp.tsx`
2. Quando a campanha inicia, criar os registros no banco ANTES de iniciar as chamadas
3. Usar `useCallStatusSync` para sincronizar mudanças de estado

### **Opção 2: Plugin nativo criar/atualizar chamadas no banco**

O `PowerDialerManager` poderia criar os registros no banco quando as chamadas são iniciadas, mas isso requer mudanças no código Kotlin.

### **Opção 3: Híbrida (RECOMENDADA)**

1. Quando a campanha é iniciada via `start_campaign`:
   - Criar os registros no banco ANTES de iniciar as chamadas no plugin nativo
   - Mapear `callId` nativo → `callId` do banco
   
2. Usar `useCallStatusSync` para sincronizar mudanças de estado:
   - Configurar `useCallStatusSync` no `MobileApp.tsx` com o mapeamento
   - Atualizar o banco automaticamente quando `callStateChanged` é disparado

---

## 📋 **PRÓXIMOS PASSOS**

1. ✅ **Identificar onde criar os registros no banco quando a campanha inicia**
   - Verificar se `useCallAssignments` está criando os registros (para campanhas via dashboard)
   - Se não, criar os registros ANTES de iniciar a campanha no plugin nativo

2. ✅ **Configurar `useCallStatusSync` no `MobileApp.tsx`**
   - Criar `callIdMap` e `startTimesMap` no `MobileApp.tsx`
   - Passar esses maps para `useCallStatusSync`
   - Atualizar o listener `callStateChanged` para popular o `callIdMap`

3. ✅ **Testar o trigger do banco**
   - Após criar/atualizar chamadas no banco, verificar se o trigger atualiza `active_calls_count`
   - Validar que o contador está correto no dashboard

---

## 🎯 **IMPACTO**

### **Sem a correção:**
- ❌ Chamadas não aparecem no histórico do banco
- ❌ Trigger não atualiza `active_calls_count`
- ❌ Dashboard não mostra estatísticas corretas
- ❌ Melhorias da branch `and-11` não funcionam para campanhas

### **Com a correção:**
- ✅ Chamadas aparecem no histórico do banco
- ✅ Trigger atualiza `active_calls_count` automaticamente
- ✅ Dashboard mostra estatísticas corretas
- ✅ Melhorias da branch `and-11` funcionam completamente

---

---

## ✅ **CORREÇÃO IMPLEMENTADA**

### **Implementação (2025-01-18):**

1. ✅ **Criação de registros no banco antes de iniciar campanha:**
   - Modificado `handleCommand` no `MobileApp.tsx` para criar registros no banco ANTES de chamar `PbxMobile.startCampaign()`
   - Cada número da lista recebe um registro com `status: 'queued'` e `session_id` único
   - Mapeamento temporário `number -> dbCallId` armazenado em `campaignNumberToDbCallIdRef`

2. ✅ **Mapeamento de callId nativo → dbCallId:**
   - Modificado listener `callStateChanged` no `MobileApp.tsx` para mapear `callId` nativo → `dbCallId` baseado no número
   - Quando o evento `callStateChanged` é disparado com `number`, o sistema busca o `dbCallId` correspondente no mapeamento temporário
   - Após mapear, o `dbCallId` é armazenado em `callMapRef` para uso pelo `useCallStatusSync`

3. ✅ **Configuração do `useCallStatusSync`:**
   - Adicionado `useCallStatusSync` no `MobileApp.tsx` com `callMapRef.current` e `startTimesRef.current`
   - O hook agora sincroniza automaticamente mudanças de estado das chamadas de campanha com o banco

4. ✅ **Melhorias no `useCallStatusSync`:**
   - Adicionado suporte para estados adicionais: `busy`, `failed`, `no_answer`, `rejected`, `unreachable`
   - Melhorado cálculo de duração para chamadas que terminam com falha
   - Adicionados logs mais informativos para depuração

### **Resultado Esperado:**

Após a implementação, quando uma campanha for iniciada:
1. ✅ Registros serão criados no banco ANTES de iniciar as chamadas nativas
2. ✅ Quando `callStateChanged` for disparado, o sistema mapeará `callId` nativo → `dbCallId`
3. ✅ O `useCallStatusSync` atualizará automaticamente o banco com mudanças de estado
4. ✅ O trigger `active_calls_count` será acionado automaticamente
5. ✅ O dashboard mostrará estatísticas corretas em tempo real

---

---

## 🔍 **ANÁLISE DO NOVO LOGCAT (2025-01-20)**

### ❌ **NOVO PROBLEMA IDENTIFICADO:**

**Erro ao criar registros no banco:**
- ❌ `❌ Erro ao criar registro para 996167107: [object Object]`
- ❌ `❌ Erro ao criar registro para 996424402: [object Object]`
- ❌ O erro está sendo logado como `[object Object]`, não mostrando os detalhes

**Causa possível:**
1. Problema com RLS (Row Level Security) - o usuário pode não ter permissão para criar registros
2. Problema com o ENUM - o status `'queued'` pode não ser válido
3. Problema com campos obrigatórios - algum campo pode estar faltando

**Correção aplicada:**
- ✅ Melhorado tratamento de erros para exibir detalhes completos do erro
- ✅ Adicionada verificação se `dbCall` existe antes de usar
- ✅ Logs detalhados de erro incluindo `message`, `details`, `hint`, `code`

**Próximos passos:**
1. Recompilar e testar para ver o erro completo
2. Verificar RLS policies no banco
3. Verificar se o ENUM `call_status_enum` tem o valor `'queued'`
4. Verificar se todos os campos obrigatórios estão sendo enviados

---

**Documento criado em**: 2025-01-18  
**Última atualização**: 2025-01-20  
**Status**: 🔄 **CORREÇÃO IMPLEMENTADA - ERRO IDENTIFICADO - AGUARDANDO NOVO TESTE**

