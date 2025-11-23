# 🔍 Explicação: Múltiplas Requisições (2000+)

## 📊 O Que Está Acontecendo?

### **Problema Identificado:**

Você está vendo **mais de 2000 requisições** no DevTools Network tab. Isso acontece porque:

1. **Subscriptions sendo recriadas constantemente**
   - O `useEffect` das subscriptions tem dependências que mudam frequentemente
   - Toda vez que `fetchDevices`, `fetchCalls`, `fetchLists` mudam, novas subscriptions são criadas
   - As subscriptions antigas não são limpas adequadamente
   - Resultado: múltiplas subscriptions ativas ao mesmo tempo

2. **Loop de Recriações**
   - Subscription criada → dispara evento → chama fetch → dados mudam → callbacks recriados → useEffect executa novamente → nova subscription criada
   - Isso cria um ciclo infinito de requisições

3. **Múltiplas Subscriptions Sobrepostas**
   - Várias subscriptions ouvindo a mesma tabela
   - Cada mudança no banco dispara múltiplas callbacks
   - Resultado: centenas ou milhares de requisições

---

## ✅ CORREÇÃO APLICADA

### **O Que Foi Corrigido:**

1. **Uso de `useRef` para funções estáveis:**
   ```typescript
   // Antes (PROBLEMA):
   useEffect(() => {
     // fetchDevices, fetchCalls, fetchLists mudam constantemente
     const debouncedFetch = debounce(fetchDevices, 300)
     // ...
   }, [user, fetchDevices, fetchCalls, fetchLists]) // ❌ Recria sempre!

   // Depois (CORRIGIDO):
   const fetchDevicesRef = useRef(fetchDevices)
   // Atualiza ref sem recriar subscription
   useEffect(() => {
     fetchDevicesRef.current = fetchDevices
   }, [fetchDevices])
   
   useEffect(() => {
     const debouncedFetch = debounce(() => fetchDevicesRef.current(), 300)
     // ...
   }, [user?.id]) // ✅ Só recria quando user muda!
   ```

2. **Canais únicos por usuário:**
   ```typescript
   // Canais únicos evitam conflitos
   .channel(`devices_channel_${user.id}`)
   .channel(`calls_channel_${user.id}`)
   ```

3. **Cleanup melhorado:**
   ```typescript
   return () => {
     subscription.unsubscribe()
     supabase.removeChannel(subscription) // ✅ Remove completamente
   }
   ```

---

## 🔍 ONDE ESTÁ O PROBLEMA?

### **No `usePBXData.ts` - Linha 478-524:**

**Problema original:**
```typescript
useEffect(() => {
  const debouncedFetchDevices = debounce(fetchDevices, 300)
  // ...
}, [user, fetchDevices, fetchCalls, fetchLists]) // ❌ PROBLEMA AQUI!
```

**Correção aplicada:**
```typescript
const fetchDevicesRef = useRef(fetchDevices)
// Atualiza ref sem recriar subscription
useEffect(() => {
  fetchDevicesRef.current = fetchDevices
}, [fetchDevices, fetchCalls, fetchLists])

useEffect(() => {
  const debouncedFetchDevices = debounce(() => fetchDevicesRef.current(), 300)
  // ...
}, [user?.id]) // ✅ Só user.id como dependência!
```

---

## 📊 RESULTADO ESPERADO

### **Antes (Com Problema):**
- ❌ 2000+ requisições
- ❌ Múltiplas subscriptions ativas
- ❌ Loop de recriações
- ❌ Dashboard lento e pesado

### **Depois (Corrigido):**
- ✅ 3-5 subscriptions (uma por tabela)
- ✅ Apenas 3 canais ativos
- ✅ Sem loops de recriação
- ✅ Dashboard rápido e leve

---

## 🧪 COMO VERIFICAR SE FOI CORRIGIDO

### **1. Limpar e Recarregar:**

1. **Feche todas as abas do Dashboard**
2. **Abra apenas uma aba do Dashboard**
3. **Pressione F12** → **Network tab**
4. **Clique no ícone de "Limpar"** (trash icon)
5. **Recarregue a página** (F5)

### **2. Verificar Subscriptions:**

No Console do DevTools (F12 → Console), você deve ver:
```
Setting up native event listeners...
```

E **NÃO deve ver** múltiplas mensagens repetidas.

### **3. Verificar Requisições:**

No Network tab, você deve ver:
- **Inicial:** ~3 requisições (devices, calls, lists)
- **Após carregar:** Poucas requisições (< 10)
- **Com filtro Fetch/XHR:** Apenas requisições do Supabase

---

## 🚨 SE AINDA TIVER MUITAS REQUISIÇÕES

### **Possíveis Causas Adicionais:**

1. **Outros hooks criando subscriptions:**
   - `useDeviceValidation` - valida dispositivos a cada 30 segundos
   - `useCallAssignments` - ouve chamadas atribuídas
   - `CallHistoryManager` - subscription para histórico

2. **Componentes múltiplos:**
   - Se há múltiplas instâncias do Dashboard aberto
   - Cada instância cria suas próprias subscriptions

3. **Cache do navegador:**
   - Limpar cache pode ajudar
   - Hard refresh: Ctrl+Shift+R

---

## ✅ VALIDAÇÃO FINAL

### **Execute este teste:**

1. **Fechar todas as abas** do Dashboard
2. **Abrir apenas uma aba**
3. **F12** → **Network tab**
4. **Limpar** (trash icon)
5. **Recarregar** (F5)
6. **Filtrar por "Fetch/XHR"**
7. **Contar requisições**

**✅ Resultado Esperado:**
- **< 10 requisições** após carregar
- **Requisições com filtros** na URL (status=in.('ringing','answered'))
- **Tempo de resposta < 200ms**

**❌ Se ainda tiver 100+ requisições:**
- Verificar se há múltiplas abas abertas
- Verificar console para erros
- Verificar outros hooks que podem estar criando subscriptions

---

## 📋 CHECKLIST DE VALIDAÇÃO

- [ ] Apenas uma aba do Dashboard aberta
- [ ] Network tab limpo antes de recarregar
- [ ] < 10 requisições após carregar
- [ ] Requisições têm filtros na URL
- [ ] Tempo de resposta < 200ms
- [ ] Console sem erros ou warnings repetidos

---

**Se todos os itens estiverem ✅ = Problema corrigido!**



