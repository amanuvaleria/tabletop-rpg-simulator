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
- **Estado do board:** Zustand (local por enquanto)
- **Realtime/Multiplayer:** WebSockets — ainda não implementado
- **Backend:** Node.js — ainda não implementado

## Status

🚧 Em construção.

**Feito:**
- [x] Tabuleiro 3D com grid
- [x] Câmera alternável 2D (topo) / 3D (livre)
- [x] Upload de PNG → token (personagem / NPC / objeto)
- [x] Drag & drop de tokens no tabuleiro
- [x] Seleção de token (redimensionar, remover)

**Próximos passos:**
- [ ] Multiplayer (sync de posição de tokens via WebSocket)
- [ ] Biblioteca de assets / upload persistente (não só localStorage)
- [ ] Mapas de fundo por tema (medieval, paranormal, terror, aventura)
- [ ] Sistema de dados (d4–d100)
- [ ] Fichas de personagem

## Como rodar localmente

```bash
cd web
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Como contribuir

1. Clone o repositório
2. `cd web && npm install`
3. Abra uma issue ou PR com sua ideia/feature

## Licença

MIT
