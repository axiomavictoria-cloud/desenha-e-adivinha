# Desenha & Adivinha

Jogo multiplayer de desenho e adivinhação para até 35 participantes.

## Rodar localmente
Requer Node.js 18 ou superior.

```bash
npm install
npm start
```

Abra http://localhost:3000.

## Como jogar
- O anfitrião cria uma sala e cadastra pelo menos 9 palavras (recomendado: 15).
- Compartilha o código da sala.
- Até 35 pessoas entram com apelidos.
- São 9 rodadas de 45 segundos, com sorteio de desenhista e chat de palpites.
- Acertos rendem pontos conforme o tempo restante.

As salas e pontuações ficam em memória; reiniciar o servidor encerra as partidas.
