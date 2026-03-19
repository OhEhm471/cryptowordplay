# ⚡ Crypto Wordplay

> Daily crypto-native word puzzle on Farcaster + Base ecosystem.  
> Guess the hidden crypto term in exactly 4 attempts. Compete globally.

---

## Project Structure

```
cryptowordplay/
├── backend/                          Node.js + Express + PostgreSQL + Redis
│   └── src/
│       ├── server.js                 Entry point, mounts routes + scheduler
│       ├── routes/index.js           All 25 API routes
│       ├── controllers/
│       │   ├── gameController.js     Guess flow, session management
│       │   ├── leaderboardController.js
│       │   ├── playerController.js
│       │   ├── farcasterController.js  Manifest, frame, webhook
│       │   ├── achievementController.js  Sprint 3
│       │   ├── ogController.js         Sprint 3: dynamic image cards
│       │   └── adminController.js      Sprint 3: admin dashboard + tools
│       ├── services/
│       │   ├── wordEngine.js         Deterministic daily word + evaluation
│       │   ├── scoreEngine.js        Server-side scoring, streak calc
│       │   ├── leaderboardService.js PostgreSQL leaderboard queries
│       │   ├── realtimeLeaderboard.js  Sprint 3: Redis sorted-set leaderboard
│       │   ├── playerService.js      Upsert by wallet/FID, stats
│       │   ├── achievementDefinitions.js  Sprint 3: 24 achievements
│       │   ├── achievementService.js  Sprint 3: unlock detection + persistence
│       │   ├── ogImageService.js      Sprint 3: @napi-rs/canvas PNG generator
│       │   ├── notificationService.js Sprint 3: Farcaster push notifications
│       │   ├── shareGenerator.js     Emoji grid share text
│       │   └── analyticsService.js   Fire-and-forget event tracking
│       ├── middleware/
│       │   ├── auth.js               Wallet sig verify + Farcaster FID
│       │   ├── adminAuth.js          Sprint 3: JWT admin protection
│       │   ├── rateLimiter.js        Per-route rate limits
│       │   └── errorHandler.js
│       ├── db/
│       │   ├── postgres.js           pg Pool + healthCheck
│       │   ├── redis.js              Cache wrapper + graceful fallback
│       │   ├── migrate.js            6 migrations (Sprints 1-2)
│   │   ├── migrations_s3.js   3 migrations (Sprint 3)
│   │   ├── migrations_s4.js   2 migrations (Sprint 4 badges)
│   │   ├── migrations_s4c.js  1 migration  (Sprint 4C word lists)
│   │   └── migrations_s4d.js  1 migration  (Sprint 4D A/B testing)
│       │   └── migrations_s3.js      3 migrations (Sprint 3)
│       └── utils/
│           ├── logger.js             Winston structured logging
│           ├── redisClient.js        Sprint 3: singleton for sorted sets
│           └── scheduler.js          Sprint 3: cron jobs
│
└── frontend/                         React + Vite + wagmi
    ├── public/
    │   ├── .well-known/
    │   │   └── farcaster.json        Farcaster Mini App manifest ← fill in before deploy
    │   └── README.md                 Asset checklist (icon.png, splash.png, og-image.png)
    └── src/
        ├── index.css                 All global styles (cyberpunk terminal theme)
        ├── main.jsx                  React entry + CSS import
        ├── App.jsx                   WagmiProvider + QueryClient
        ├── components/
        │   ├── Game.jsx              Main game UI: board, keyboard, modals
        │   ├── WalletButton.jsx      Connect wallet / Farcaster identity
        │   └── AchievementsModal.jsx Sprint 3: achievement grid + filters
        ├── hooks/
        │   ├── useGame.js            Full game state machine → API
        │   ├── useLeaderboard.js     Fetch daily/alltime + mock fallback
        │   └── useWalletAuth.js      wagmi + Farcaster frame SDK detection
        └── lib/
            ├── api.js                All backend API calls
            └── wagmi.js              Base + Ethereum chain config
```

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 7+

### Backend
```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL, REDIS_URL, WORD_SALT, ADMIN_SECRET
npm install
npm run migrate             # migrations 1-6 (Sprints 1-2)
npm run migrate:s3          # migrations 7-9 (Sprint 3)
npm run migrate:s4          # migrations 10-11 (Sprint 4: badge tables)
npm run migrate:s4c         # migration 12 (Sprint 4C: word_lists table)
npm run migrate:s4d         # migration 13 (Sprint 4D: A/B testing tables)
npm run dev                 # starts on :3001
```

### Frontend
```bash
cd frontend
cp .env.example .env.local  # fill in VITE_API_URL, VITE_WALLETCONNECT_PROJECT_ID
npm install
npm run dev                 # starts on :5173, proxies /api → :3001
```

### Run both together (from root)
```bash
npm install    # installs concurrently
npm run dev
```

---

## Before Deploying to Production

1. **Fill in `frontend/public/.well-known/farcaster.json`**  
   Get `header`, `payload`, `signature` from https://warpcast.com/~/developers/mini-apps  
   Update `webhookUrl` to your actual backend URL.

2. **Add required public assets** (see `frontend/public/README.md`):
   - `icon.png` — 200×200 app icon
   - `splash.png` — 200×200 splash screen
   - `og-image.png` — 1200×630 static fallback OG image

3. **Set all env vars** — see `backend/.env.example` and `frontend/.env.example`

4. **Run migrations** — run all 5 migration scripts in order (migrate, migrate:s3, migrate:s4, migrate:s4c, migrate:s4d)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/game/daily/:length` | Load daily challenge |
| POST | `/api/game/guess` | Submit guess (server-evaluates) |
| GET | `/api/leaderboard/daily` | Daily leaderboard |
| GET | `/api/leaderboard/alltime` | All-time leaderboard |
| GET | `/api/achievements` | Player achievements |
| GET | `/api/og/daily` | Dynamic daily challenge card (PNG) |
| GET | `/api/og/result` | Result share card (PNG) |
| POST | `/api/farcaster/webhook` | Farcaster lifecycle events |
| GET | `/.well-known/farcaster.json` | Mini App manifest |
| POST | `/api/admin/login` | Get admin JWT |
| GET | `/api/admin/dashboard` | Analytics overview |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, wagmi v2, @farcaster/frame-sdk |
| Backend | Node.js, Express 4, PostgreSQL 14, Redis 7 |
| Auth | Wallet signature (viem), Farcaster FID |
| OG Images | @napi-rs/canvas |
| Deploy | Vercel (frontend), Fly.io (backend) |

---

## PostgreSQL Tables

`players` · `game_sessions` · `leaderboard_entries` · `player_stats` · `player_achievements` · `player_notification_tokens` · `analytics_events` · `schema_migrations`

---

## Testing

### Unit tests — run anywhere, no infrastructure needed
```bash
cd backend
npm run test:unit
# Covers: wordEngine (28 cases), scoreEngine (23 cases)
# Tests pure game logic — evaluation, scoring, streaks, validation
```

### Mock integration tests — no real DB needed
```bash
cd backend
npm run test:mock
# Covers: game API (20 cases), admin API (20 cases)
# All DB/Redis calls are mocked — fast and portable
```

### Real DB integration tests — requires Postgres + Redis
```bash
# Start test databases (separate ports from dev: 5433, 6380)
docker compose -f docker-compose.test.yml up -d

# Run migrations against test DB (once, or after schema changes)
DATABASE_URL=postgresql://cwp_test:cwp_test@localhost:5433/cwp_test \
  node backend/src/db/migrate_all.js

# Run tests
cd backend && npm run test:integration
# Covers: game loop (18), leaderboard + stats (11), word list CRUD (14)
```

### All tests
```bash
docker compose -f docker-compose.test.yml up -d
cd backend && npm test
```

### Smart contract tests
```bash
cd contracts && npx hardhat test
# Covers: badge minting, soulbound, access control (16 cases)
```
