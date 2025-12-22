# Plano de Correção: UI não atualiza em tempo real

## Problema
Os números discados não aparecem na UI imediatamente. O usuário precisa desligar e ligar a tela para ver as chamadas.

## Análise da Causa Raiz

Após investigação detalhada do código, identifiquei que:

1. **O backend (Kotlin) está funcionando corretamente:**
   - `PowerDialerManager.makeCall()` cria a `ActiveCall` com estado `DIALING` ✅
   - `forceUIUpdate()` é chamado após adicionar a chamada ao mapa ✅
   - `performUIUpdate()` envia evento via `ServiceRegistry.getPlugin()?.updateActiveCalls()` ✅

2. **O problema está na WebView do Capacitor:**
   - O Capacitor WebView pode não processar eventos JavaScript quando a tela está desligada
   - O `notifyListeners` pode funcionar, mas a **WebView não re-renderiza** sem input do usuário
   - Ao ligar a tela, a WebView "acorda" e processa os eventos pendentes

## Solução Proposta

### Opção A: Forçar re-render no frontend React

Adicionar um mecanismo de polling periódico no `MobileApp.tsx` que força o fetch de chamadas ativas quando a tela fica visível novamente:

```typescript
// No MobileApp.tsx
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('📱 App visível - forçando atualização de chamadas');
      updateActiveCalls(true); // force sync
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

### Opção B: Adicionar logging para diagnóstico

Adicionar logs no plugin para confirmar que eventos estão sendo enviados:

```kotlin
fun updateActiveCalls(calls: List<Map<String, Any>>) {
    Log.d(TAG, "📊 updateActiveCalls: enviando ${calls.size} chamadas para frontend")
    // ...existing code...
}
```

### Opção C: Usar mecanismo nativo de notificação

Quando uma chamada é iniciada, enviar uma notificação Android que força o app a "acordar".

## Recomendação

Começar com **Opção A** (é a mais simples) e **Opção B** (para diagnóstico).

Se o problema persistir, partimos para a Opção C.

## Verificação

1. Compilar o app com as correções
2. Iniciar uma campanha de chamadas
3. Observar os logs do logcat para confirmar que eventos estão sendo enviados
4. Verificar se os números aparecem imediatamente na UI

## Arquivos a Modificar

1. `/Mobile/src/components/MobileApp.tsx` - Adicionar listener de visibilidade
2. `/Mobile/android/app/src/main/java/com/pbxmobile/app/PbxMobilePlugin.kt` - Adicionar logs
