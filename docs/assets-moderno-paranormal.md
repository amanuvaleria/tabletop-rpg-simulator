# Assets — Tema Moderno Paranormal

Referência visual: `docs/references/assets-rpg-moderno-paranormal-moodboard.png`
(moodboard único, gerado por IA — serve de guia de estilo, não são arquivos
individuais prontos para importar). Pra virar props/tokens de verdade no
app, cada item precisa existir como **PNG individual com fundo transparente**
(recortado da referência ou gerado/desenhado à parte).

## Como os assets entram no projeto hoje

- **Tokens (personagens/NPCs/objetos):** usuário sobe um PNG pela Toolbar
  (`web/src/components/Toolbar.tsx`) — isso já funciona pra qualquer imagem,
  não precisa mexer em código.
- **Props de cenário** (casas, portas, mobília, luzes...): são modelos 3D
  procedurais (Three.js), catalogados em `web/src/props/catalog.ts`
  (`PROP_CATALOG`) e `web/src/props/Models.tsx` / `MedievalModels.tsx`. Pra
  adicionar um prop novo: criar o componente 3D do modelo, registrar no
  catálogo com `label`/`category`/`snap`, e (opcional) incluir em um
  `MAP_PRESETS` pronto.
- **Pisos:** cores/texturas simples em `FLOORS` (catalog.ts) + geração
  procedural em `Board.tsx`/`textures.ts`.

## Categorias do moodboard → mapeamento sugerido

| Categoria no moodboard | Onde entra no código | Status |
|---|---|---|
| Pisos (tiles 1×1) | `FLOORS` em `catalog.ts` + `textures.ts` | parcial — só "dark/grass/dirt/asphalt/cobble", falta ladrilho hospitalar, sangue, tabuleiro ritual |
| Paredes modulares | novo: `wall_modern`, `wall_ivy`, `wall_brick` em `PROP_CATALOG` | não iniciado |
| Portas e portões | novo: `door_metal`, `door_wood`, `gate_iron` | não iniciado |
| Janelas e vitrais | novo category `"Aberturas"`: `window_broken`, `window_stained` | não iniciado |
| Escadas e níveis | novo: `stairs_wood`, `stairs_spiral`, `ladder` | não iniciado |
| Colunas, arcos, estruturas | parcial (`tower_medieval` existe); faltam colunas soltas | parcial |
| Cercas e divisões | `fence` existe; faltar `fence_wire`, `barrier_tape`, `hedge` | parcial |
| Mobiliário (moderno/medieval) | parcial (`bench`, `crate`, `barrel`); faltam sofá, cama, armário, mesa de escritório | parcial |
| Objetos de investigação | novo category `"Investigação"`: câmera, laptop, gravador, lanterna, mapa, dossiê — tokens PNG são o caminho mais rápido aqui (objetos pequenos, não precisam ser 3D) | não iniciado |
| Laboratório/hospital | novo category `"Hospital"`: maca, estante de produtos químicos, monitor | não iniciado |
| Ritual/paranormal | novo category `"Ritual"`: altar, círculo de velas, pentagrama no chão (textura de piso!), portal | não iniciado |
| Exteriores/natureza | `tree`, `pine`, `rock`, `bush`, `dead_tree` já existem | ok |
| Veículos/urbano | `car` existe; faltam ambulância, viatura, moto, poste urbano, hidrante | parcial |
| Efeitos/overlays (sangue, névoa, chuva) | névoa já existe (`Atmosphere.tsx`, `Mood`); faltam overlays de sangue/chuva como planos semi-transparentes | parcial |
| Tokens (exemplos) | já suportado via upload de PNG — só falta ter uma galeria de retratos prontos pra não precisar desenhar/achar cada um | suporte pronto, falta conteúdo |
| Ícones/marcadores de UI | pode virar indicadores de status no token (ex: badge de "investigando", "ferido") — ainda não modelado | não iniciado |

## Próximos passos sugeridos (retomar daqui)

1. Decidir a fonte dos PNGs individuais: gerar com IA um por um (melhor
   controle de transparência) ou recortar do moodboard (mais rápido, pior
   qualidade/resolução).
2. Criar pasta `web/public/assets/paranormal/` pra guardar os PNGs
   recortados/gerados (tokens prontos e ícones de UI).
3. Adicionar novo preset de mapa em `MAP_PRESETS` tipo `"escritorio_paranormal"`
   ou `"laboratorio"` usando os props modernos que já existem + os novos.
4. Se o conjunto de props crescer muito, considerar carregar `PROP_CATALOG`
   de um JSON externo em vez de hardcoded, pra facilitar expandir por tema.
