# Guia técnico do Controle de Chaves

O sistema registra a custódia física das chaves da Fatec Votorantim. O docente identifica a chave e confirma a retirada ou a devolução. A secretaria acompanha empréstimos, registra contingências e concilia o painel físico. O servidor valida cada confirmação e atribui o horário oficial.

## Onde encontrar cada parte

| Componente | Responsabilidade |
| --- | --- |
| [Interface](../public/) | PWA, navegação por perfil, câmera, formulários e relatórios. |
| [Entrada da API](../server/main.js) | Sessões, rotas HTTP, autorização e entrega dos recursos da interface. |
| [Custódia](../server/custody.js) | Identificação da chave, confirmação, idempotência e histórico. |
| [Operações administrativas](../server/admin.js) | Cadastros, grade, etiquetas, conferências e ocorrências. |
| [Banco de dados](../server/db.js) e [esquema](../server/schema.sql) | Transações, tabelas, restrições e migrações. A demonstração usa SQLite. A instalação institucional usa PostgreSQL. |
| [Relatórios](../server/reports.js) e [exportação](../server/exports.js) | Consultas gerenciais e geração de CSV e PDF. |
| [Testes](../tests/) | Cenários de integração da API e percursos de uso no navegador. |

## Como verificar uma instalação de teste

1. Siga as instruções de instalação e inicialização no [README](../README.md). Abra a página inicial e confira se a rota `/healthz` responde.
2. Em uma base de demonstração, entre como docente, identifique uma chave disponível e confirme a retirada. Confira o empréstimo no histórico e faça a devolução.
3. Como secretaria, registre uma operação de contingência. Confira no histórico a origem e os horários do fato físico e do lançamento.
4. Confira uma etiqueta no gancho correto e depois selecione outro gancho para a mesma etiqueta. Consulte a evidência em **Relatórios → Conferência de etiquetas** e a divergência em **Ocorrências**.
5. Execute `npm test` e `python3 tests/ui.py` com as dependências descritas no README. Para avaliar o banco institucional, utilize um PostgreSQL de teste em `TEST_DATABASE_URL`.

## Antes do piloto na unidade

A secretaria deve conferir o inventário real, testar etiquetas impressas nos aparelhos disponíveis e validar o fluxo de contingência. A equipe de TI deve verificar permissões por perfil, acesso por HTTPS e restauração em uma base isolada. Registre o ambiente, a data, os resultados e os responsáveis pela homologação.

A auditoria de consultas nominais ainda depende do indicador enviado pela interface. O filtro de atrasos cobre empréstimos em aberto. A apuração de devoluções concluídas fora do prazo permanece pendente.
