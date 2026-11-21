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
- **Backend:** Node.js + Express + Socket.IO (`server/`), estado em memória por sala

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

**Próximos passos:**
- [ ] Persistência de sala (hoje o estado é só em memória no servidor)
- [ ] Biblioteca de assets / upload persistente (não só localStorage)
- [ ] Mapas de fundo por tema (medieval, paranormal, terror, aventura)
- [ ] Sistema de dados (d4–d100)
- [ ] Fichas de personagem
- [ ] Papéis (Mestre vs Jogador) com permissões diferentes

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

## Como contribuir

1. Clone o repositório
2. `cd web && npm install`
3. Abra uma issue ou PR com sua ideia/feature

## Licença

MIT
