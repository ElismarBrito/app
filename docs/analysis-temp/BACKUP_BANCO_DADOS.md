# 💾 Guia de Backup do Banco de Dados - Supabase

## 🎯 Objetivo

**Fazer backup completo do banco de dados ANTES de aplicar as migrations SQL**

---

## 📋 SQLs que Serão Aplicados (Ordem de Execução)

### 1. **20250117000000_fix_status_inconsistencies.sql**
- Corrige inconsistências de status em `calls` e `devices`
- Adiciona status 'unpaired' e 'pairing' em devices
- Converte status de calls para ENUM
- **Impacto:** ALTO - Modifica estrutura de dados existentes

### 2. **20250117000001_create_composite_indexes.sql**
- Cria índices compostos otimizados
- Índices em `devices`, `calls`, `number_lists`, `qr_sessions`
- **Impacto:** BAIXO - Apenas cria índices (não modifica dados)

### 3. **20250117000002_trigger_active_calls_count.sql**
- Cria trigger para atualizar `active_calls_count` automaticamente
- Função `sync_active_calls_count()` para sincronizar contadores
- **Impacto:** MÉDIO - Adiciona triggers (não modifica dados existentes)

### 4. **20250117000003_update_schema.sql**
- Valida e atualiza schema com todas as colunas necessárias
- Garante que todas as colunas de migrations anteriores existem
- **Impacto:** MÉDIO - Pode adicionar colunas (não remove dados)

### 5. **20250117000004_create_device_commands.sql**
- Cria tabela `device_commands` para queue de comandos
- Índices otimizados para queries de comandos pendentes
- **Impacto:** BAIXO - Apenas cria nova tabela (não modifica dados existentes)

### 6. **20250118000000_create_materialized_views.sql** (Opcional)
- Cria Materialized Views para estatísticas
- `mv_call_statistics`, `mv_device_performance`, `mv_campaign_performance`
- **Impacto:** BAIXO - Apenas cria views (não modifica dados existentes)

---

## 🔧 Métodos de Backup

### **Método 1: Backup via Supabase Dashboard (Recomendado - Mais Fácil)**

#### Passo 1: Acessar Dashboard
1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Faça login na sua conta
3. Selecione o projeto: **jovnndvixqymfvnxkbep**

#### Passo 2: Fazer Backup via SQL Editor
1. Vá em **SQL Editor** no menu lateral
2. Execute o seguinte script de backup:

```sql
-- Script de Backup Completo do Banco de Dados
-- Execute este script ANTES de aplicar as migrations

-- 1. Backup das tabelas principais (cria arquivos .sql separados)
-- Execute cada comando abaixo e salve o resultado

-- Backup da tabela devices
COPY (
  SELECT * FROM public.devices
) TO STDOUT WITH CSV HEADER;
-- Salve o resultado como: backup_devices_YYYY-MM-DD.csv

-- Backup da tabela calls
COPY (
  SELECT * FROM public.calls
  ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER;
-- Salve o resultado como: backup_calls_YYYY-MM-DD.csv

-- Backup da tabela number_lists
COPY (
  SELECT * FROM public.number_lists
) TO STDOUT WITH CSV HEADER;
-- Salve o resultado como: backup_number_lists_YYYY-MM-DD.csv

-- Backup da tabela qr_sessions
COPY (
  SELECT * FROM public.qr_sessions
) TO STDOUT WITH CSV HEADER;
-- Salve o resultado como: backup_qr_sessions_YYYY-MM-DD.csv
```

#### Passo 3: Backup via Database > Backups (Automático)
1. Vá em **Database** > **Backups** no menu lateral
2. Clique em **Download backup** para criar um backup completo
3. O backup será gerado automaticamente e você poderá baixar

**⚠️ IMPORTANTE:** Backups automáticos podem levar alguns minutos para serem gerados.

---

### **Método 2: Backup via Supabase CLI (Mais Completo)**

#### Pré-requisitos
```bash
# Instalar Supabase CLI (se ainda não tiver)
npm install -g supabase
# ou
brew install supabase/tap/supabase  # macOS

# Fazer login
supabase login
```

#### Passo 1: Configurar Link do Projeto
```bash
# Navegar até o diretório do projeto
cd /home/elismar/Documentos/Projetos/Mobile

# Fazer link com o projeto remoto
supabase link --project-ref jovnndvixqymfvnxkbep
```

#### Passo 2: Fazer Backup Completo
```bash
# Criar backup completo do banco
supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql

# Ou especificar formato
supabase db dump --data-only -f backup_data_$(date +%Y%m%d_%H%M%S).sql
supabase db dump --schema-only -f backup_schema_$(date +%Y%m%d_%H%M%S).sql
```

**Saída esperada:**
- `backup_20250116_143000.sql` - Backup completo (schema + dados)

---

### **Método 3: Backup via pg_dump (PostgreSQL Nativo)**

#### Pré-requisitos
```bash
# Instalar PostgreSQL client tools
sudo apt-get install postgresql-client  # Ubuntu/Debian
# ou
brew install postgresql  # macOS
```

#### Passo 1: Obter String de Conexão
No Supabase Dashboard:
1. Vá em **Database** > **Connection string**
2. Selecione **URI** e copie a string
3. Formato: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

#### Passo 2: Fazer Backup
```bash
# Backup completo
pg_dump "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" \
  -f backup_completo_$(date +%Y%m%d_%H%M%S).sql \
  --verbose

# Backup apenas schema
pg_dump "postgresql://..." \
  --schema-only \
  -f backup_schema_$(date +%Y%m%d_%H%M%S).sql

# Backup apenas dados
pg_dump "postgresql://..." \
  --data-only \
  -f backup_data_$(date +%Y%m%d_%H%M%S).sql

# Backup com compressão
pg_dump "postgresql://..." \
  -F c \
  -f backup_$(date +%Y%m%d_%H%M%S).dump
```

---

### **Método 4: Backup via SQL Editor (Manual - Para Dados Críticos)**

Para dados muito importantes, você pode fazer backup manual de cada tabela:

```sql
-- Execute no SQL Editor do Supabase Dashboard
-- E salve os resultados em arquivos .csv

-- 1. Backup devices
SELECT * FROM public.devices;

-- 2. Backup calls
SELECT * FROM public.calls;

-- 3. Backup number_lists
SELECT * FROM public.number_lists;

-- 4. Backup qr_sessions
SELECT * FROM public.qr_sessions;

-- 5. Backup device_commands (se existir)
SELECT * FROM public.device_commands;
```

**Como salvar:**
1. Execute a query
2. Clique em "Download CSV" ou copie os resultados
3. Salve com nome descritivo: `backup_[tabela]_[data].csv`

---

## 📦 Script Automatizado de Backup

Criei um script para facilitar o backup. Você pode executar:

```bash
# Dar permissão de execução
chmod +x scripts/backup_database.sh

# Executar backup
./scripts/backup_database.sh
```

**Ou criar manualmente:**

```bash
#!/bin/bash
# scripts/backup_database.sh

# Configurações
PROJECT_REF="jovnndvixqymfvnxkbep"
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Criar diretório de backups
mkdir -p "$BACKUP_DIR"

echo "🔄 Iniciando backup do banco de dados..."
echo "📅 Data: $(date)"
echo "📁 Diretório: $BACKUP_DIR"
echo ""

# Verificar se Supabase CLI está instalado
if command -v supabase &> /dev/null; then
    echo "✅ Usando Supabase CLI..."
    supabase db dump -f "$BACKUP_DIR/backup_$DATE.sql"
    echo "✅ Backup completo salvo em: $BACKUP_DIR/backup_$DATE.sql"
else
    echo "⚠️ Supabase CLI não encontrado"
    echo "📋 Use o Método 1 (Dashboard) ou Método 3 (pg_dump)"
fi

echo ""
echo "✅ Backup concluído!"
echo "📦 Arquivo: $BACKUP_DIR/backup_$DATE.sql"
```

---

## ✅ Checklist de Backup

Antes de aplicar as migrations, verifique:

- [ ] Backup completo criado (via Dashboard, CLI ou pg_dump)
- [ ] Backup salvo em local seguro (não apenas no computador)
- [ ] Backup testado (pode ser importado novamente se necessário)
- [ ] Backup documentado (nome do arquivo, data, método usado)
- [ ] Confirmação visual de que backup foi criado com sucesso

---

## 🔄 Como Restaurar o Backup (Se Necessário)

### Via Supabase Dashboard:
1. Vá em **SQL Editor**
2. Cole o conteúdo do arquivo `.sql` de backup
3. Execute

### Via Supabase CLI:
```bash
supabase db reset
supabase db restore backup_YYYYMMDD_HHMMSS.sql
```

### Via psql:
```bash
psql "postgresql://[connection-string]" < backup_YYYYMMDD_HHMMSS.sql
```

---

## 🚨 Importante

### ⚠️ **ANTES de aplicar as migrations:**
1. **SEMPRE faça backup completo**
2. **Teste o backup** (tente importar em ambiente de teste)
3. **Documente o backup** (onde está salvo, data, tamanho)
4. **Tenha plano de rollback** (como reverter se algo der errado)

### ✅ **Recomendação:**
- **Use o Método 1 (Dashboard)** se você não tem CLI configurado
- **Use o Método 2 (Supabase CLI)** se você tem CLI instalado e configurado
- **Use o Método 3 (pg_dump)** se você quer máximo controle

---

## 📞 Suporte

Se tiver problemas com o backup:
1. Verifique a documentação do Supabase: [https://supabase.com/docs/guides/database/backups](https://supabase.com/docs/guides/database/backups)
2. Consulte a documentação do PostgreSQL: [https://www.postgresql.org/docs/](https://www.postgresql.org/docs/)

---

**Última atualização:** Preparado para aplicar migrations da branch `and-09-aplicar-migrations-sql`

