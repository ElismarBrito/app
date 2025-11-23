# Documentos de Análise Temporários

Esta pasta contém documentos de análise, diagnósticos e scripts SQL temporários criados durante o desenvolvimento.

## Conteúdo

- **Documentos .md**: Análises, resumos, guias e documentação de testes criados durante o desenvolvimento
- **Scripts .sql**: Scripts de diagnóstico, validação e teste que **não** são migrations de produção

## Nota

Estes arquivos são temporários e destinam-se apenas para referência durante o desenvolvimento. Eles não fazem parte da implementação final do sistema.

## Scripts SQL Importantes

Os scripts SQL que são migrations oficiais estão em `supabase/migrations/` e serão executados em produção.

Os scripts nesta pasta (`check_active_calls.sql`, `cleanup_stuck_calls.sql`, etc.) são apenas para diagnóstico e manutenção manual.

