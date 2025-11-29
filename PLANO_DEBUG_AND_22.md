# Plano de Debug - Branch and-22
## Validação de Campanha com Pool de 6 Chamadas Simultâneas

### Objetivo
Validar o funcionamento completo do sistema de campanha com pool de 6 chamadas simultâneas, onde:
- **6 chamadas são mantidas simultaneamente** (DIALING, RINGING, ACTIVE, HOLDING)
- **Nova chamada só é iniciada quando uma das 6 muda para DISCONNECTED** (ou qualquer estado final: BUSY, NO_ANSWER, FAILED, REJECTED, UNREACHABLE)
- **O sistema continua ligando automaticamente** até que a campanha seja encerrada manualmente (no app ou no dashboard)

---

## Fase 1: Preparação do Ambiente de Teste

### 1.1 Criar Lista de Teste
- **Ação**: Criar uma lista com pelo menos 20-30 números de teste
- **Números sugeridos**:
  - 5 números ocupados (simular com números conhecidos como ocupados)
  - 5 números não atendidos (números que não atendem)
  - 5 números válidos que atendem
  - 5 números inválidos/inalcançáveis
  - 10 números adicionais para teste de continuidade

### 1.2 Configurar Logs Detalhados
- **PowerDialerManager**: Já possui logs detalhados ✅
- **MobileApp.tsx**: Verificar se todos os eventos estão logados
- **Dashboard**: Verificar logs de comandos enviados

### 1.3 Preparar Monitoramento
- **Logcat**: Filtrar por `PowerDialerManager`, `MobileApp`, `dialerCallStateChanged`, `activeCallsChanged`
- **Dashboard**: Monitorar `active_calls_count` e status das chamadas em tempo real
- **Banco de Dados**: Verificar tabela `calls` e `devices` durante execução

---

## Fase 2: Testes de Funcionalidade Básica

### Teste 2.1: Início de Campanha
**Objetivo**: Validar que a campanha inicia corretamente e mantém 6 chamadas simultâneas

**Passos**:
1. Iniciar campanha com lista de teste
2. Verificar no logcat: `🚀 Campanha iniciada`
3. Verificar que 6 chamadas são iniciadas imediatamente
4. Verificar no dashboard: `active_calls_count = 6`
5. Verificar no app: Div "Chamadas Ativas" mostra 6 chamadas

**Critérios de Sucesso**:
- ✅ Campanha inicia sem erros
- ✅ Exatamente 6 chamadas são iniciadas simultaneamente
- ✅ Dashboard mostra `active_calls_count = 6`
- ✅ App mostra 6 chamadas ativas

---

### Teste 2.2: Manutenção do Pool (Chamada DISCONNECTED → Nova Inicia)
**Objetivo**: Validar que quando uma das 6 chamadas muda para DISCONNECTED (ou estado final), uma nova é iniciada automaticamente para manter o pool cheio

**Passos**:
1. Aguardar uma das 6 chamadas mudar para DISCONNECTED (ocupada, não atendida, etc.)
2. Verificar no logcat: `🔄 Estado: [callId] -> [estado anterior] → DISCONNECTED` seguido de `🔓 Chamada finalizada` e depois `📞 Preenchendo pool`
3. Verificar que uma nova chamada é iniciada automaticamente (dentro de 500ms - intervalo de verificação do pool)
4. Verificar que o pool se mantém com exatamente 6 chamadas ativas (ou próximo disso durante a transição)
5. Verificar no dashboard: `active_calls_count` se mantém em 6 (ou próximo durante transição)

**Critérios de Sucesso**:
- ✅ Quando uma chamada muda para DISCONNECTED, ela é removida de `activeCalls`
- ✅ Pool maintenance detecta o slot vazio e inicia uma nova chamada automaticamente
- ✅ Pool se mantém com 6 chamadas simultâneas (DIALING, RINGING, ACTIVE, HOLDING)
- ✅ Dashboard reflete corretamente o número de chamadas ativas
- ✅ Nova chamada só é iniciada quando uma das 6 termina (DISCONNECTED), não antes

---

## Fase 3: Testes de Cenários Específicos

### Teste 3.1: Chamada Ocupada (BUSY)
**Objetivo**: Validar tratamento de chamada ocupada

**Passos**:
1. Iniciar campanha com números conhecidos como ocupados
2. Aguardar chamada ser marcada como BUSY
3. Verificar no logcat: `📞 Chamada finalizada: [número] -> BUSY`
4. Verificar se há retry (se `maxRetries` permitir)
5. Verificar no dashboard: Status da chamada atualizado para `ended` com motivo `busy`

**Critérios de Sucesso**:
- ✅ Chamada ocupada é detectada corretamente e muda para BUSY → DISCONNECTED
- ✅ Status é atualizado no banco de dados
- ✅ Chamada é removida de `activeCalls` (libera slot no pool)
- ✅ Retry é executado se configurado (até `maxRetries`) - número é readicionado à fila
- ✅ Nova chamada é iniciada automaticamente para substituir a ocupada no pool (mantém 6 simultâneas)

---

### Teste 3.2: Chamada Não Atendida (NO_ANSWER)
**Objetivo**: Validar tratamento de chamada não atendida (timeout)

**Passos**:
1. Iniciar campanha com números que não atendem
2. Aguardar timeout (45s por padrão)
3. Verificar no logcat: `⏱️ Timeout da chamada` seguido de `📵 Chamada finalizada: [número] -> NO_ANSWER`
4. Verificar se há retry
5. Verificar no dashboard: Status atualizado para `ended` com motivo `no_answer`

**Critérios de Sucesso**:
- ✅ Timeout é aplicado corretamente (45s) para chamadas em DIALING/RINGING
- ✅ Chamada não atendida muda para NO_ANSWER → DISCONNECTED
- ✅ Chamada é removida de `activeCalls` (libera slot no pool)
- ✅ Retry é executado se configurado - número é readicionado à fila
- ✅ Nova chamada é iniciada automaticamente para substituir a não atendida no pool (mantém 6 simultâneas)

---

### Teste 3.3: Chamada Atendida e Encerrada (ACTIVE → DISCONNECTED)
**Objetivo**: Validar que chamadas atendidas permanecem ativas até serem encerradas

**Passos**:
1. Iniciar campanha com números que atendem
2. Aguardar chamada ser atendida
3. Verificar no logcat: `✅ Chamada atendida: [número]`
4. Verificar que a chamada permanece em ACTIVE (não é desconectada automaticamente)
5. Encerrar chamada manualmente (no app ou dashboard)
6. Verificar que nova chamada é iniciada para substituir

**Critérios de Sucesso**:
- ✅ Chamada atendida permanece em ACTIVE (não muda para DISCONNECTED automaticamente)
- ✅ Chamada atendida NÃO é desconectada automaticamente pelo `stopCampaign()` (apenas DIALING/RINGING são desconectadas)
- ✅ Chamada atendida permanece em `activeCalls` (não libera slot no pool)
- ✅ Ao encerrar manualmente (app ou dashboard), chamada muda para DISCONNECTED
- ✅ Quando encerrada manualmente, nova chamada é iniciada automaticamente para manter 6 simultâneas

---

### Teste 3.4: Chamada Inalcançável (UNREACHABLE)
**Objetivo**: Validar tratamento de números inválidos/inalcançáveis

**Passos**:
1. Iniciar campanha com números inválidos (ex: números com DDI incorreto)
2. Aguardar falha
3. Verificar no logcat: `🚫 Chamada finalizada: [número] -> UNREACHABLE`
4. Verificar se há retry limitado (máximo 2 tentativas)
5. Verificar no dashboard: Status atualizado para `ended` com motivo `unreachable`

**Critérios de Sucesso**:
- ✅ Números inalcançáveis são detectados e mudam para UNREACHABLE → DISCONNECTED
- ✅ Chamada é removida de `activeCalls` (libera slot no pool)
- ✅ Retry limitado (máximo 2 tentativas) - número é readicionado à fila
- ✅ Nova chamada é iniciada automaticamente para substituir a inalcançável no pool (mantém 6 simultâneas)

---

## Fase 4: Testes de Continuidade e Encerramento

### Teste 4.1: Continuidade da Campanha
**Objetivo**: Validar que a campanha continua ligando até ser encerrada manualmente

**Passos**:
1. Iniciar campanha com lista grande (30+ números)
2. Deixar campanha rodar por 5-10 minutos
3. Verificar que:
   - Pool se mantém próximo de 6 chamadas
   - Novas chamadas são iniciadas continuamente
   - Números são processados sequencialmente
   - Retries são executados conforme configurado
4. Verificar no dashboard: Progresso da campanha atualizado

**Critérios de Sucesso**:
- ✅ Campanha continua ligando indefinidamente até ser encerrada manualmente
- ✅ Pool se mantém estável com 6 chamadas simultâneas (DIALING, RINGING, ACTIVE, HOLDING)
- ✅ Quando uma chamada muda para DISCONNECTED, uma nova é iniciada automaticamente
- ✅ Números são processados continuamente (novos números ou retries)
- ✅ Dashboard mostra progresso correto e `active_calls_count` se mantém próximo de 6

---

### Teste 4.2: Encerramento pelo App (Smartphone)
**Objetivo**: Validar encerramento da campanha pelo botão no app

**Passos**:
1. Iniciar campanha
2. Aguardar algumas chamadas serem iniciadas
3. Clicar em "Encerrar Campanha" no app
4. Verificar no logcat: `🛑 Campanha parada`
5. Verificar que:
   - Chamadas em DIALING/RINGING são desconectadas
   - Chamadas em ACTIVE/HOLDING permanecem ativas (não são desconectadas)
   - Pool maintenance é encerrado
   - ForegroundService é parado
6. Verificar no dashboard:
   - `active_calls_count` atualizado corretamente
   - Chamadas pendentes marcadas como `ended`
   - Botão "Encerrar Campanha" desaparece

**Critérios de Sucesso**:
- ✅ Campanha é encerrada corretamente
- ✅ Chamadas atendidas (ACTIVE) NÃO são desconectadas
- ✅ Chamadas em DIALING/RINGING são desconectadas
- ✅ Dashboard reflete o encerramento
- ✅ `active_calls_count` é atualizado

---

### Teste 4.3: Encerramento pelo Dashboard
**Objetivo**: Validar encerramento da campanha pelo botão no dashboard

**Passos**:
1. Iniciar campanha
2. Aguardar algumas chamadas serem iniciadas
3. Clicar em "Encerrar Campanha" no dashboard (botão na aba Dispositivos)
4. Verificar no logcat: Comando `stop_campaign` recebido e processado
5. Verificar que:
   - Chamadas em DIALING/RINGING são desconectadas
   - Chamadas em ACTIVE/HOLDING permanecem ativas
   - Pool maintenance é encerrado
6. Verificar no dashboard:
   - `active_calls_count` atualizado
   - Botão "Encerrar Campanha" desaparece
   - Toast de confirmação exibido

**Critérios de Sucesso**:
- ✅ Comando `stop_campaign` é recebido e processado
- ✅ Campanha é encerrada corretamente
- ✅ Chamadas atendidas (ACTIVE) NÃO são desconectadas
- ✅ Dashboard reflete o encerramento
- ✅ Sincronização bidirecional funciona

---

## Fase 5: Testes de Sincronização

### Teste 5.1: Sincronização Bidirecional de Estado
**Objetivo**: Validar que mudanças no app refletem no dashboard e vice-versa

**Passos**:
1. Iniciar campanha
2. Encerrar uma chamada específica no app
3. Verificar no dashboard: Chamada é marcada como `ended`
4. Encerrar uma chamada específica no dashboard
5. Verificar no app: Chamada é encerrada no smartphone
6. Verificar `active_calls_count` em ambos os lados

**Critérios de Sucesso**:
- ✅ Encerrar no app → Dashboard atualiza
- ✅ Encerrar no dashboard → App atualiza
- ✅ `active_calls_count` sincronizado em ambos os lados

---

### Teste 5.2: Sincronização de `active_calls_count`
**Objetivo**: Validar que o contador de chamadas ativas está sempre sincronizado

**Passos**:
1. Iniciar campanha
2. Monitorar `active_calls_count` no dashboard
3. Verificar que:
   - Aumenta quando novas chamadas são iniciadas
   - Diminui quando chamadas terminam
   - Se mantém próximo de 6 durante a campanha
   - Atualiza apenas quando o valor muda (otimização)
4. Verificar logs: Atualizações não são excessivas (máximo a cada 30s ou quando muda)

**Critérios de Sucesso**:
- ✅ `active_calls_count` reflete o número real de chamadas ativas
- ✅ Atualizações não são excessivas (otimização funcionando)
- ✅ Sincronização é confiável

---

## Fase 6: Testes de Performance e Estabilidade

### Teste 6.1: Estabilidade em Longa Duração
**Objetivo**: Validar que o sistema permanece estável durante longas campanhas

**Passos**:
1. Iniciar campanha com lista grande (50+ números)
2. Deixar rodar por 30+ minutos
3. Monitorar:
   - Uso de memória (não deve aumentar continuamente)
   - Logs de erros (não deve haver erros críticos)
   - Pool se mantém estável
   - Dashboard continua responsivo

**Critérios de Sucesso**:
- ✅ Sem vazamentos de memória
- ✅ Sem erros críticos nos logs
- ✅ Pool se mantém estável
- ✅ Sistema permanece responsivo

---

### Teste 6.2: Múltiplas Campanhas Sequenciais
**Objetivo**: Validar que múltiplas campanhas podem ser executadas sequencialmente

**Passos**:
1. Iniciar e encerrar campanha 1
2. Iniciar campanha 2 imediatamente
3. Verificar que:
   - Estado da campanha 1 é limpo
   - Campanha 2 inicia corretamente
   - Pool funciona normalmente
4. Repetir 3-4 vezes

**Critérios de Sucesso**:
- ✅ Estado é limpo entre campanhas
- ✅ Novas campanhas iniciam corretamente
- ✅ Sem resíduos de campanhas anteriores

---

## Checklist de Validação Final

### Funcionalidades Core
- [ ] Pool de 6 chamadas simultâneas funciona
- [ ] Manutenção automática do pool funciona
- [ ] Retry inteligente funciona
- [ ] Timeout de 45s funciona
- [ ] Chamadas atendidas permanecem ativas

### Cenários de Chamada
- [ ] Chamada ocupada (BUSY) tratada corretamente
- [ ] Chamada não atendida (NO_ANSWER) tratada corretamente
- [ ] Chamada atendida (ACTIVE) permanece ativa
- [ ] Chamada inalcançável (UNREACHABLE) tratada corretamente

### Encerramento
- [ ] Encerramento pelo app funciona
- [ ] Encerramento pelo dashboard funciona
- [ ] Chamadas atendidas não são desconectadas ao encerrar
- [ ] Chamadas em DIALING/RINGING são desconectadas ao encerrar

### Sincronização
- [ ] Sincronização app → dashboard funciona
- [ ] Sincronização dashboard → app funciona
- [ ] `active_calls_count` está sempre correto
- [ ] Atualizações não são excessivas

### Performance
- [ ] Sistema estável em longa duração
- [ ] Sem vazamentos de memória
- [ ] Múltiplas campanhas sequenciais funcionam

---

## Comandos Úteis para Debug

### Logcat Filtrado
```bash
adb logcat -v time | grep -E '(PowerDialerManager|MobileApp|dialerCallStateChanged|activeCallsChanged|Sincronizado|active_calls_count|updateCallStatus|Chamada atendida|Call answered|disconnected|DISCONNECTED|ended|📞|📊|✅|❌|📥|Campanha|campaign|startCampaign|stopCampaign|end_call|endCall|broadcast|device-commands|handleCommand|Processando comando)'
```

### Verificar Chamadas no Banco
```sql
SELECT id, number, status, device_id, start_time, end_time 
FROM calls 
WHERE device_id = 'SEU_DEVICE_ID' 
ORDER BY start_time DESC 
LIMIT 20;
```

### Verificar Contador de Chamadas Ativas
```sql
SELECT id, name, status, active_calls_count 
FROM devices 
WHERE id = 'SEU_DEVICE_ID';
```

---

## Notas Importantes

1. **Pool de 6 Chamadas Simultâneas**: 
   - O sistema mantém **exatamente 6 chamadas simultâneas** em estados ativos (DIALING, RINGING, ACTIVE, HOLDING)
   - **Nova chamada só é iniciada quando uma das 6 muda para DISCONNECTED** (ou qualquer estado final)
   - O pool maintenance verifica a cada 500ms se há slots disponíveis e inicia novas chamadas automaticamente

2. **Estados Finais que Liberam Slot no Pool**:
   - DISCONNECTED: Chamada desconectada normalmente
   - BUSY: Linha ocupada
   - NO_ANSWER: Não atendeu (timeout de 45s)
   - FAILED: Falha na chamada
   - REJECTED: Chamada rejeitada
   - UNREACHABLE: Número inalcançável

3. **Chamadas Atendidas (ACTIVE/HOLDING)**:
   - **NÃO liberam slot no pool** - permanecem ativas até serem encerradas manualmente
   - **NÃO são desconectadas automaticamente** quando a campanha é encerrada (apenas DIALING/RINGING são desconectadas)
   - Quando encerradas manualmente, mudam para DISCONNECTED e liberam slot para nova chamada

4. **Retry Logic**: 
   - NO_ANSWER: até `maxRetries` (padrão 3) - número é readicionado à fila
   - BUSY: até `maxRetries` (padrão 3) - número é readicionado à fila
   - UNREACHABLE: máximo 2 tentativas - número é readicionado à fila
   - REJECTED: sem retry
   - FAILED: máximo 2 tentativas - número é readicionado à fila

5. **Timeout**: Chamadas em DIALING/RINGING têm timeout de 45s. Após esse tempo, são desconectadas e marcadas como NO_ANSWER → DISCONNECTED.

6. **Sincronização**: O `active_calls_count` é atualizado apenas quando o valor muda, com verificação periódica a cada 30s para garantir consistência.

7. **Continuidade**: A campanha continua ligando indefinidamente até ser encerrada manualmente (botão no app ou no dashboard). Não encerra automaticamente quando a lista termina - aguarda novos números ou retries.

