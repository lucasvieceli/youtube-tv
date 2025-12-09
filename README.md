## Player continuo de canais do YouTube

Interface pensada para TVs em clinicas, academias ou recepcoes: deixa um player do YouTube rodando sem parar, voce cadastra canais ou @handles, o app busca os videos mais recentes de cada um e cria uma fila em rodizio (round-robin) para evitar repeticao. Tambem da para fixar videos especificos, inserir propagandas em intervalos definidos (ex.: a cada 1 minuto aparece um video da academia) e sobrepor uma barra de mensagem personalizada.

### Ideia principal
- Centralizar a exibicao de varios canais do YouTube em um unico player, alternando automaticamente entre eles.
- Manter controle manual quando necessario: priorizar videos colados na hora, pular para o proximo, entrar em tela cheia.
- Oferecer espaco para comunicados/ads: barra de mensagem com texto e cores customizaveis e blocos de propaganda tocados a cada X minutos (perfeito para divulgar servicos na sala de espera ou ofertas relampago na academia).

### Como funciona
- Adicao de canais e videos: cole um link/ID de canal, @handle ou link de video. Links que parecem video vao direto para a fila manual.
- Coleta de videos: endpoints em `src/app/api` usam a YouTube Data API v3 para buscar os 10 videos mais recentes de cada canal (`/api/videos`) ou resolver IDs (`/api/resolve-channel`, `/api/resolve-video`).
- Montagem da fila: os videos dos canais entram em rodizio; os videos manuais aparecem antes da fila automatica. Tudo fica salvo em `localStorage` (canais, layout, ads e videos manuais).
- Propagandas: cadastre IDs/links de videos para serem tocados a cada intervalo configurado. Ao terminar, o player volta exatamente de onde parou o video principal.
- Layout: modo simples ou barra ticker configuravel (texto, cores, posicao, tamanho da fonte e velocidade).

### Requisitos
- Node 18+.
- Variavel de ambiente `YOUTUBE_API_KEY` no `.env.local`, com permissao para a YouTube Data API v3:

```bash
echo "YOUTUBE_API_KEY=sua_chave_aqui" > .env.local
```

### Rodando local
```bash
npm install
npm run dev
# abrir http://localhost:3000
```

### Pilha
- Next.js 16 (App Router) + React 19.
- Tailwind CSS 4 para estilos.
- `react-youtube` para embutir o player oficial.

### Pastas importantes
- `src/app/page.tsx`: UI principal, fila, controles e integracao com o player.
- `src/app/api/resolve-channel/route.ts`: resolve @handle/link para ID de canal via YouTube API.
- `src/app/api/videos/route.ts`: busca os videos mais recentes de cada canal.
- `src/app/api/resolve-video/route.ts`: valida links/IDs de videos e retorna metadados.
