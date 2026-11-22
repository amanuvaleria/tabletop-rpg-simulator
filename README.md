# Tabletop RPG Simulator

Um tabletop simulator para jogos de RPG de mesa, com suporte a múltiplos temas:

- 🏰 Medieval / Fantasia
- 🏙️ Moderno Paranormal
- 👻 Terror
- 🗺️ Aventura

## Objetivo

Criar uma plataforma web onde mestres e jogadores possam:

- Jogar RPG de mesa remotamente em tempo real (multiplayer)
- Mover tokens/miniaturas em um tabuleiro/grid
- Rolar dados (d4, d6, d8, d10, d12, d20, d100, dados customizados)
- Gerenciar fichas de personagem
- Compartilhar mapas e cenários por tema
- Chat de voz/texto integrado (futuro)

## Stack

- **Frontend:** React + TypeScript + Vite
- **Renderização do tabuleiro:** Three.js via react-three-fiber + drei
  - Câmera alternável: 2D top-down (ortográfica) ou 3D livre (perspectiva + orbit controls)
  - Tokens (personagens/NPCs/objetos) são PNGs em billboard, sempre de frente pra câmera
- **Estado do board:** Zustand
- **Realtime/Multiplayer:** Socket.IO (WebSocket) — salas com código compartilhável
- **Backend:** Node.js + Express + Socket.IO (`server/`), estado persistido em
  disco por sala (`server/data/rooms/<CODIGO>.json`)

## Status

🚧 Em construção.

**Feito:**
- [x] Tabuleiro 3D com grid
- [x] Câmera alternável 2D (topo) / 3D (livre)
- [x] Upload de PNG → token (personagem / NPC / objeto)
- [x] Drag & drop de tokens no tabuleiro
- [x] Seleção de token (redimensionar, remover)
- [x] **Multiplayer em tempo real**: criar/entrar em sala por código ou link, sync de
      criação/edição/remoção/posição de tokens entre todos os jogadores conectados
- [x] Sistema de dados (d4–d100, quantidade + modificador, com animação 3D e log de rolagens)
- [x] Mapas/cenários prontos (Rua moderna, Rua medieval, Vila medieval, Floresta com
      acampamento, Cemitério assombrado)
- [x] Atmosfera medieval: névoa, texturas procedurais, pós-processamento
- [x] Paleta de props (modelos medievais: casas, poço, lanternas, árvores etc.)
- [x] **Fichas de personagem e NPC**: HP (com barra flutuante no tabuleiro 3D),
      Classe de Armadura, 6 atributos com modificador, anotações — tudo sincronizado
      em tempo real entre os jogadores (abre com duplo-clique no token ou botão
      "Abrir Ficha" quando selecionado)
- [x] **Papéis (Mestre vs Jogador)**: quem cria a sala vira Mestre automaticamente
      (promovido o próximo jogador se ele sair); Mestre controla o cenário (mapas,
      props, piso); cada jogador só arrasta/edita/remove os tokens que ele mesmo
      criou — tokens de outros ficam travados (🔒) com indicação de quem controla;
      Mestre pode tudo. Validado na prática enforçado pelo servidor, não só na UI.
- [x] **Persistência de sala**: tokens, cenário e histórico de dados são salvos em
      disco (JSON por sala, debounce de 1.5s) e recarregados automaticamente —
      derrubar/reiniciar o servidor não perde a campanha. Flush imediato ao sala
      ficar vazia e ao encerrar o processo (SIGINT/SIGTERM).
- [x] **Deploy público (túnel)**: o servidor serve o cliente buildado
      (`web/dist`) na mesma porta, então basta expor UMA porta. Documentado
      abaixo como expor com Cloudflare Tunnel (sem precisar de conta) pra
      jogar com o grupo fora da rede local.

**Próximos passos:**
- [ ] Biblioteca de assets / upload persistente (não só localStorage)
- [ ] Hospedagem permanente (Railway/Render/Fly.io) — o túnel documentado abaixo
      é só pra sessões de jogo pontuais, ele morre quando o processo para
- [ ] Mais temas visuais (moderno paranormal, terror, aventura — hoje o foco é medieval)

## Como rodar localmente

Em dois terminais:

```bash
# Terminal 1: servidor multiplayer
cd server
npm install
npm start          # roda em http://localhost:4000

# Terminal 2: cliente web
cd web
npm install
npm run dev        # roda em http://localhost:5173
```

Abra `http://localhost:5173`, crie uma sala e compartilhe o link (ou código) com
quem for jogar — todos entram na mesma sala e veem os tokens em tempo real.

Para apontar o cliente pra um servidor remoto, copie `web/.env.example` para
`web/.env` e ajuste `VITE_SERVER_URL`.

## Jogar com o grupo fora da rede local (deploy rápido via túnel)

Pra rodar uma sessão com amigos sem precisar de VPN/port-forward, exponha o
servidor com um túnel público. O servidor já serve o site (`web/dist`) e a
API/WebSocket na mesma porta, então um único túnel resolve tudo:

```bash
# 1. Builda o cliente (o servidor vai servi-lo automaticamente)
cd web && npm run build && cd ..

# 2. Sobe o servidor
cd server && npm start   # porta 4000

# 3. Em outro terminal: expõe a porta 4000 publicamente (Cloudflare Tunnel,
#    sem precisar de conta — baixe o binário em
#    https://github.com/cloudflare/cloudflared/releases)
cloudflared tunnel --url http://localhost:4000
```

O cloudflared imprime uma URL tipo `https://palavras-aleatorias.trycloudflare.com`
— é esse link que você compartilha com o grupo. Funciona pro site inteiro
(incluindo o WebSocket do multiplayer).

⚠️ Esse é um túnel **temporário**: ele só existe enquanto o comando está
rodando e muda de endereço toda vez. Pra um link fixo/permanente, hospede o
`server/` (com o `web/dist` builado dentro) em algo como Railway, Render ou
Fly.io.

## Como contribuir

1. Clone o repositório
2. `cd web && npm install`
3. Abra uma issue ou PR com sua ideia/feature

## Licença

MIT
