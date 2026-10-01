# YouTube Watch Party

A real-time watch room where friends can join with a room code and watch the same YouTube video together. The backend is authoritative for room membership, playback state, and role permissions.

> **Project status:** Phases 0–12 are implemented and locally build/smoke-checked. Render deployment is configured in `render.yaml` but has not been created yet. Push this repository to GitHub, then connect the Blueprint in Render and provide a MongoDB Atlas connection string.

## Features

- Create a room or join using an 8-character room code / invite URL.
- Synchronize play, pause, seek, current video, and state for late joiners.
- Embed video through the YouTube IFrame Player API.
- Show online participants and their Host, Moderator, or Participant role.
- Host can promote/demote and remove participants. When the host leaves, the earliest remaining participant becomes host.
- Moderators control playback. Participants watch only.
- Backend validates role permissions for every protected Socket.IO action.
- Maximum of 20 participants per room; duplicate names in one room are rejected.
- Error handling for invalid or full rooms, invalid video IDs, API/socket failures, database availability, and removed users.

## Architecture

```text
React + TypeScript + Vite
   ├── REST: create/join room ─────────────┐
   └── Socket.IO: join/play/pause/seek ────┤
                                            v
                              Express + Socket.IO + TypeScript
                                            │
                                            v
                                     MongoDB / Mongoose
```

The REST API creates participant sessions and validates room joins. Socket.IO authenticates those sessions, uses the room code as a transport room, and carries live events. Before changing playback or roles, the server reloads the participant role from MongoDB and checks centralized permissions. MongoDB stores participants and the current playback snapshot; the YouTube player runs in each browser.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, React Router |
| Backend | Node.js, Express, TypeScript, Socket.IO |
| Database | MongoDB, Mongoose |
| Video | YouTube IFrame Player API |
| Deployment setup | Render Blueprint (`render.yaml`) |

## Project structure

```text
web3stack/
├── client/
│   ├── src/components/       # YouTube player
│   ├── src/hooks/            # Socket.IO watch-party hook
│   ├── src/services/         # Room REST API and YouTube API loader
│   ├── src/types/            # Frontend and socket event types
│   └── src/utils/            # YouTube URL/video-ID parsing
├── server/
│   └── src/
│       ├── config/           # Environment and MongoDB setup
│       ├── controllers/      # REST handlers
│       ├── models/           # Mongoose room schema
│       ├── routes/           # Express endpoints
│       ├── services/         # Room logic and permission policy
│       ├── sockets/          # Socket.IO event handlers
│       └── types/            # Server socket contracts
├── render.yaml              # Frontend + API Render Blueprint
└── README.md
```

## Local setup

Prerequisites: Node.js compatible with Vite 8, npm, and MongoDB running locally or an Atlas connection string.

1. Install and configure the server:

   ```powershell
   cd server
   npm install
   Copy-Item .env.example .env
   ```

   Set `MONGODB_URI` in `server/.env` to your local or Atlas database. Keep `.env` private; it is ignored by Git.

2. Start the backend in one terminal:

   ```powershell
   cd server
   npm run dev
   ```

   It listens on port `4000` by default. Check `http://localhost:4000/health` for API/database status.

3. Install and configure the client in another terminal:

   ```powershell
   cd client
   npm install
   Copy-Item .env.example .env
   npm run dev
   ```

   Open `http://localhost:5173`.

## Environment variables

### Server (`server/.env`)

| Variable | Required | Purpose | Local example |
|---|---|---|---|
| `PORT` | No | HTTP and Socket.IO listener port | `4000` |
| `CLIENT_ORIGIN` | Yes | Exact allowed browser origin for CORS | `http://localhost:5173` |
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb://127.0.0.1:27017/watch-party` |

### Client (`client/.env`)

| Variable | Required | Purpose | Local example |
|---|---|---|---|
| `VITE_API_URL` | No | REST API base URL | `http://localhost:4000` |
| `VITE_SOCKET_URL` | No | Socket.IO server URL | `http://localhost:4000` |

Vite embeds `VITE_*` values into the browser bundle at build time. Never place server secrets in client variables.

## REST API

| Method | Path | Body | Success |
|---|---|---|---|
| `POST` | `/api/rooms` | `{ "username": "Anoop" }` | `201` with room code, user ID, role, and session token |
| `POST` | `/api/rooms/:roomCode/join` | `{ "username": "Sam" }` | `201` with participant session |
| `GET` | `/health` | — | `200` when MongoDB is connected; `503` when degraded |

Expected API errors use JSON `{ "error": "..." }` and relevant HTTP statuses such as `400`, `404`, `409`, or `503`.

## Socket.IO events

### Client to server

| Event | Payload | Permission |
|---|---|---|
| `join_room` | `{ roomId, username }` | Valid session token required |
| `leave_room` | `{ roomId }` | Must belong to that room |
| `play` / `pause` | `{ time? }` | Host or Moderator |
| `seek` | `{ time }` | Host or Moderator |
| `change_video` | `{ videoId }` | Host or Moderator; valid 11-character ID |
| `assign_role` | `{ userId, role }` | Host only; role is Moderator or Participant |
| `remove_participant` | `{ userId }` | Host only |

### Server to client

`room_joined`, `sync_state`, `user_joined`, `user_left`, `role_assigned`, `participant_removed`, `play`, `pause`, `seek`, `change_video`, and `room_error`.

`sync_state` contains `{ playState, currentTime, videoId }`. For a playing room, the server estimates elapsed time from the snapshot timestamp so late joiners seek close to the current position.

## Role permissions

| Role | Playback and video changes | Assign roles | Remove participants |
|---|---:|---:|---:|
| Host | Yes | Yes | Yes |
| Moderator | Yes | No | No |
| Participant | No | No | No |

Disabled buttons are only a user-interface aid. The server authenticates the Socket.IO session and checks the current MongoDB role before processing protected actions.

## Testing

- Open two browser windows (or one normal and one incognito window).
- Create a room in the first window and join by invite link in the second.
- Change video, play, pause, and seek as host; confirm the other player follows.
- Promote the second user to Moderator; confirm they can control playback.
- Join with a third Participant; confirm playback actions are rejected by the server and surfaced as `room_error`.
- Try an invalid room code, duplicate room username, invalid video ID, and a 21st participant.
- Remove a participant; leave as host and confirm the earliest remaining user becomes host.
- Check `GET /health` while MongoDB is available.

The current local smoke checks passed for API room errors, duplicate names, Socket.IO authorization, video/playback broadcasts, role promotion, host transfer, room capacity, and cleanup.

## Render deployment

`render.yaml` describes a Render web service for the API and a Render static site for the Vite client. The API health check is `/health`; the client rewrite sends React Router paths to `index.html`.

1. Push the repository to GitHub.
2. In Render, create a **New Blueprint** and connect the pushed repository/branch containing `render.yaml`.
3. Provide `MONGODB_URI` as a secret value when prompted. Use MongoDB Atlas for a database reachable from Render and configure Atlas network access for the Render service.
4. Confirm the generated client URL matches the `CLIENT_ORIGIN` value in `render.yaml`; update it in the API service if Render assigns a different URL.
5. Deploy both services. Confirm the API `/health` endpoint reports the database as connected.
6. Open the client URL and repeat the two-browser room, playback, and role checks.

The Blueprint is prepared but has not been deployed yet; add the real frontend/backend URLs below after deployment:

- Frontend: pending
- Backend health endpoint: pending

Render supports public WebSocket connections on web services and static-site rewrite routes for React Router paths. See [Render WebSockets](https://render.com/docs/websocket), [Blueprint reference](https://render.com/docs/blueprint-spec), and [static-site rewrites](https://render.com/docs/redirects-rewrites).

## Screenshots

Add screenshots of the home page and an active room to a `docs/screenshots/` folder after choosing test accounts. No screenshots are included yet.

## Known limitations / next improvements

- Room state is stored in MongoDB; Socket.IO presence and real-time broadcasts currently use a single server instance.
- There is no Redis Socket.IO adapter yet for horizontal multi-instance scaling.
- Playback sync is event/snapshot based; it does not continuously correct playback drift.
- The browser session is held in memory, so refreshing the page requires rejoining with the room code.
- Host handoff is automatic to the earliest remaining participant; there is no manual host-transfer control.

## Git workflow examples

```bash
git status
git switch -c feat/room-invites
git add client/src server/src
git commit -m "feat: add room invite flow"
git push -u origin feat/room-invites
```

Commit small, reviewable changes with messages that describe the outcome. Keep `.env` files and database credentials out of commits.
