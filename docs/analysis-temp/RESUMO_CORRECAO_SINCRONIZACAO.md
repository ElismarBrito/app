# ✅ Resumo da Correção de Sincronização de Chamadas de Campanha

## 🎯 Problema Identificado

As chamadas iniciadas via campanha (`start_campaign`) não estavam sendo registradas ou atualizadas no banco de dados. Isso impedia que:
- O histórico de chamadas fosse exibido no dashboard
- O `active_calls_count` fosse atualizado pelo trigger
- As estatísticas da campanha fossem corretas

## 🔍 Causa Raiz

1. O `PowerDialerManager` nativo gerencia as chamadas internamente
2. Quando `PbxMobile.startCampaign()` era chamado, não havia criação de registros no banco ANTES de iniciar as chamadas
3. O `useCallStatusSync` estava configurado apenas no `useCallQueue`, não no `MobileApp.tsx` para campanhas
4. Não havia mapeamento entre `callId` nativo (gerado pelo Android) e `callId` do banco (gerado pelo Supabase)

## ✅ Solução Implementada

### 1. Criação de Registros no Banco Antes da Campanha

**Arquivo**: `src/components/MobileApp.tsx`

No `handleCommand` para `case 'start_campaign'`:
- Cria registros no banco para cada número ANTES de chamar `PbxMobile.startCampaign()`
- Cada registro recebe `status: 'queued'` e um `session_id` único
- Armazena mapeamento temporário `number -> dbCallId` em `campaignNumberToDbCallIdRef`

```typescript
// Criar registros no banco ANTES de iniciar campanha nativa
for (const number of numbersToCall) {
  const { data: dbCall } = await supabase
    .from('calls')
    .insert({
      user_id: user!.id,
      device_id: deviceId!,
      number: number,
      status: 'queued',
      campaign_id: command.data.listId,
      session_id: sessionId,
      start_time: new Date().toISOString()
    })
    .select()
    .single();
  
  campaignNumberToDbCallIdRef.current.set(number, dbCall.id);
}
```

### 2. Mapeamento de callId Nativo → dbCallId

**Arquivo**: `src/components/MobileApp.tsx`

No listener `callStateChanged`:
- Quando o evento é disparado com `number`, busca o `dbCallId` correspondente
- Mapeia `callId` nativo → `dbCallId` no `callMapRef`
- Remove do mapeamento temporário após mapear

```typescript
PbxMobile.addListener('callStateChanged', async (event) => {
  // Mapear callId nativo → dbCallId se ainda não mapeado
  if (!callMapRef.current.has(event.callId) && event.number) {
    const dbCallId = campaignNumberToDbCallIdRef.current.get(event.number);
    if (dbCallId) {
      callMapRef.current.set(event.callId, dbCallId);
      campaignNumberToDbCallIdRef.current.delete(event.number);
    }
  }
  // ... resto do código
});
```

### 3. Configuração do useCallStatusSync

**Arquivo**: `src/components/MobileApp.tsx`

- Adicionado `useCallStatusSync(callMapRef.current, startTimesRef.current)`
- Adicionado `startTimesRef` para rastrear tempo de início das chamadas
- O hook sincroniza automaticamente mudanças de estado com o banco

### 4. Melhorias no useCallStatusSync

**Arquivo**: `src/hooks/useCallStatusSync.ts`

- Suporte para estados adicionais: `busy`, `failed`, `no_answer`, `rejected`, `unreachable`
- Todos esses estados mapeiam para `status: 'ended'` no banco
- Cálculo de duração melhorado para chamadas que terminam com falha
- Logs mais informativos para depuração

```typescript
const statusMap: Record<string, string> = {
  'dialing': 'ringing',
  'ringing': 'ringing',
  'active': 'answered',
  'answered': 'answered',
  'holding': 'answered',
  'disconnected': 'ended',
  'busy': 'ended',
  'failed': 'ended',
  'no_answer': 'ended',
  'rejected': 'ended',
  'unreachable': 'ended'
};
```

## 📊 Fluxo Corrigido

1. **Dashboard envia comando `start_campaign`** → `MobileApp.tsx` recebe
2. **Criação de registros no banco** → Cada número recebe um registro com `status: 'queued'`
3. **Início da campanha nativa** → `PbxMobile.startCampaign()` é chamado
4. **Chamadas nativas iniciadas** → `PowerDialerManager` gera `callId` único para cada chamada
5. **Evento `callStateChanged` disparado** → Inclui `callId`, `state`, `number`
6. **Mapeamento automático** → `callId` nativo é mapeado para `dbCallId` baseado no `number`
7. **Sincronização automática** → `useCallStatusSync` atualiza o banco com mudanças de estado
8. **Trigger acionado** → `active_calls_count` é atualizado automaticamente

## 🎯 Resultado Esperado

Após a implementação:

✅ **Chamadas aparecem no histórico do banco**  
✅ **Trigger atualiza `active_calls_count` automaticamente**  
✅ **Dashboard mostra estatísticas corretas em tempo real**  
✅ **Melhorias da branch `and-11` funcionam completamente para campanhas**  
✅ **Histórico completo de tentativas, durações e status**

## 🧪 Próximos Passos para Teste

1. Compilar e instalar o app no telefone
2. Iniciar uma campanha pelo dashboard
3. Verificar logs no logcat:
   - ✅ Logs de criação de registros: `✅ Registro criado: {number} -> {dbCallId}`
   - ✅ Logs de mapeamento: `🔗 Mapeado callId nativo {callId} -> dbCallId {dbCallId}`
   - ✅ Logs de atualização: `✅ Chamada {dbCallId} atualizada para {status}`
4. Verificar no banco:
   - ✅ Registros criados com `status: 'queued'`
   - ✅ Status atualizados para `ringing`, `answered`, `ended`
   - ✅ `active_calls_count` atualizado corretamente
5. Verificar no dashboard:
   - ✅ Chamadas aparecem no histórico
   - ✅ Estatísticas corretas em tempo real

---

**Data de implementação**: 2025-01-18  
**Status**: ✅ **IMPLEMENTADO - AGUARDANDO TESTE**

