# Correções Críticas Implementadas

## 1. Sistema de Service Binding (✅ RESOLVIDO)

**Problema**: O plugin nunca conseguia referências aos serviços Android (`MyConnectionService` e `MyInCallService`) porque eles são criados pelo sistema, não pelo plugin.

**Solução**: Criado `ServiceRegistry.kt` - um singleton que gerencia as referências dos serviços:
- Serviços se registram quando criados (`onCreate()`)
- Serviços se desregistram quando destruídos (`onDestroy()`)
- Plugin usa `ServiceRegistry.getInCallService()` e `ServiceRegistry.getConnectionService()` para acessar

**Arquivos modificados**:
- `android/app/src/main/java/app/lovable/pbxmobile/ServiceRegistry.kt` (novo)
- `android/app/src/main/java/app/lovable/pbxmobile/PbxMobilePlugin.kt`
- `android/app/src/main/java/app/lovable/pbxmobile/MyConnectionService.kt`
- `android/app/src/main/java/app/lovable/pbxmobile/MyInCallService.kt`

## 2. Coroutine Job Fix (✅ RESOLVIDO)

**Problema**: Em `AutomatedCallingManager.kt`, o `job` era referenciado dentro da própria coroutine antes de existir (`coroutineContext[Job]!!` na linha 41).

**Solução**: Refatorado para criar o Job primeiro e passar para uma função interna:
```kotlin
// Antes (ERRADO):
val job = CoroutineScope(Dispatchers.IO).launch {
    val session = CallingSession(
        job = coroutineContext[Job]!!  // ❌ Circular!
    )
}

// Depois (CORRETO):
val job = CoroutineScope(Dispatchers.IO).launch {
    executeCallingSequenceInternal(sessionId, ..., coroutineContext[Job]!!)
}
```

**Arquivo modificado**:
- `android/app/src/main/java/app/lovable/pbxmobile/AutomatedCallingManager.kt`

## 3. Suporte a Múltiplos SIMs (✅ IMPLEMENTADO)

**Problema**: O Android não permite escolher qual SIM usar diretamente. O código usava sempre o SIM padrão do sistema.

**Solução**: Implementado sistema completo de PhoneAccount:

### 3.1. SimPhoneAccountManager
Novo gerenciador que:
- Registra um `PhoneAccount` para cada SIM detectado
- Permite escolher qual SIM usar para cada chamada
- Gerencia `PhoneAccountHandle` para cada SIM

**Arquivo criado**:
- `android/app/src/main/java/app/lovable/pbxmobile/SimPhoneAccountManager.kt`

### 3.2. SimCardInfo Data Class
Novo data class unificado para informações de SIM:
- Usado entre detector, plugin e gerenciador
- Inclui `subscriptionId` necessário para PhoneAccounts

**Arquivo criado**:
- `android/app/src/main/java/app/lovable/pbxmobile/SimCardInfo.kt`

### 3.3. Integração no Plugin
O plugin agora:
- Inicializa `SimPhoneAccountManager` no `load()`
- Registra PhoneAccounts quando `getSimCards()` é chamado
- Fornece métodos para obter `PhoneAccountHandle` por SIM ID
- Suporta parâmetro `simId` em `startCall()` e `startAutomatedCalling()`

### 3.4. Como Usar
```typescript
// Frontend TypeScript:
const { simCards } = await PbxMobile.getSimCards();
// simCards agora tem PhoneAccounts registrados

// Fazer chamada com SIM específico:
await PbxMobile.startCall({ 
  number: "+5511999999999",
  simId: simCards[0].id  // Escolhe qual SIM usar
});

// Automated calling com SIM específico:
await PbxMobile.startAutomatedCalling({
  numbers: [...],
  deviceId: "device-123",
  listId: "list-456",
  simId: simCards[1].id  // Usa SIM 2
});
```

## 4. Arquivos Modificados/Criados

### Novos Arquivos:
1. `ServiceRegistry.kt` - Gerenciador de referências de serviços
2. `SimPhoneAccountManager.kt` - Gerenciador de PhoneAccounts
3. `SimCardInfo.kt` - Data class unificado para SIM info
4. `CRITICAL_FIXES.md` - Esta documentação

### Arquivos Modificados:
1. `PbxMobilePlugin.kt` - Usa ServiceRegistry, SimPhoneAccountManager
2. `MyConnectionService.kt` - Registra-se no ServiceRegistry
3. `MyInCallService.kt` - Registra-se no ServiceRegistry
4. `AutomatedCallingManager.kt` - Corrige Job, suporta SIM selection
5. `SimCardDetector.kt` - Adiciona subscriptionId e método getSimCards()

## 5. Próximos Passos

Para usar as correções:
1. ✅ Código nativo corrigido
2. 🔄 Fazer `git pull` no projeto local
3. 🔄 Executar `npx cap sync android`
4. 🔄 Testar em dispositivo físico com múltiplos SIMs
5. 🔄 Atualizar interface frontend para permitir seleção de SIM

## 6. Notas Importantes

- **ROLE_DIALER**: Ainda necessário para Android 10+
- **Permissions**: `READ_PHONE_STATE` necessária para detectar SIMs
- **Testing**: Testar em dispositivo real com dual-SIM
- **PhoneAccount Registration**: Automático quando `getSimCards()` é chamado
- **Cleanup**: PhoneAccounts são desregistrados no `onDestroy()` do plugin
