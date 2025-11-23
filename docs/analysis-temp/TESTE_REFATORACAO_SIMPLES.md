# 🧪 Teste Simples: Validar Refatoração

## ⚡ Validação Rápida (5 minutos)

### **1. ✅ Verificar Índices no Banco**

Execute no Supabase Dashboard → SQL Editor:

```sql
-- Script rápido para validar índices
SELECT 
    CASE 
        WHEN COUNT(*) = 7 THEN '✅ Todos os 7 índices compostos foram criados!'
        ELSE '⚠️ Apenas ' || COUNT(*)::text || ' de 7 índices foram criados.'
    END AS resultado
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
  );
```

**✅ Deve mostrar:** "✅ Todos os 7 índices compostos foram criados!"

---

### **2. ✅ Testar se Índice Está Sendo Usado**

Execute com um `user_id` real do seu banco:

```sql
-- Verificar se o índice idx_calls_user_status está sendo usado
EXPLAIN ANALYZE
SELECT * FROM calls 
WHERE user_id = (SELECT id FROM auth.users LIMIT 1)
  AND status IN ('ringing', 'answered', 'dialing')
LIMIT 10;
```

**✅ Deve aparecer:** `Index Scan using idx_calls_user_status`

**❌ Se aparecer:** `Seq Scan on calls` → Índice não está sendo usado (problema!)

---

### **3. ✅ Testar no Dashboard**

1. Abra o Dashboard no navegador
2. Pressione **F12** para abrir DevTools
3. Vá na aba **Network**
4. Recarregue a página (**F5**)
5. Procure por requisições que começam com `rest/v1/`
6. Clique em uma requisição
7. Veja a aba **Headers** ou **Payload**

**✅ Resultado Esperado:**
- URLs devem ter filtros como `status=in.('ringing','answered')`
- Tempo de resposta < 200ms
- Dashboard carrega rapidamente

---

### **4. ✅ Testar Função Otimizada no Console**

1. Abra o Dashboard no navegador
2. Pressione **F12** para abrir DevTools
3. Vá na aba **Console**
4. Execute:

```javascript
// Verificar se as funções existem (executar no console do navegador)
// Precisa estar dentro de um componente React que usa usePBXData

// Exemplo: Criar um botão temporário para testar
const testRefactoring = async () => {
  // Isso precisa ser executado dentro do contexto React
  // Melhor: adicionar um botão temporário no dashboard para testar
};
```

**Melhor opção:** Testar visualmente no dashboard:
- Verifique se dispositivos online aparecem corretamente
- Verifique se chamadas ativas aparecem corretamente
- Verifique se tudo está rápido

---

## 📊 Comparação Visual

### **Antes (Sem Índices):**
- Dashboard demora 2-3 segundos para carregar
- Queries retornam todos os dados
- Filtro acontece no JavaScript (lento)

### **Depois (Com Índices):**
- Dashboard carrega em < 1 segundo ⚡
- Queries retornam apenas dados filtrados
- Filtro acontece no banco (rápido!)

---

## ✅ Checklist Rápido

- [ ] **Índices criados:** Execute o script SQL e veja "✅ 7 índices"
- [ ] **Índices usados:** `EXPLAIN ANALYZE` mostra `Index Scan`
- [ ] **Dashboard rápido:** Carrega em < 1 segundo
- [ ] **Dados corretos:** Dispositivos online e chamadas ativas aparecem corretamente

---

## 🎯 Resultado

**Se todos os itens do checklist estiverem ✅:**
- ✅ Refatoração funcionou!
- ✅ Índices estão sendo usados
- ✅ Performance melhorou

**Se algum item estiver ❌:**
- Verificar logs de erro
- Consultar `GUIA_VALIDACAO_REFATORACAO.md` para mais detalhes



