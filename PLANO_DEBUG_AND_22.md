# Plano de Debug - Branch and-22
## Validação de Campanha com Pool de 6 Chamadas Simultâneas

### Objetivo
Validar o funcionamento completo do sistema de campanha com pool de 6 chamadas simultâneas, testando diferentes cenários (ocupada, não atendida, encerrada) e garantindo que o sistema continue ligando até ser encerrado manualmente.

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

### Teste 2.2: Manutenção do Pool (Chamada Termina → Nova Inicia)
**Objetivo**: Validar que quando uma chamada termina, uma nova é iniciada automaticamente

**Passos**:
1. Aguardar uma chamada terminar (ocupada, não atendida, etc.)
2. Verificar no logcat: `🔓 Chamada finalizada` seguido de `📞 Preenchendo pool`
3. Verificar que uma nova chamada é iniciada imediatamente
4. Verificar que o pool permanece com 6 chamadas ativas (ou próximo disso)
5. Verificar no dashboard: `active_calls_count` se mantém próximo de 6

**Critérios de Sucesso**:
- ✅ Quando uma chamada termina, uma nova é iniciada automaticamente
- ✅ Pool se mantém próximo de 6 chamadas ativas
- ✅ Dashboard reflete corretamente o número de chamadas ativas

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
- ✅ Chamada ocupada é detectada corretamente
- ✅ Status é atualizado no banco de dados
- ✅ Retry é executado se configurado (até `maxRetries`)
- ✅ Nova chamada substitui a ocupada no pool

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
- ✅ Timeout é aplicado corretamente (45s)
- ✅ Chamada não atendida é marcada como NO_ANSWER
- ✅ Retry é executado se configurado
- ✅ Nova chamada substitui a não atendida no pool

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
- ✅ Chamada atendida permanece em ACTIVE
- ✅ Chamada atendida NÃO é desconectada automaticamente pelo `stopCampaign()`
- ✅ Ao encerrar manualmente, nova chamada é iniciada
- ✅ Pool se mantém próximo de 6 chamadas

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
- ✅ Números inalcançáveis são detectados
- ✅ Retry limitado (máximo 2 tentativas)
- ✅ Nova chamada substitui a inalcançável no pool

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
- ✅ Campanha continua ligando indefinidamente
- ✅ Pool se mantém estável (próximo de 6)
- ✅ Números são processados sem parar
- ✅ Dashboard mostra progresso correto

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

1. **Chamadas Atendidas**: O sistema foi configurado para NÃO desconectar chamadas em estado ACTIVE ou HOLDING quando a campanha é encerrada. Isso é intencional para preservar chamadas que foram atendidas.

2. **Pool Maintenance**: O sistema verifica o pool a cada 500ms e inicia novas chamadas automaticamente quando há slots disponíveis.

3. **Retry Logic**: 
   - NO_ANSWER: até `maxRetries` (padrão 3)
   - BUSY: até `maxRetries` (padrão 3)
   - UNREACHABLE: máximo 2 tentativas
   - REJECTED: sem retry
   - FAILED: máximo 2 tentativas

4. **Timeout**: Chamadas em DIALING/RINGING têm timeout de 45s. Após esse tempo, são desconectadas e marcadas como NO_ANSWER.

5. **Sincronização**: O `active_calls_count` é atualizado apenas quando o valor muda, com verificação periódica a cada 30s para garantir consistência.

