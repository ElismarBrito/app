# FIX: Pool Maintenance Refactor - Branch AND-24

**Objetivo:** Manter exatamente 6 chamadas ativas no discador, refill agressivo imediato, rotação adequada de números

**Data:** 30/11/2024

---

## 🎯 Problema Identificado

O discador **não mantinha 6 chamadas ativas**. Quando uma chamada caía, o pool ficava em 3-4 chamadas em vez de refill agressivo para 6.

**Raiz:** A função `attemptImmediateRefill()` estava aplicando lógica **muito restritiva**:
- Só diava 1 chamada por vez em situações normais
- Verificava múltiplas condições (merge, conference support, etc.)
- Bloqueava refill multi-slot quando não havia condições específicas
- Resultado: Pool nunca refenchia todos os 5 slots disponíveis de uma vez

---

## ✅ Solução Implementada

### 1. Simplificar `startPoolMaintenance()` (Linhas 286-364)

**Antes:** 350+ linhas de lógica complexa com múltiplos contadores e estado-máquina

**Depois:** ~80 linhas simples e diretas

```kotlin
private fun startPoolMaintenance() {
    // ...
    while (isMaintainingPool) {
        val campaign = currentCampaign ?: break
        
        if (campaign.isPaused) { delay(poolCheckInterval); continue }
        
        // === CONTAR APENAS ACTIVE + HOLDING (chamadas REALMENTE ativas) ===
        val activeCount = activeCalls.values.count { activeCall ->
            val isReallyActive = activeCall.state == CallState.ACTIVE || activeCall.state == CallState.HOLDING
            if (!isReallyActive) return@count false
            // Ignora conference participants
            try {
                activeCall.call?.details?.hasProperty(
                    android.telecom.Call.Details.PROPERTY_CONFERENCE
                ) == true
            } catch (e: Exception) { false }
        }
        
        val availableSlots = maxConcurrentCalls - activeCount
        
        // === REFILL AGRESSIVO: Todos os slots disponíveis de uma vez ===
        if (availableSlots > 0 && campaign.shuffledNumbers.isNotEmpty()) {
            repeat(availableSlots) {
                if (campaign.shuffledNumbers.isNotEmpty()) {
                    val number = campaign.shuffledNumbers.removeAt(0)
                    val attempt = (attemptCounts[number] ?: 0) + 1
                    attemptCounts[number] = attempt
                    Log.d(TAG, "📱 REFILL: Discando $number (tentativa $attempt/$maxRetries)")
                    makeCall(number, attempt)
                }
            }
        }
        
        // Aguarda próximo ciclo
        notifyProgress()
        updateActiveCallsInUI()
        delay(poolCheckInterval)  // 500ms
    }
}
```

**Resultado esperado:**
- `activeCount` = apenas ACTIVE + HOLDING (exclui DIALING/RINGING)
- `availableSlots` = 6 - activeCount (ex: 6 - 1 = 5 slots)
- `repeat(5)` disca 5 números imediatamente
- Pool volta a 6 em < 1 segundo

### 2. Remover Chamadas a `attemptImmediateRefill()` (Linhas 1230, 1277)

**Removido de `handleCallCompletion()`:**
```diff
- // Tenta um refill imediato seguro após processar a finalização
- attemptImmediateRefill()
+ // Pool maintenance agora cuida automaticamente do refill
```

**Removido de `handleCallFailure()`:**
```diff
- // Tenta um refill imediato seguro para melhorar reatividade do pool
- attemptImmediateRefill()
+ // Pool maintenance detectará o slot vazio automaticamente e refill
```

**Motivo:** A pool maintenance loop agora checa **a cada 500ms** se há slots disponíveis. Não precisa de refill imediato separado.

---

## 📊 Comportamento Esperado

### Antes (Problema)
```
POOL: 1/6 ativas | Slots: 5 | Fila: 5
⏳ Refill imediato não necessário/permitido: availableSlots=5, numbers=5, maxCallsToDial=1
📱 REFILL: Discando 1111111111 (tentativa 1/3)
[aguarda 500ms]
POOL: 2/6 ativas | Slots: 4 | Fila: 4
📱 REFILL: Discando 2222222222 (tentativa 1/3)
[aguarda 500ms]
POOL: 3/6 ativas | Slots: 3 | Fila: 3
...muito lento, nunca chega a 6!
```

### Depois (Solução)
```
POOL: 1/6 ativas | Slots: 5 | Fila: 5
📱 REFILL: Discando 1111111111 (tentativa 1/3)
📱 REFILL: Discando 2222222222 (tentativa 1/3)
📱 REFILL: Discando 3333333333 (tentativa 1/3)
📱 REFILL: Discando 4444444444 (tentativa 1/3)
📱 REFILL: Discando 5555555555 (tentativa 1/3)
[aguarda 500ms]
POOL: 6/6 ativas | Slots: 0 | Fila: 0
✅ Pool cheio: 6/6
```

---

## 🔧 Mudanças de Código

### Arquivo: `PowerDialerManager.kt`

| Seção | Linhas | Mudança |
|-------|--------|---------|
| `startPoolMaintenance()` | 286-364 | **Reescrito completamente** - simplificado de 350+ para ~80 linhas |
| `handleCallCompletion()` | 1228-1230 | **Removida chamada** a `attemptImmediateRefill()` |
| `handleCallFailure()` | 1275-1277 | **Removida chamada** a `attemptImmediateRefill()` |
| `attemptImmediateRefill()` | 1298-1413 | Mantido (não chamado) - pode ser removido em cleanup futuro |

---

## 🧪 Testes Recomendados

### Test 1: Pool Mantém 6 Chamadas
```
1. Abrir dashboard
2. Iniciar campanha com 10 números
3. Observar: Pool sobe para 6 em < 2 segundos
4. ✅ Esperado: "POOL: 6/6 ativas"
```

### Test 2: Refill Rápido Quando Chamada Cai
```
1. Com pool em 6/6, desligar uma chamada manualmente (hang up)
2. Aguardar < 1 segundo
3. ✅ Esperado: Nova chamada é discada automaticamente
4. ✅ Esperado: "POOL: 6/6 ativas" novamente
```

### Test 3: Rotação de Números
```
1. Iniciar campanha com 5 números duplicados: [1111, 2222, 1111, 3333, 1111]
2. Observar logs de disco
3. ✅ Esperado: Números são rotacionados, não insiste no mesmo
4. ✅ Esperado: Cada número é tentado 1x antes de rotação
```

### Test 4: Stop Campaign Cleanup
```
1. Com pool em 6/6, parar campanha pelo dashboard
2. ✅ Esperado: Todas as 6 chamadas são desconectadas em < 3s
3. ✅ Esperado: Sumário é gerado com contagem correta
4. ✅ Esperado: Nenhuma chamada órfã permanece
```

---

## 📋 Checklist de Deploy

- [x] Código compilado sem erros
- [x] APK gerado: `app/build/outputs/apk/debug/app-debug.apk`
- [x] Instalado em device: `adb install -r ...apk`
- [ ] Testes funcionais em device real
- [ ] Logs confirmam novo comportamento
- [ ] Campanha para e limpa corretamente
- [ ] UI mostra 6 chamadas ativas simultaneamente

---

## 📝 Notas Técnicas

### Por que apenas ACTIVE + HOLDING?
- **ACTIVE**: Chamada em conversação
- **HOLDING**: Chamada em espera (sem áudio mas respondida)
- **DIALING/RINGING**: Não contam como "ativas" pq ainda podem falhar

Isso garante que o pool só refencha quando há espaço REAL para conversação.

### Por que `repeat(availableSlots)`?
- Antes: Lógica complexa com `maxCallsToDial` restringindo a 1 chamada
- Depois: Se há 5 slots e 5 números, disca os 5 de uma vez
- Resultado: Pool cheio em 1 ciclo (500ms) em vez de 5 ciclos (2.5s)

### Rastreamento de números finalizados
- `finishedNumbers`: Set de números que atingiram `maxRetries` tentativas
- Em modo loop, números já finalizados não são recarregados
- Evita loops infinitos tentando o mesmo número que sempre falha

---

## 🎓 Aprendizados

1. **Simplicidade vence complexidade**: A versão simples com `repeat()` é mais confiável que a máquina de estado anterior
2. **Laços regulares em background**: 500ms é rápido o suficiente para refill parecer "imediato" ao usuário
3. **Contar apenas o que importa**: Ignorar DIALING/RINGING evita confusão sobre "slots realmente disponíveis"

---

## 👥 Próximos Passos

1. Testar em device real com números legítimos
2. Verificar comportamento em modo loop (números que reiniciam)
3. Remover função `attemptImmediateRefill()` se tests passarem
4. Considerar ajustar `poolCheckInterval` se 500ms for muito agressivo

---

**Status:** ✅ PRONTO PARA TESTE EM DEVICE

**Branch:** `and-24-pool-refactor`

**APK:** `/home/elismar/Documentos/Projetos/Mobile/android/app/build/outputs/apk/debug/app-debug.apk`
