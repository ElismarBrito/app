# 🔧 Correções Importantes do Projeto

## 📋 Registro de Correções Críticas

---

## ✅ Correção 1: Plugin Não Carregava (MainActivity vs MainApplication)

**Data:** Dezembro 2024  
**Status:** ✅ Resolvido  
**Prioridade:** 🔴 Crítica

### Problema:
O plugin não estava sendo carregado, causando:
- ❌ Permissões não funcionavam
- ❌ SIM cards não eram detectados
- ❌ Campanhas não funcionavam
- ❌ PowerDialerManager não era inicializado
- ❌ SimPhoneAccountManager não era inicializado

### Sintomas:
- App compilava normalmente
- App abria normalmente
- Mas funcionalidades não funcionavam:
  - `requestAllPermissions()` não funcionava
  - `getSimCards()` não funcionava
  - `startCampaign()` não funcionava

### Causa Raiz:

1. **MainApplication criava Bridge separado:**
   ```kotlin
   // MainApplication.kt (ANTES)
   mBridge = Bridge.Builder(this)
       .setPlugins(plugins)
       .create()
   ```
   - Este Bridge nunca era usado pelo BridgeActivity
   - Criava **DUAS instâncias do plugin**:
     - **Plugin 1** (no Bridge do MainApplication - não usado)
     - **Plugin 2** (no Bridge do MainActivity - usado)
   - Cada plugin tinha seu próprio **PowerDialerManager**:
     - **PowerDialerManager 1** (do Plugin 1)
     - **PowerDialerManager 2** (do Plugin 2)

2. **Problema de Duplicidade:**
   - **ServiceRegistry** só mantém UMA referência do plugin (a última)
   - Plugin 1 era registrado primeiro → `ServiceRegistry.plugin = Plugin 1`
   - Plugin 2 era registrado depois → `ServiceRegistry.plugin = Plugin 2` (substitui Plugin 1)
   - **Conflito de instâncias:**
     - Chamadas criadas pelo Plugin 2
     - Serviços (MyInCallService) podem ter referência ao Plugin 1
     - Estado das chamadas fica em PowerDialerManager 2
     - Serviços tentam notificar PowerDialerManager 1 (que não tem estado)
     - **Resultado:** Chamadas não funcionam, ligações em curso não aparecem

3. **Consequências da Duplicidade:**
   - **Chamadas criadas, mas estado não rastreado:**
     - Plugin 2 cria chamada → PowerDialerManager 2 rastreia
     - MyInCallService notifica → PowerDialerManager 1 (instância errada)
     - Estado fica desincronizado
   - **Ligações em curso não aparecem:**
     - Estado está em PowerDialerManager 2
     - Frontend consulta PowerDialerManager 1 (instância errada)
     - Lista de chamadas vazia ou desatualizada
   - **Campanhas não funcionam:**
     - PowerDialerManager 2 inicia campanha
     - Serviços notificam PowerDialerManager 1
     - Estado não sincronizado entre instâncias

### Solução:

#### 1. MainActivity.kt - Registro Manual do Plugin

**ANTES:**
```kotlin
package com.pbxmobile.app

import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity()
// Plugin não registrado!
```

**DEPOIS:**
```kotlin
package com.pbxmobile.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Registra o plugin manualmente ANTES de super.onCreate()
        // Isso garante que o plugin seja carregado corretamente
        registerPlugin(PbxMobilePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

**Importante:**
- ✅ Registro deve ser ANTES de `super.onCreate()`
- ✅ Garante que plugin seja carregado no Bridge correto
- ✅ Método `load()` será chamado corretamente

#### 2. MainApplication.kt - Remover Bridge Separado

**ANTES:**
```kotlin
class MainApplication : Application() {
    private var mBridge: Bridge? = null

    override fun onCreate() {
        super.onCreate()

        val plugins = ArrayList<Class<out Plugin>>()
        plugins.add(PbxMobilePlugin::class.java)
        
        mBridge = Bridge.Builder(this)
            .setPlugins(plugins)
            .create()
    }
}
```

**DEPOIS:**
```kotlin
class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Plugin é registrado manualmente no MainActivity
        // Não é necessário criar Bridge aqui, pois BridgeActivity cria seu próprio Bridge
    }
}
```

**Importante:**
- ✅ Removido Bridge separado (não necessário)
- ✅ Bridge é criado automaticamente pelo BridgeActivity
- ✅ Plugin deve ser registrado no MainActivity, não no MainApplication

### Resultado:

Após correção:
- ✅ **Apenas UMA instância do plugin:**
  - Plugin registrado apenas no MainActivity
  - ServiceRegistry mantém referência única
  - Sem conflito de instâncias
- ✅ **Apenas UMA instância do PowerDialerManager:**
  - PowerDialerManager inicializado uma vez
  - Estado das chamadas sincronizado
  - Serviços notificam a instância correta
- ✅ **Chamadas funcionam corretamente:**
  - Chamadas criadas e rastreadas pela mesma instância
  - Estado sincronizado entre serviços e manager
  - Ligações em curso aparecem corretamente
- ✅ **Campanhas funcionam:**
  - PowerDialerManager único gerencia campanhas
  - Estado sincronizado
  - Notificações funcionam corretamente
- ✅ **Permissões funcionam:**
  - Plugin carrega corretamente
  - Método `load()` é chamado
  - Managers são inicializados
- ✅ **SIM cards são detectados:**
  - SimPhoneAccountManager inicializado
  - Detecção de SIM funciona

### Arquivos Alterados:

1. `android/app/src/main/java/com/pbxmobile/app/MainActivity.kt`
   - Adicionado registro manual do plugin
   - Registro antes de `super.onCreate()`

2. `android/app/src/main/java/com/pbxmobile/app/MainApplication.kt`
   - Removido Bridge separado
   - Removido registro duplicado do plugin

### Fluxo Correto (SEM Duplicidade):

```
1. App inicia
   ↓
2. MainApplication.onCreate() é chamado
   - NÃO cria Bridge (removido)
   - Apenas inicializa Application
   ↓
3. MainActivity.onCreate() é chamado
   ↓
4. registerPlugin(PbxMobilePlugin::class.java) - REGISTRA PLUGIN (ÚNICO)
   ↓
5. super.onCreate() - BridgeActivity cria Bridge e carrega plugin
   ↓
6. PbxMobilePlugin.load() é chamado (ÚNICA INSTÂNCIA)
   ↓
7. Managers são inicializados (ÚNICA INSTÂNCIA):
   - PowerDialerManager(context) - INSTÂNCIA ÚNICA
   - SimPhoneAccountManager(context) - INSTÂNCIA ÚNICA
   ↓
8. ServiceRegistry.registerPlugin(this) - REGISTRA PLUGIN ÚNICO
   ↓
9. Serviços (MyInCallService, MyConnectionService) são criados
   ↓
10. Serviços notificam Plugin ÚNICO → PowerDialerManager ÚNICO
   ↓
11. Estado sincronizado → Tudo funciona! ✅
```

### Fluxo Problemático (COM Duplicidade):

```
1. App inicia
   ↓
2. MainApplication.onCreate() é chamado
   ↓
3. Cria Bridge 1 → Carrega Plugin 1
   ↓
4. Plugin 1.load() é chamado
   ↓
5. Plugin 1 inicializa PowerDialerManager 1
   ↓
6. ServiceRegistry.registerPlugin(Plugin 1) - Plugin 1 registrado
   ↓
7. MainActivity.onCreate() é chamado
   ↓
8. registerPlugin(PbxMobilePlugin::class.java) - Registra Plugin 2
   ↓
9. super.onCreate() - BridgeActivity cria Bridge 2 e carrega Plugin 2
   ↓
10. Plugin 2.load() é chamado
   ↓
11. Plugin 2 inicializa PowerDialerManager 2 (INSTÂNCIA DIFERENTE!)
   ↓
12. ServiceRegistry.registerPlugin(Plugin 2) - Plugin 1 SUBSTITUÍDO por Plugin 2
   ↓
13. PROBLEMA: Duas instâncias do PowerDialerManager!
   - PowerDialerManager 1 (do Plugin 1 - não usado mais)
   - PowerDialerManager 2 (do Plugin 2 - ativo)
   ↓
14. Chamadas criadas pelo Plugin 2 → PowerDialerManager 2 rastreia
   ↓
15. Serviços podem ter referência ao Plugin 1 → PowerDialerManager 1 (ERRADO!)
   ↓
16. Estado desincronizado → Chamadas não funcionam ❌
```

### Testes Realizados:

- ✅ App compila corretamente
- ✅ App abre corretamente
- ✅ Permissões são solicitadas
- ✅ SIM cards são detectados
- ✅ Campanhas funcionam
- ✅ Pool de chamadas funciona

### Notas Importantes:

1. **NUNCA remover o registro manual do MainActivity**
   - É essencial para o funcionamento do app
   - Sem ele, plugin não carrega

2. **NUNCA criar Bridge no MainApplication**
   - Causa **duplicidade de instâncias do plugin**
   - Cada instância tem seu próprio PowerDialerManager
   - Estado das chamadas fica desincronizado
   - **Resultado:** Chamadas não funcionam, ligações em curso não aparecem

3. **Ordem importa:**
   - Registro do plugin ANTES de `super.onCreate()`
   - Garante que plugin seja carregado no Bridge correto
   - Evita duplicidade de instâncias

4. **ServiceRegistry mantém apenas UMA referência:**
   - Se houver duas instâncias, a última substitui a primeira
   - Serviços podem ter referência à instância errada
   - **Resultado:** Estado desincronizado, chamadas não funcionam

5. **PowerDialerManager deve ser ÚNICO:**
   - Cada instância do plugin cria seu próprio manager
   - Estado das chamadas fica em instâncias diferentes
   - **Resultado:** Chamadas criadas em uma instância, notificadas em outra

### Referências:

- Arquivo: `PROJECT_CONTEXT.md` - Seção "Problemas Conhecidos"
- Arquivo: `MainActivity.kt` - Linha 10 (registro manual)
- Arquivo: `MainApplication.kt` - Linha 8 (comentário explicativo)

---

## 📝 Como Evitar Este Problema no Futuro:

1. **Sempre registrar plugins manualmente no MainActivity**
   - Antes de `super.onCreate()`
   - Para plugins customizados do Capacitor

2. **NUNCA criar Bridge no MainApplication**
   - BridgeActivity cria seu próprio Bridge
   - Criar Bridge separado causa conflito

3. **Verificar se plugin está carregando:**
   - Adicionar log no método `load()`
   - Verificar se managers são inicializados
   - Verificar se callbacks são configurados

4. **Testar funcionalidades após mudanças:**
   - Permissões
   - SIM cards
   - Campanhas
   - Pool de chamadas

---

**Última Atualização:** Dezembro 2024  
**Status:** ✅ Correção Aplicada e Testada

