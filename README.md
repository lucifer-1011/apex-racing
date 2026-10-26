# Apex Rider

3D browser motorcycle game (Three.js). Four stages, four bikes, manual gears + clutch,
Challenge / Ghost / Free Roam modes, touch + keyboard controls.

- `index.html` is the whole game. Open it in a browser or deploy as a static site (Vercel).
- `server/` is the multiplayer relay (Cloudflare Worker + Durable Object).

## Multiplayer (2 to 5 players)

Players connect to a small relay on Cloudflare (`server/`). One player creates a room and shares
the 4-letter code or invite link; friends join, ready up, and the host starts the race.

Deploy the relay once (free Cloudflare account):

```bash
cd server
npm install
npx wrangler login      # opens the browser once
npx wrangler deploy     # prints https://apex-rider-relay.<you>.workers.dev
```

Then set `RELAY_URL` near the top of the multiplayer section in `index.html` to the
`wss://apex-rider-relay.<you>.workers.dev` address and push.

Local testing: `cd server && npx wrangler dev` and use `ws://localhost:8787` as `RELAY_URL`.
