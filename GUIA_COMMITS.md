# Guia de Organização de Commits

## 📋 Arquivos Modificados (Total: 22 arquivos)

### ✅ **ARQUIVOS QUE DEVEM SER COMMITADOS** (código-fonte e configuração importante)

#### **Commit 1: Correção do Bug do Merge Call**
```bash
# Arquivo único relacionado ao bug do merge call
android/app/src/main/java/com/pbxmobile/app/PowerDialerManager.kt
```
**Mensagem sugerida:**
```
fix(PowerDialerManager): corrige loop infinito no merge de chamadas

- Adiciona anti-spam com cooldown de 800ms entre tentativas
- Implementa deduplicação de pares para evitar re-tentar mesmas chamadas
- Verifica CAPABILITY_MANAGE_CONFERENCE antes de tentar merge
- Prefere chamadas ACTIVE como âncora para conferência
- Reduz spam de logs e tentativas desnecessárias

Resolve: Loop infinito tentando fazer merge das mesmas chamadas
```

---

#### **Commit 2: Correção do Carregamento do Plugin**
```bash
android/app/src/main/java/com/pbxmobile/app/MainActivity.kt
android/app/src/main/java/com/pbxmobile/app/MainApplication.kt  # (novo arquivo, se quiser incluir)
```
**Mensagem sugerida:**
```
fix(MainActivity): corrige carregamento do plugin no onCreate

- Registra plugin manualmente ANTES de super.onCreate()
- Garante que o plugin seja carregado corretamente no Bridge do Capacitor
- Remove código comentado desnecessário

Resolve: Plugin não era reconhecido, impedindo detecção de SIM e campanhas
```

---

#### **Commit 3: Ajustes nos Serviços Android**
```bash
android/app/src/main/java/com/pbxmobile/app/MyConnectionService.kt
android/app/src/main/java/com/pbxmobile/app/MyInCallService.kt
android/app/src/main/AndroidManifest.xml  # (se houver mudanças relevantes)
```
**Mensagem sugerida:**
```
fix(services): corrige extração de callId nos serviços de telecom

- Usa "callId" (minúsculo) para compatibilidade com PowerDialerManager
- Mantém fallback para "CALL_ID" (maiúsculo) para compatibilidade retroativa
- Melhora logs de debug nos serviços

Relacionado: Correção do bug do merge call
```

---

#### **Commit 4: Atualizações no Frontend**
```bash
src/components/CorporateDialer.tsx
src/components/MobileApp.tsx
src/plugins/pbx-mobile.ts
```
**Mensagem sugerida:**
```
feat(frontend): atualiza componentes para integração com power dialer

- Ajusta componentes React para trabalhar com novo sistema de pool
- Atualiza integração com plugin nativo
- Melhora feedback visual do progresso de campanhas

Relacionado: Implementação do pool de 6 chamadas simultâneas
```

---

### ❌ **ARQUIVOS QUE NÃO DEVEM SER COMMITADOS** (build/gerados/cache)

Estes arquivos são gerados automaticamente ou são específicos do IDE:

```bash
# Cache do IDE (IntelliJ/Android Studio)
.idea/caches/deviceStreaming.xml
.idea/deviceManager.xml  # (novo arquivo não rastreado)

# Arquivos de build gerados (devem estar no .gitignore)
android/app/src/main/assets/public/assets/index-BkHOuAkk.css  # (deletado - build antigo)
android/app/src/main/assets/public/assets/index-DK0BJWQX.js  # (deletado - build antigo)
android/app/src/main/assets/public/assets/web-BeOa4KI1.js  # (deletado - build antigo)
android/app/src/main/assets/public/assets/index-C_YM0H08.css  # (novo - build gerado)
android/app/src/main/assets/public/assets/index-D-Sr20Xf.js  # (novo - build gerado)
android/app/src/main/assets/public/assets/web-OQKaWmnK.js  # (novo - build gerado)
android/app/src/main/assets/public/index.html  # (se mudança for apenas de build)
```

**Ação:** Adicionar ao `.gitignore`:
```
# Build gerado
android/app/src/main/assets/public/assets/
android/app/src/main/assets/public/index.html

# Cache IDE
.idea/caches/
.idea/deviceManager.xml
```

---

### 📚 **ARQUIVOS DE DOCUMENTAÇÃO** (opcional - se quiser incluir)

```bash
ANDROID_STRUCTURE_ANALYSIS.md
CORRECOES_IMPORTANTES.md
PROJECT_CONTEXT.md
RESUMO_IMPLEMENTACAO_ANDROID.md
```

**Commit sugerido (opcional):**
```
docs: adiciona documentação do projeto Android

- Análise da estrutura do projeto
- Documentação de correções importantes
- Contexto geral do projeto
- Resumo das implementações
```

---

## 🚀 **Comandos para Executar os Commits**

### **1. Preparar .gitignore (se necessário)**
```bash
# Verificar se os arquivos de build já estão no .gitignore
cat .gitignore

# Se não estiver, adicionar:
echo "android/app/src/main/assets/public/assets/" >> .gitignore
echo ".idea/caches/" >> .gitignore
echo ".idea/deviceManager.xml" >> .gitignore
```

### **2. Commit 1: Bug do Merge Call**
```bash
git add android/app/src/main/java/com/pbxmobile/app/PowerDialerManager.kt
git commit -m "fix(PowerDialerManager): corrige loop infinito no merge de chamadas

- Adiciona anti-spam com cooldown de 800ms entre tentativas
- Implementa deduplicação de pares para evitar re-tentar mesmas chamadas
- Verifica CAPABILITY_MANAGE_CONFERENCE antes de tentar merge
- Prefere chamadas ACTIVE como âncora para conferência
- Reduz spam de logs e tentativas desnecessárias

Resolve: Loop infinito tentando fazer merge das mesmas chamadas"
```

### **3. Commit 2: Plugin Loading**
```bash
git add android/app/src/main/java/com/pbxmobile/app/MainActivity.kt
# Se MainApplication.kt for relevante, incluir também:
# git add android/app/src/main/java/com/pbxmobile/app/MainApplication.kt
git commit -m "fix(MainActivity): corrige carregamento do plugin no onCreate

- Registra plugin manualmente ANTES de super.onCreate()
- Garante que o plugin seja carregado corretamente no Bridge do Capacitor
- Remove código comentado desnecessário

Resolve: Plugin não era reconhecido, impedindo detecção de SIM e campanhas"
```

### **4. Commit 3: Serviços Android**
```bash
git add android/app/src/main/java/com/pbxmobile/app/MyConnectionService.kt
git add android/app/src/main/java/com/pbxmobile/app/MyInCallService.kt
git add android/app/src/main/AndroidManifest.xml
git commit -m "fix(services): corrige extração de callId nos serviços de telecom

- Usa \"callId\" (minúsculo) para compatibilidade com PowerDialerManager
- Mantém fallback para \"CALL_ID\" (maiúsculo) para compatibilidade retroativa
- Melhora logs de debug nos serviços

Relacionado: Correção do bug do merge call"
```

### **5. Commit 4: Frontend**
```bash
git add src/components/CorporateDialer.tsx
git add src/components/MobileApp.tsx
git add src/plugins/pbx-mobile.ts
git commit -m "feat(frontend): atualiza componentes para integração com power dialer

- Ajusta componentes React para trabalhar com novo sistema de pool
- Atualiza integração com plugin nativo
- Melhora feedback visual do progresso de campanhas

Relacionado: Implementação do pool de 6 chamadas simultâneas"
```

---

## 📊 **Resumo**

- **Commits recomendados:** 4 commits separados por funcionalidade
- **Arquivos de código:** 7 arquivos principais
- **Arquivos ignorados:** ~10 arquivos (build/gerados/cache)
- **Documentação:** 4 arquivos (opcional)

**Total de arquivos de código a serem commitados: 7 arquivos**

---

## ✅ **Checklist Final**

- [ ] Atualizar `.gitignore` para ignorar builds e cache
- [ ] Commit 1: PowerDialerManager.kt
- [ ] Commit 2: MainActivity.kt
- [ ] Commit 3: MyConnectionService.kt + MyInCallService.kt
- [ ] Commit 4: Componentes React
- [ ] (Opcional) Commit 5: Documentação
- [ ] Push dos commits

