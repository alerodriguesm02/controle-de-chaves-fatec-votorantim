# Controle de Chaves · Fatec Votorantim

Sistema de controle da custódia de chaves físicas. A mesma aplicação oferece um painel para a secretaria e a administração, uma área docente para celular e consultas com acesso restrito para auditoria. A interface, as fontes, os ícones e o leitor de QR funcionam com recursos servidos pela própria aplicação.

## Documentação

- [Guia técnico e roteiro de homologação](docs/guia-tecnico.md)
- [Contrato da API em OpenAPI](docs/openapi.json)
- [Sistema de design](docs/sistema-de-design-dashboards.md)

## Executar a demonstração

Requer Node.js 22.13 ou superior e npm.

```sh
npm ci
npm start
```

Abra [o painel local](http://127.0.0.1:4173). A primeira visita abre a demonstração administrativa da unidade com 24 chaves fictícias. O menu do avatar permite alternar entre Administrador, Secretaria, Docente e Auditor. Para experimentar o login com senha, saia da conta e use `professor@demo.invalid` e `Fatec-Demo-2026`.

A base SQLite fica em `data/demo.sqlite`. Reiniciar o servidor preserva as movimentações. A aplicação restringe a demonstração ao computador local. O modo institucional usa um banco separado.

## Percurso de uso

**Docente.** Na tela inicial, escolha **Ler QR Code**. Escaneie a etiqueta do gancho ou digite o código impresso, por exemplo `CH-001`. Confira a chave e seus ambientes. Escolha a aula proposta ou informe a finalidade. Confirme ao receber a chave física. Para devolver, recoloque a chave no gancho, identifique-a novamente e confirme a devolução. O comprovante aparece após a confirmação da API.

**Secretaria.** O quadro permite buscar por código, sala ou responsável. Em **Registrar movimentação**, informe o docente para uma retirada e a justificativa do lançamento assistido. Na devolução, o titular é recuperado do empréstimo. O horário declarado da entrega física pode ser informado separadamente. O sino reúne devoluções acima do prazo. Use **Quadro de chaves → Conferir painel** para confrontar cada gancho com sua posição digital. Divergências geram ocorrências para tratamento.

Em **Quadro de chaves → Conferir etiqueta**, selecione o gancho e confira a chave e os ambientes esperados. Leia o QR com a câmera ou leitor externo e registre. A secretaria pode consultar o resultado em **Relatórios → Conferência de etiquetas**. Etiquetas trocadas, revogadas ou com identificador institucional desconhecido geram ocorrência. A conferência pode ser repetida após a correção.

Ao transcrever o livro após indisponibilidade, selecione **Contingência após indisponibilidade** na confirmação assistida e informe o horário físico em São Paulo. O histórico permite filtrar por **Contingência** e consultar separadamente retirada e devolução.

**Administração.** Em **Cadastros**, gerencie pessoas, perfis, vínculos, ambientes e chaves. Uma chave pode estar ligada a vários ambientes. No detalhe da chave, **Etiqueta QR** permite imprimir, revogar ou reemitir a etiqueta com justificativa. Na **Grade de aulas**, cadastre aulas semanais com vigência, aulas extras com vigência de um dia ou exceções por data para cancelamento, troca de sala e substituição. Os detalhes do empréstimo permitem anulação justificada por erro material. A operação preserva os horários originais e a trilha de auditoria.

**Relatórios.** Selecione o relatório, aplique os filtros e informe a finalidade ao exportar em PDF ou CSV. O histórico permite filtrar por docente, chave, ambiente, período, operações assistidas e situação. Também há operações por dia, uso por ambiente, conferências, ocorrências e auditoria. Durações em aberto são provisórias. Um empréstimo mede custódia da chave.

**Acesso e contingência.** O administrador redefine a senha no cadastro de pessoas, após a conferência da identidade pela unidade. Alterar o vínculo ou as credenciais revoga as sessões desse usuário. Em indisponibilidade de rede, a secretaria registra o fato físico no formulário institucional e verifica o histórico antes de lançar a operação assistida. O código impresso também atende quem não consegue usar a câmera.

## Importação

Use CSV UTF-8 separado por ponto e vírgula. O sistema valida todas as linhas e mostra uma prévia antes da confirmação. Uma linha inválida cancela o lote inteiro. Em uma aula importada, **Editar → Desfazer importação deste lote** desativa as aulas daquele lote, preservando os empréstimos anteriores.

Grade de aulas, com domingo igual a 0 e sábado igual a 6.

```csv
email;room;subject;class_name;weekday;start_time;end_time;valid_from;valid_to
professor@demo.invalid;A-101;Programação I;DSM-2;1;18:50;22:20;2026-08-01;2026-12-18
```

Para importar docentes, use o cabeçalho `name;email;registration;password`. Forneça senhas iniciais individuais. Trate o arquivo de importação como credencial e use o processo institucional para sua guarda e descarte.

## Testes

```sh
npm test
```

A suíte usa uma base temporária e a API HTTP real. Para PostgreSQL, defina `TEST_DATABASE_URL` para um banco de testes em que a conta possa criar esquemas. A suíte cria e remove os seus próprios esquemas. Os cenários incluem 100 confirmações simultâneas, reenvio idempotente, devolução por terceiro, revogação e decodificação de QR, prévia e reversão de importação, contexto histórico, conferência física, exportação e restauração do backup.

O teste de navegador em `tests/ui.py` usa Python com Playwright e Chrome. Execute `python3 tests/ui.py` a partir da raiz. Use `CHROME_BIN` para selecionar um executável específico. O teste também utiliza uma base temporária.

## Instalação institucional

A aplicação atende **uma unidade por instalação**, com um banco exclusivo. O backend Node.js oferece uma API em `/api/v1`. O PostgreSQL recebe as transações e um índice parcial único protege a custódia de cada chave. A sessão usa cookie HttpOnly e o backend determina o titular a partir da identidade autenticada no fluxo pessoal. As senhas usam scrypt com sal individual. Os QR contêm um identificador opaco. A câmera é processada no navegador.

| Variável | Uso |
| --- | --- |
| NODE_ENV | Use `production` para o modo institucional com cookies Secure. |
| DATABASE_URL | Conexão PostgreSQL dedicada à unidade. |
| PUBLIC_ORIGIN | Origem HTTPS externa exata, por exemplo o domínio autorizado pela TI. |
| LABEL_SECRET | Segredo aleatório estável de alta entropia, compartilhado entre instâncias, para reimprimir as etiquetas. |
| ADMIN_EMAIL e ADMIN_PASSWORD | Credenciais iniciais para uma base nova. Senha de 12 caracteres ou mais. Após provisionar o administrador, retire essas variáveis do ambiente. |
| HOST e PORT | Endereço de escuta atrás do proxy HTTPS. Padrões `127.0.0.1` e `4173`. |
| DEMO_MODE | Use `0` para homologação local com login e base vazia. Produção desativa a demonstração. |
| DB_FILE | Caminho do banco em instalações locais com SQLite. |

Instale com `npm ci --omit=dev` e inicie com `npm start` usando as variáveis da instalação. O processo cria as tabelas e aplica a migração do índice de custódia. Um proxy HTTPS da infraestrutura deve encaminhar as requisições ao Node. A rota `/healthz` confirma que API e banco respondem. O código de correlação acompanhará as falhas da API. O contrato está em [docs/openapi.json](docs/openapi.json).

A integração SSO/MFA e a importação automática da grade oficial dependem da identidade e das interfaces autorizadas pelo CPS. A instalação atual oferece autenticação local e importação CSV. A produção exige a homologação do inventário, das permissões e dos procedimentos de suporte e privacidade, além de testes com celulares físicos, impressão das etiquetas e equipamentos da secretaria.

## Backup e recuperação

```sh
node scripts/archive.js backup custodia-backup.json.gz
node scripts/archive.js restore custodia-backup.json.gz
```

No primeiro comando, configure `DATABASE_URL` ou `DB_FILE` para a origem. No segundo, aponte para **outro banco vazio**. Em SQLite, informe `DB_FILE` explicitamente para uma base diferente do padrão de demonstração. Uma cópia utiliza uma transação consistente, inclui cadastros, custódia, idempotência, ocorrências e auditoria. A restauração encerra o acesso de sessões anteriores e preserva os registros de custódia.

O arquivo contém dados pessoais e hashes de senha. Armazene-o com acesso restrito, criptografia e retenção definida pela unidade. Guarde `LABEL_SECRET` separadamente ou, em SQLite sem essa variável, guarde o arquivo `<DB_FILE>.labels`. A nova instalação deverá usar o mesmo segredo para que suas etiquetas originais possam ser reimpressas. Antes de promover uma restauração, confira totais de empréstimos em aberto, responsáveis e uma etiqueta impressa. Para voltar a uma versão anterior, restaure a cópia pré-atualização em uma base separada e aponte a versão compatível para ela.
