# ✅ Checklist de Validação - Branch and-12

## 🎯 Objetivo
Validar que a comunicação otimizada entre dashboard e dispositivos está funcionando corretamente.

---

## 📋 Checklist de Testes

### **1. Teste Básico - Dashboard Escuta ACKs**
- [ ] Abrir dashboard no navegador
- [ ] Abrir console do navegador (F12)
- [ ] Verificar logs: `ACK channel device:${deviceId}:acks subscription status: SUBSCRIBED`
- [ ] **Resultado esperado:** Canal de ACK inscrito para cada dispositivo online

---

### **2. Teste - Enviar Comando e Receber ACK**
- [ ] No dashboard, selecionar um dispositivo online
- [ ] Clicar em "Fazer Chamada" ou "Iniciar Campanha"
- [ ] **No console do dashboard, verificar:**
  - [ ] Log: `📤 Comando enviado: ${command} para dispositivo ${deviceId}`
  - [ ] Log: `📥 ACK recebido do dispositivo ${deviceId}: { commandId, status: 'received' }`
  - [ ] Log: `📥 ACK recebido do dispositivo ${deviceId}: { commandId, status: 'processed' }`
  - [ ] Log: `✅ Comando ${commandId} enviado com sucesso`
- [ ] **No console do app mobile, verificar:**
  - [ ] Log: `📥 Comando recebido: { commandId, command, deviceId }`
  - [ ] Log: `✅ Comando ${commandId} processado com sucesso`

**Resultado esperado:** Comando enviado → ACK received → Processado → ACK processed

---

### **3. Teste - Retry Automático (Falha Simulada)**
**Simular falha:** Desligar internet do dispositivo por 3 segundos após receber comando
- [ ] Enviar comando do dashboard
- [ ] Desligar internet do dispositivo imediatamente após receber
- [ ] **No console do dashboard, verificar:**
  - [ ] Log: `⏱️ Timeout aguardando ACK do comando ${commandId}`
  - [ ] Log: `🔄 Retentando comando ${commandId} (tentativas restantes: 2)`
  - [ ] Log: `🔄 Retentando comando ${commandId} (tentativas restantes: 1)`
  - [ ] Reativar internet e verificar se comando é processado na 2ª ou 3ª tentativa

**Resultado esperado:** Sistema tenta 3 vezes antes de falhar

---

### **4. Teste - Timeout Configurado**
- [ ] Enviar comando para dispositivo offline
- [ ] **No console do dashboard, verificar:**
  - [ ] Após ~5 segundos: `⏱️ Timeout aguardando ACK do comando ${commandId}`
  - [ ] Após retries: `❌ Comando ${commandId} falhou após 3 tentativas`
  - [ ] Toast de erro aparecendo: "Erro de Comunicação"

**Resultado esperado:** Timeout de 5 segundos respeitado, retry funcionando

---

### **5. Teste - Dispositivo Fica Online/Offline**
- [ ] Com dashboard aberto, parear um novo dispositivo
- [ ] **No console do dashboard, verificar:**
  - [ ] Log: `ACK channel device:${newDeviceId}:acks subscription status: SUBSCRIBED`
- [ ] Desparear dispositivo
- [ ] **Verificar:**
  - [ ] Canal de ACK é removido automaticamente (sem logs de erro)

**Resultado esperado:** Canais gerenciados dinamicamente conforme status dos dispositivos

---

### **6. Teste - Múltiplos Comandos Simultâneos**
- [ ] Enviar 3 comandos diferentes para o mesmo dispositivo rapidamente
- [ ] **Verificar:**
  - [ ] Todos os comandos são enviados
  - [ ] Todos recebem ACK individual
  - [ ] Nenhum comando é perdido ou misturado

**Resultado esperado:** Cada comando tem seu próprio ID e ACK

---

### **7. Teste - DevicesTab Usando Serviço Otimizado**
- [ ] No dashboard, ir para aba "Dispositivos"
- [ ] Clicar em "Fazer Chamada" via menu do dispositivo
- [ ] **Verificar:**
  - [ ] Toast aparece: "Comando Enviado"
  - [ ] Comando chega no dispositivo
  - [ ] ACK é recebido

**Resultado esperado:** DevicesTab usando comunicação otimizada

---

### **8. Teste - Validação de Dispositivo**
- [ ] No dashboard, atualizar status de um dispositivo
- [ ] **No console, verificar:**
  - [ ] Log: `✅ Validation request sent to device ${deviceId} (command ID: ...)`

**Resultado esperado:** Validação usando comunicação otimizada

---

## 🐛 Problemas Conhecidos a Verificar

### **Problema 1: ACKs não estão chegando**
**Sintomas:**
- Comandos são enviados mas nunca recebem ACK
- Timeouts acontecem mesmo com dispositivo online

**Causas possíveis:**
- Canal de ACK não está sendo inscrito corretamente
- Dispositivo não está enviando ACK de volta
- Nome do canal está diferente

**Verificação:**
```javascript
// No console do dashboard:
// Verificar se canais estão ativos
```

---

### **Problema 2: Retry não funciona**
**Sintomas:**
- Timeout acontece mas não tenta novamente
- Comando falha imediatamente

**Causas possíveis:**
- Timer não está sendo configurado corretamente
- Retry está sendo chamado mas falhando imediatamente

---

### **Problema 3: Múltiplos ACKs para mesmo comando**
**Sintomas:**
- Múltiplos logs de ACK para o mesmo commandId

**Causa possível:**
- Dispositivo está enviando ACK múltiplas vezes
- Listener está sendo registrado múltiplas vezes

---

## 📊 Logs Esperados (Sequência Correta)

### **Dashboard:**
```
1. ACK channel device:${deviceId}:acks subscription status: SUBSCRIBED
2. 📤 Comando enviado: ${command} para dispositivo ${deviceId} (ID: ${commandId})
3. 📥 ACK recebido do dispositivo ${deviceId}: { commandId: '...', status: 'received' }
4. 📥 ACK recebido do dispositivo ${deviceId}: { commandId: '...', status: 'processed' }
5. ✅ Comando ${commandId} enviado com sucesso para dispositivo ${deviceId}
```

### **App Mobile:**
```
1. 📥 Comando recebido: { id: '...', command: '...', device_id: '...' }
2. ✅ Comando ${commandId} processado com sucesso
```

---

## ✅ Critérios de Sucesso

**A comunicação otimizada está funcionando se:**
- ✅ Todos os comandos recebem ACK de confirmação
- ✅ Retry funciona após timeout
- ✅ Toast aparece para feedback visual
- ✅ Múltiplos comandos funcionam simultaneamente
- ✅ Canais são gerenciados dinamicamente
- ✅ Não há comandos perdidos

---

**Data do teste:** _____________  
**Testado por:** _____________  
**Status:** ⬜ Passou  ⬜ Falhou  ⬜ Parcial

