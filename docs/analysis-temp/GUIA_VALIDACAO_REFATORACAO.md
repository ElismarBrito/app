# 🔍 Guia de Validação: Refatoração de Índices Compostos

## 📋 Como Saber se as Refatorações Funcionaram

### **Data:** 2025-01-21

---

## ✅ 1. VALIDAÇÃO DOS ÍNDICES NO BANCO

### **Teste 1: Verificar se os Índices Existem**

Execute no Supabase Dashboard → SQL Editor:

```sql
-- Verificar todos os índices compostos criados
SELECT 
    tablename AS tabela,
    indexname AS indice,
    indexdef AS definicao
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname = 'idx_devices_user_status' OR
    indexname = 'idx_calls_device_status' OR
    indexname = 'idx_calls_user_status' OR
    indexname = 'idx_calls_user_device' OR
    indexname = 'idx_calls_device_start_time' OR
    indexname = 'idx_qr_sessions_user_valid' OR
    indexname = 'idx_number_lists_user_active'
  )
ORDER BY tablename, indexname;
```

**✅ Resultado Esperado:** 7 índices devem aparecer na lista

---

### **Teste 2: Verificar se os Índices Estão Sendo Usados**

Execute com um `user_id` real do seu banco:

```sql
-- Teste: idx_calls_user_status
EXPLAIN ANALYZE
SELECT * FROM calls 
WHERE user_id = 'seu-user-id-aqui' 
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC
LIMIT 100;
```

**✅ Resultado Esperado:**
```
Index Scan using idx_calls_user_status on calls
```
**❌ Se aparecer `Seq Scan`:** O índice não está sendo usado (problema!)

---

### **Teste 3: Verificar Performance Antes vs Depois**

```sql
-- Medir tempo de execução
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM calls 
WHERE user_id = 'seu-user-id-aqui' 
  AND status IN ('ringing', 'answered', 'dialing')
ORDER BY start_time DESC
LIMIT 100;
```

**✅ Resultado Esperado:**
- **Execution Time:** < 50ms (muito rápido!)
- **Buffers:** Poucos (eficiente)
- **Index Scan:** Aparece no resultado

---

## ✅ 2. VALIDAÇÃO NO CÓDIGO

### **Teste 1: Verificar se as Funções Otimizadas Estão Disponíveis**

No console do navegador (F12), execute:

```javascript
// Verificar se as funções existem
const { fetchOnlineDevices, fetchActiveCalls, fetchActiveLists } = usePBXData();
console.log('fetchOnlineDevices:', typeof fetchOnlineDevices);
console.log('fetchActiveCalls:', typeof fetchActiveCalls);
console.log('fetchActiveLists:', typeof fetchActiveLists);
```

**✅ Resultado Esperado:** Todas as funções devem ser `function`

---

### **Teste 2: Testar Função fetchOnlineDevices()**

No console do navegador:

```javascript
// Testar busca de dispositivos online
const { fetchOnlineDevices } = usePBXData();
const onlineDevices = await fetchOnlineDevices();
console.log('Dispositivos online:', onlineDevices.length);
console.log('Dispositivos:', onlineDevices);
```

**✅ Resultado Esperado:**
- Apenas dispositivos com `status = 'online'` devem aparecer
- Deve ser mais rápido que buscar todos e filtrar

---

### **Teste 3: Testar Função fetchActiveCalls()**

No console do navegador:

```javascript
// Testar busca de chamadas ativas
const { fetchActiveCalls } = usePBXData();
const activeCalls = await fetchActiveCalls();
console.log('Chamadas ativas:', activeCalls.length);
console.log('Chamadas:', activeCalls);
```

**✅ Resultado Esperado:**
- Apenas chamadas com status `ringing`, `answered`, `dialing`, `queued`
- Nenhuma chamada `ended` ou `completed` deve aparecer
- Deve ser mais rápido que buscar todas e filtrar

---

### **Teste 4: Testar Função fetchActiveLists()**

No console do navegador:

```javascript
// Testar busca de listas ativas
const { fetchActiveLists } = usePBXData();
const activeLists = await fetchActiveLists();
console.log('Listas ativas:', activeLists.length);
console.log('Listas:', activeLists);
```

**✅ Resultado Esperado:**
- Apenas listas com `is_active = true` devem aparecer
- Deve ser mais rápido que buscar todas e filtrar

---

## ✅ 3. VALIDAÇÃO DE PERFORMANCE NO DASHBOARD

### **Teste 1: Medir Tempo de Carregamento**

1. Abra o Dashboard
2. Abra o DevTools (F12) → Network tab
3. Recarregue a página (F5)
4. Procure por requisições ao Supabase (requests que começam com `rest/v1/`)

**✅ Resultado Esperado:**
- Requisições devem ser mais rápidas (< 200ms cada)
- Menos dados transferidos (menor tamanho das respostas)
- Menos requisições (se aplicável)

---

### **Teste 2: Verificar Queries Executadas**

1. Abra o Dashboard
2. Abra o DevTools (F12) → Network tab
3. Recarregue a página (F5)
4. Clique em uma requisição ao Supabase
5. Veja a aba "Payload" ou "Preview"

**✅ Resultado Esperado:**
- Queries devem ter filtros `.eq('status', 'online')` ou `.in('status', [...])`
- Não deve buscar todos os dados e filtrar no cliente

---

### **Teste 3: Comparar Antes vs Depois**

**Antes (sem índices):**
```
GET /rest/v1/calls?select=*&user_id=eq.xxx
→ Retorna 1000 chamadas (500KB)
→ Filtra no JavaScript
→ Tempo total: ~800ms
```

**Depois (com índices):**
```
GET /rest/v1/calls?select=*&user_id=eq.xxx&status=in.('ringing','answered')
→ Retorna 50 chamadas (25KB)
→ Não precisa filtrar no JavaScript
→ Tempo total: ~30ms ⚡ 26x mais rápido!
```

---

## ✅ 4. VALIDAÇÃO VISUAL NO DASHBOARD

### **Teste 1: Dashboard Carrega Mais Rápido**

1. Abra o Dashboard
2. Observe o tempo de carregamento
3. Veja se os dados aparecem rapidamente

**✅ Resultado Esperado:**
- Dashboard deve carregar em < 1 segundo
- Dados devem aparecer quase instantaneamente
- Sem travamentos ou lentidão

---

### **Teste 2: Dispositivos Online Aparecem Corretamente**

1. Vá para a aba "Dispositivos"
2. Verifique se apenas dispositivos online aparecem como "conectados"
3. Verifique se o contador está correto

**✅ Resultado Esperado:**
- Apenas dispositivos com `status = 'online'` devem contar como conectados
- Contador deve estar correto
- Lista deve aparecer rapidamente

---

### **Teste 3: Chamadas Ativas Aparecem Corretamente**

1. Vá para a aba "Chamadas"
2. Verifique se apenas chamadas ativas aparecem na seção "Chamadas Ativas"
3. Verifique se chamadas encerradas aparecem no histórico

**✅ Resultado Esperado:**
- Apenas chamadas com status ativo (`ringing`, `answered`, `dialing`) na seção ativa
- Chamadas `ended` ou `completed` apenas no histórico
- Dados devem aparecer rapidamente

---

## ✅ 5. VALIDAÇÃO COM LOGS

### **Teste 1: Verificar Logs das Queries**

No console do navegador (F12):

```javascript
// Interceptar queries do Supabase
const originalFrom = supabase.from.bind(supabase);
supabase.from = function(table) {
  const query = originalFrom(table);
  console.log(`Query em ${table}:`, query);
  return query;
};
```

**✅ Resultado Esperado:**
- Queries devem incluir filtros `.eq()` e `.in()` 
- Não deve buscar todos os dados

---

### **Teste 2: Medir Tempo de Execução**

No console do navegador:

```javascript
// Medir tempo de fetchOnlineDevices
console.time('fetchOnlineDevices');
const { fetchOnlineDevices } = usePBXData();
const devices = await fetchOnlineDevices();
console.timeEnd('fetchOnlineDevices');
console.log(`${devices.length} dispositivos encontrados`);
```

**✅ Resultado Esperado:**
- Tempo deve ser < 100ms
- Apenas dispositivos online devem ser retornados

---

## ✅ 6. CHECKLIST DE VALIDAÇÃO COMPLETA

### **Banco de Dados:**
- [ ] 7 índices compostos foram criados
- [ ] Índices aparecem na validação SQL
- [ ] `EXPLAIN ANALYZE` mostra `Index Scan` 
- [ ] Queries executam em < 50ms

### **Código:**
- [ ] Funções `fetchOnlineDevices()`, `fetchActiveCalls()`, `fetchActiveLists()` existem
- [ ] Funções retornam apenas dados filtrados
- [ ] Funções executam rapidamente

### **Dashboard:**
- [ ] Dashboard carrega mais rápido (< 1s)
- [ ] Dispositivos online aparecem corretamente
- [ ] Chamadas ativas aparecem corretamente
- [ ] Sem travamentos ou lentidão

### **Performance:**
- [ ] Queries retornam menos dados (83% menos bandwidth)
- [ ] Queries executam mais rápido (76% mais rápido)
- [ ] Dashboard responde melhor

---

## 🚨 PROBLEMAS COMUNS E SOLUÇÕES

### **Problema 1: Índices não estão sendo usados**

**Sintoma:** `EXPLAIN ANALYZE` mostra `Seq Scan` ao invés de `Index Scan`

**Solução:**
```sql
-- Atualizar estatísticas do PostgreSQL
ANALYZE calls;
ANALYZE devices;
ANALYZE number_lists;
```

---

### **Problema 2: Dashboard ainda está lento**

**Sintoma:** Dashboard ainda demora para carregar

**Possíveis causas:**
1. Índices não foram criados
2. Código ainda está filtrando no cliente
3. Há muitas requisições simultâneas

**Solução:**
- Verificar se os índices foram criados
- Verificar se o código está usando as funções otimizadas
- Verificar no DevTools quantas requisições estão sendo feitas

---

### **Problema 3: Funções retornam dados incorretos**

**Sintoma:** `fetchOnlineDevices()` retorna dispositivos offline

**Solução:**
- Verificar se a query está usando `.eq('status', 'online')`
- Verificar no DevTools a query exata que está sendo executada
- Verificar se o filtro está sendo aplicado no banco

---

## 📊 EXEMPLO DE TESTE COMPLETO

### **Passo 1: Validar Índices no Banco**

```sql
-- Executar no Supabase Dashboard
\i supabase/scripts/validate_indexes_quick.sql
```

**✅ Resultado:** Deve mostrar "✅ Todos os 7 índices compostos foram criados!"

---

### **Passo 2: Testar Performance**

```sql
-- Testar query otimizada
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM calls 
WHERE user_id = 'seu-user-id' 
  AND status IN ('ringing', 'answered', 'dialing')
LIMIT 100;
```

**✅ Resultado:** 
- Execution Time: < 50ms
- Index Scan using idx_calls_user_status

---

### **Passo 3: Testar no Dashboard**

1. Abra o Dashboard no navegador
2. Abra DevTools (F12) → Network
3. Recarregue a página
4. Verifique as requisições

**✅ Resultado:**
- Requisições devem ter filtros na URL
- Tempo de resposta < 200ms
- Dados corretos exibidos

---

## ✅ CONCLUSÃO

**Se todos os testes passarem:**
- ✅ Refatoração funcionou corretamente!
- ✅ Índices estão sendo usados
- ✅ Performance melhorou
- ✅ Dashboard está mais rápido

**Se algum teste falhar:**
- ❌ Verificar logs de erro
- ❌ Verificar se os índices foram criados
- ❌ Verificar se o código está usando as funções otimizadas
- ❌ Consultar a seção "Problemas Comuns"

---

**Documento criado em:** 2025-01-21  
**Última atualização:** 2025-01-21

