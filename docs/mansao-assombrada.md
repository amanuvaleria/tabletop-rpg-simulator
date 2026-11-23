# Mansão assombrada — referências e cenário inicial

As pranchas enviadas estão preservadas em `docs/references/` como referências visuais:

- `pacote-mansao-assombrada.png`
- `catalogo-casa-assombrada.png`

Elas são imagens compostas, não arquivos de modelos 3D separados. Por isso não foram importadas como dezenas de props no tabuleiro: recortes automáticos podem levar partes do fundo, texto e itens vizinhos. Para virar assets utilizáveis, cada item deve ser fornecido/exportado individualmente (ideal: GLB/GLTF para modelos; PNG/WebP com transparência para sprites).

## Cenário disponível

O preset **Mansão assombrada** foi adicionado à biblioteca de mapas usando modelos já presentes no tabletop: mansão sombria, muros, lápides, árvores mortas, tochas, lampiões e objetos de jardim. Ele é editável depois de carregado e sincroniza pelo sistema normal de cenários da sala.

## Próximo lote de assets

Para reproduzir fielmente o catálogo, preparar arquivos individuais e transparentes de: pisos modulares, paredes/cantos/colunas, portas e janelas, telhados, escadas, mobiliário, itens de cozinha/banheiro, objetos de porão e efeitos paranormais. O launcher permite importar PNG, WebP e SVG; modelos GLB/GLTF precisam ser incorporados pelo pacote 3D do projeto.
