# Controle de Chaves · Sistema de design dos dashboards

**Proposta visual baseada na referência enviada.** O painel concentra a cor em três cartões: um resumo violeta e dois indicadores em azul e coral. O fundo cinza-claro, os controles brancos e os números em alto contraste deixam esses cartões conduzir a leitura. No Controle de Chaves, essa composição cabe na área de conteúdo do painel com menu lateral.

## 1. Inventário da referência

| Elemento | O que aparece na imagem | Aplicação no Controle de Chaves |
| --- | --- | --- |
| Base neutra | Fundo cinza uniforme, cartões brancos e títulos quase pretos. | Usar superfícies sólidas no quadro de chaves, nas tabelas, nos filtros e nos formulários de confirmação. |
| Cartão principal | Retângulo violeta largo, número dominante à esquerda, cantos iluminados e gráfico pontilhado na base. | Exibir **Movimentações no período**. O número soma retiradas e devoluções efetivamente registradas no intervalo selecionado. |
| Cartões complementares | Azul frio e coral quente lado a lado. Cada cartão tem rótulo no alto, valor na base e uma seta circular no canto. | Usar **Retiradas** em azul e **Devoluções** em coral. A seta abre o histórico correspondente ao período e ao tipo de movimento. |
| Vidro fosco | Os cartões têm contorno leitoso, brilho interno difuso e pequenas superfícies translúcidas sobre a cor. | Concentrar o vidro na borda e no controle circular. Manter números, ícones e rótulos nítidos em uma camada superior. |
| Seletor segmentado | Uma cápsula branca reúne três períodos. A opção selecionada ganha preenchimento escuro e texto branco. | Oferecer períodos que a consulta consiga calcular, como **Dia**, **Semana** e **Mês**. Mostrar o intervalo de datas que a opção representa. |
| Gráficos de pontos | Colunas de pontos com espaçamento regular, poucas legendas e destaque localizado em uma data. | No cartão violeta, cada coluna representa um dia e sua altura representa a quantidade de movimentos. Exibir o valor exato ao focar ou tocar na coluna. |
| Hierarquia tipográfica | Fonte sem serifa, algarismos grandes e pouco texto concorrendo com o valor. | Usar DM Sans, já presente no projeto. Colocar a unidade ou o período junto ao número e a explicação em uma linha secundária. |

A imagem permite identificar a direção da luz e as cores aparentes. Os ângulos, opacidades, raios e valores de desfoque abaixo são parâmetros propostos para reproduzir o efeito em CSS.

## 2. Paleta e distribuição da luz

As amostras hexadecimais foram lidas em pontos da imagem. Em uma superfície com degradê, cada amostra representa uma região do cartão.

| Família | Amostras | Distribuição e função |
| --- | --- | --- |
| Neutros | Fundo `#EBEBEB` · superfície `#FFFFFF` · seleção `#171719` | Manter o entorno uniforme. Reservar o contraste preto e branco para navegação, texto e seleção. |
| Violeta | Sombra `#483C68` · tom médio `#9974B5` · luz `#B38DD2` | Concentrar a sombra sob o valor e a luz lilás na lateral direita. Um reflexo suave junto ao topo dá espessura à borda. |
| Azul | Sombra `#6E7CC2` · luz `#B9D9F7` | A cor ganha densidade à esquerda e clareia em direção à parte inferior direita. |
| Coral | Sombra `#C45C54` · tom médio `#E28B87` · luz `#EDAAA7` | Concentrar o coral na lateral esquerda e distribuir um reflexo rosado na base e na lateral direita. |

**Cor de categoria e estado de custódia.** Azul e coral identificam tipos de movimento ao longo do dashboard. A chave continua a ter uma situação própria, escrita por extenso, como **Disponível**, **Em uso** ou **Bloqueada**. Assim, uma devolução em coral pode aparecer ao lado do estado **Disponível** sem sugerir erro.

## 3. Receita de superfície e vidro

Monte cada cartão em três camadas. A primeira dá cor e profundidade com uma base linear e um foco radial amplo. A segunda desenha o reflexo interno e a borda translúcida. A terceira contém os dados. No cartão violeta, o véu escuro à esquerda protege o texto branco. Nos cartões claros, o texto escuro mantém a leitura sobre o azul e o coral.

O exemplo abaixo pode ser testado isoladamente com as classes `.cartao-destaque` e um modificador de cor. A classe `.acao-vidro` se aplica a um botão dentro do cartão.

```css
.cartao-destaque {
  border: 1px solid rgb(255 255 255 / 48%);
  border-radius: 24px;
  padding: clamp(20px, 3vw, 32px);
  background: var(--luz), var(--superficie);
  color: var(--tinta);
  box-shadow: inset 0 1px 2px rgb(255 255 255 / 55%),
              inset 0 0 18px rgb(255 255 255 / 24%);
}

.cartao-destaque.violeta {
  --superficie: linear-gradient(145deg, #786399, #483c68 54%, #9974b5);
  --luz: radial-gradient(ellipse at 100% 60%, #b38dd2, transparent 55%);
  --tinta: #fff;
  background: linear-gradient(90deg, rgb(37 23 56 / 55%) 0% 50%, transparent 85%),
              var(--luz), var(--superficie);
}

.cartao-destaque.azul {
  --superficie: linear-gradient(130deg, #8998d2, #b9d9f7);
  --luz: radial-gradient(ellipse at 82% 90%, #cce9ff, transparent 64%);
  --tinta: #171719;
}

.cartao-destaque.coral {
  --superficie: linear-gradient(130deg, #e28b87, #edaaa7);
  --luz: radial-gradient(ellipse at 82% 90%, #ffd0ca, transparent 64%);
  --tinta: #171719;
}

.acao-vidro {
  inline-size: 44px;
  block-size: 44px;
  border-radius: 50%;
  border: 1px solid rgb(255 255 255 / 65%);
  background: #f4eff8;
  color: #171719;
}

@supports (backdrop-filter: blur(1px)) {
  .acao-vidro {
    background: rgb(255 255 255 / 58%);
    backdrop-filter: blur(12px);
  }
}
```

Use o desfoque onde há uma camada colorida atrás do controle. O fundo sólido do botão cobre navegadores sem suporte. Uma sombra externa discreta cabe na barra flutuante vista na referência. Nos cartões, o volume já vem do brilho interno.

## 4. Escala e composição

| Decisão | Valor inicial proposto |
| --- | --- |
| Valor principal | 40–56 px, peso 500 ou 600, entrelinha de 1,05. Usar `font-variant-numeric: tabular-nums` nos totais que se atualizam. |
| Valor secundário | 28–36 px. Manter a mesma linha de base entre os cartões azul e coral. |
| Rótulos e controles | 14–16 px, peso 500. Reservar 12–14 px para legendas e datas auxiliares. |
| Espaço e forma | Base de 4 px. Usar 8 px entre valor e contexto, 12–16 px entre cartões e 20–32 px de recuo interno. Raio de 24 px nos destaques e raio pleno nos seletores. |
| Desktop | Resumo violeta na área principal, par azul e coral agrupado e histórico em superfície branca abaixo. Manter a ação **Registrar movimentação** acessível junto ao título. |
| Celular | Empilhar seletor, resumo, par de indicadores e histórico. Quando os cartões do par perderem espaço para valor, rótulo e alvo de toque, passar para uma coluna. Na área docente, priorizar **Ler QR Code** e a chave em posse. |

## 5. Estados e critérios de aceite

- **Período e dados.** Ao trocar o período, atualizar total, indicadores, gráfico e destino dos detalhes para o mesmo intervalo. Diferenciar movimentos ocorridos no período da contagem de chaves disponíveis **agora**.
- **Contraste sobre o degradê.** Medir o contraste na região mais clara ou mais escura ocupada pelo texto, inclusive no celular. Adotar como metas 4,5:1 para texto comum e 3:1 para texto grande e marcas gráficas essenciais. Se um rótulo branco alcançar a luz lilás, reposicioná-lo sobre a sombra ou ampliar o véu escuro.
- **Interação.** Usar nome acessível específico nas setas, como “Ver devoluções da semana”, foco visível e área de toque de pelo menos 44 × 44 px. Representar a seleção de período também no estado acessível do controle.
- **Gráfico e legenda.** Identificar unidade, datas e escala. Para comparar as duas séries, oferecer rótulos e um resumo textual ou tabular com os valores. Usar a mesma escala de pontos em todo o intervalo representado.
- **Carregamento, vazio e falha.** Reservar o espaço dos números durante a consulta. Mostrar zero quando a consulta confirmar ausência de movimentos. Em falha, exibir a mensagem e a ação de tentar novamente.
- **Revisão visual.** Conferir os três cartões em largura de 360 px e em desktop, com números de quatro dígitos, texto ampliado e desfoque desativado. A leitura deve seguir a mesma ordem em todos os casos: indicador, valor, período e ação.

## Aplicação nas demais telas

A barra lateral usa um degradê de cinza de #454545 a #272727. Uma cápsula prateada identifica a página atual em todos os perfis, inclusive no menu móvel.

Inventário, histórico, ocorrências, relatórios, cadastros, horários, auditoria e configurações compartilham a hierarquia de títulos do painel, cartões brancos de 22 px de raio e controles de formulário de 12 px de raio. Botões primários e opções selecionadas usam cápsulas escuras. As tabelas mantêm cabeçalho neutro e rolagem horizontal dentro do cartão.

No login, o painel institucional usa o mesmo degradê cinza da barra lateral. Na identificação da chave, a confirmação da retirada usa o azul do indicador de retiradas e a devolução usa o coral do indicador de devoluções. O título do diálogo identifica a operação também por escrito.
