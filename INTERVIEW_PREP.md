# Watch Party Interview Preparation

This guide describes the project as it exists in this repository. Be transparent in an interview: local builds and the Phase 12 smoke checks passed, but the Render Blueprint is prepared and the public deployment is still pending. Do not claim a deployed URL or multi-instance scaling that has not been implemented.

## 1. Project-specific questions (50)

1. **What does this application do?** It lets users create a room, invite people by code/link, and coordinate a YouTube video with shared playback events.
2. **Why is this a useful project?** It combines frontend state, REST APIs, real-time messaging, persistence, embedded media, and authorization in one end-to-end feature.
3. **What are the main components?** A React/Vite client, Express and Socket.IO server, MongoDB/Mongoose persistence, and the YouTube IFrame Player API.
4. **Why are client and server separate?** The client handles the user experience; the server protects shared state, room membership, and permissions.
5. **What does REST do here?** It creates a room and registers a participant session before the socket joins.
6. **Why use Socket.IO in addition to REST?** Playback and participant changes need low-latency server-to-client events without polling.
7. **What is the room code?** An 8-character uppercase hexadecimal identifier generated from random bytes.
8. **What is an application room?** The MongoDB document representing the room, participants, and playback snapshot.
9. **What is a Socket.IO room?** A server-side grouping used to direct live events to connected sockets currently in that room.
10. **How does a user authenticate a socket?** The client sends a session token in the Socket.IO handshake; the server hashes it and checks the matching room participant record.
11. **Why store a hash of the session token?** If the database is read, the raw bearer token is not directly available for reuse.
12. **How does the host start playback?** The client reads current player time, emits `play`, the server checks the user's current database role, persists playback state, and sends the event to peers.
13. **Why is the host's own player started immediately?** The browser's user-gesture policy can block playback that begins only after an asynchronous server response.
14. **How does pause synchronization work?** The client sends `pause` with current time; the authorized server stores paused state and broadcasts the time.
15. **How does seek synchronization work?** An authorized client emits the target seconds; the server validates and stores the value, then broadcasts it.
16. **How does a video change work?** The server validates the 11-character ID, stores it as the current video, resets time/state, and broadcasts `change_video`.
17. **How does a late joiner catch up?** `join_room` returns `sync_state`; the client waits for the YouTube player to cue the video, seeks to the snapshot position, then applies play/pause.
18. **How is elapsed time estimated for a playing room?** The server adds the elapsed wall-clock time since the persisted playback snapshot was updated.
19. **How are roles represented?** Each participant has one of `host`, `moderator`, or `participant` in the room document.
20. **What can a Host do?** Control playback, change the video, assign Moderator/Participant roles, and remove participants.
21. **What can a Moderator do?** Control playback and change the video, but cannot manage participants.
22. **What can a Participant do?** Watch the room and receive events, but cannot control playback or roles.
23. **Why is disabling a button not security?** A user can edit browser code or emit socket events manually; server-side checks are required.
24. **How does the server enforce roles?** Before each protected event it reloads the user's current participant record and checks the centralized permission policy.
25. **Where is permission policy centralized?** `server/src/services/permissions.ts`, so action rules are not duplicated in handlers.
26. **What happens when a Participant emits `play`?** The server responds with a `room_error` carrying status 403 and does not update or broadcast playback.
27. **How does role promotion reach the client?** The server updates MongoDB and emits `role_assigned`; the hook updates the participant list and current role.
28. **What happens if the host leaves?** The earliest remaining participant is promoted to host; if no participants remain, the room document is deleted.
29. **What happens if a participant is removed?** The host's action is authorized, the server removes that participant, emits `participant_removed`, and disconnects their socket.
30. **How are duplicate usernames handled?** The REST join service compares names case-insensitively within that room and returns HTTP 409 for a duplicate.
31. **What is the room capacity?** The MVP limit is 20 participants including the host; additional joins receive HTTP 409.
32. **How are invalid room codes handled?** Badly formatted codes return 400; a correctly formatted code with no matching room returns 404.
33. **How are invalid YouTube URLs handled?** The client parser rejects unsupported hosts or malformed IDs before sending; the server independently validates video IDs.
34. **What is the health endpoint?** `GET /health` reports whether the API's MongoDB connection is ready and uses 503 when degraded.
35. **How does API unavailability appear to the user?** The client catches network failures/timeouts and displays a readable message; socket connection failures also get a visible recovery prompt.
36. **What does CORS protect?** It controls which browser origins may make cross-origin HTTP requests; it is not user authentication or authorization.
37. **What is stored in MongoDB?** A room code, participant identities/roles/session-token hashes, playback state/time/video, and timestamps.
38. **Why use MongoDB for this MVP?** Room and participant data fit a document model, and Mongoose provides schemas, validation, and convenient persistence.
39. **Does the project continuously correct playback drift?** No; it synchronizes on events and on room join, which is appropriate for this MVP but permits drift over time.
40. **What if two moderators seek at the same time?** The server processes their events as they arrive; the later persisted event becomes the latest shared state.
41. **How are socket payloads validated?** Server handlers check required fields and validate values such as time ranges, role names, and video ID format.
42. **How is a room invite shared?** The client builds a URL containing the room code and uses the Clipboard API, with the code available if copying fails.
43. **Why use TypeScript for both sides?** It makes event payloads, roles, sessions, and component contracts explicit and catches many integration mistakes at build time.
44. **What did the local smoke checks cover?** Room create/join, duplicate and invalid-room responses, forbidden participant playback, video validation/broadcast, moderator promotion, host transfer, capacity, and room cleanup.
45. **What are the deployment targets?** A Render web service for the API and a Render static site for the client, with MongoDB Atlas as the managed database.
46. **Is it publicly deployed now?** No. The Blueprint is prepared; it still needs a pushed GitHub repository, an Atlas URI, and Render provisioning.
47. **What environment values differ in production?** `MONGODB_URI`, `CLIENT_ORIGIN`, `VITE_API_URL`, and `VITE_SOCKET_URL`; browser-facing URLs must be public HTTPS URLs.
48. **Why not put MongoDB credentials in Vite variables?** Vite client variables are bundled into public JavaScript and must never contain secrets.
49. **How would you scale the real-time server?** Add a Socket.IO Redis adapter, shared session/state strategy, load-balancer WebSocket support, and operational monitoring; this is not implemented yet.
50. **What would you improve next?** Add automated integration tests, reconnect/session recovery, drift correction, rate limits, persistence cleanup, and then validate the public deployment.

## 2. WebSocket questions (20)

1. **What is a WebSocket?** A protocol that upgrades an HTTP connection to a persistent, bidirectional channel.
2. **How does a WebSocket connection begin?** The client sends an HTTP upgrade request and the server accepts it with an upgrade response.
3. **How does WebSocket differ from ordinary HTTP requests?** HTTP is usually request/response; WebSocket stays open so either side can send messages.
4. **Why is WebSocket useful for watch parties?** It lets the server notify every room member immediately after a shared playback action.
5. **Is WebSocket inherently secure?** Use `wss://` in production to encrypt traffic with TLS; authorization and input checks are still required.
6. **Does WebSocket guarantee application-level delivery?** It preserves message order on one live connection, but the app must handle disconnects and recovery.
7. **What happens when a connection drops?** The transport closes; the app must reconnect or let the user rejoin and resynchronize state.
8. **What is full duplex?** Both peers can send data independently over the same established connection.
9. **Why not poll REST for every playback change?** Polling adds delay and repeated requests when nothing changed.
10. **Can REST and WebSockets be used together?** Yes; this project uses REST for setup and WebSockets for live events.
11. **What is a WebSocket frame?** A unit of protocol data carrying text or binary message content and control information.
12. **How are large messages handled?** WebSocket can fragment messages, but applications should still cap payload size and avoid unnecessary large messages.
13. **What is a ping/pong frame?** A control-frame pair used to check that a peer/connection is responsive.
14. **What is a heartbeat?** Periodic ping/pong or application messages that detect dead connections and keep state accurate.
15. **How does network latency affect playback sync?** A command arrives later at distant clients, so their player may lag by the network delay.
16. **How could drift be corrected?** Periodically compare authoritative time to local player time and seek or adjust playback rate when the difference exceeds a threshold.
17. **Can a WebSocket server broadcast to many users?** Yes, but it needs efficient fan-out and capacity planning for connections and message volume.
18. **How do load balancers affect WebSockets?** They must support connection upgrades and long-lived connections; Socket.IO polling fallback may need sticky sessions.
19. **What is backpressure?** A sender is producing messages faster than a receiver can process them; queues and limits prevent memory growth.
20. **What data should not be sent over an insecure socket?** Secrets and sensitive personal data; use TLS, minimize payloads, and avoid logging bearer tokens.

## 3. Socket.IO questions (20)

1. **What is Socket.IO?** A real-time library that provides event-based communication with reconnection and multiple transport support.
2. **Is Socket.IO the same protocol as WebSocket?** No; it uses its own Engine.IO/Socket.IO protocol and may use WebSocket or HTTP long-polling.
3. **What does `io()` create on the client?** A Socket.IO client manager/socket connection to the server endpoint.
4. **What does `socket.on(event, handler)` do?** Registers a callback for a named event.
5. **What does `socket.emit(event, payload)` do?** Sends a named application event with its payload to the other side.
6. **What does `socket.join(roomId)` do?** Adds the server-side socket to a named broadcast group.
7. **How do you broadcast to a room?** `io.to(roomId).emit(event, payload)` sends to sockets in that room, including the sender.
8. **How do you broadcast to everyone except the sender?** `socket.to(roomId).emit(event, payload)`.
9. **How does `socket.leave(roomId)` work?** It removes that socket from the server-side room group.
10. **What is the difference between `io` and `socket`?** `io` addresses the server and groups of clients; `socket` represents one client connection.
11. **What does the handshake carry here?** The session token in `socket.handshake.auth`, which the server validates before joining a room.
12. **Why use Socket.IO rooms?** They provide simple room-scoped broadcasts without maintaining custom lists of socket IDs.
13. **What is a namespace?** A logical communication endpoint that can separate event handlers over one underlying connection.
14. **What is an acknowledgement?** A callback-based response to one emitted event, useful for request/response flows over sockets.
15. **Does this project use acknowledgements?** No; it sends explicit result/error events. Acks could make command success handling more direct.
16. **What is Socket.IO reconnection?** Client behavior that attempts a new connection after losing transport; the application still needs to re-authenticate and resync.
17. **Why might polling fallback matter?** It helps in networks where WebSocket upgrades are blocked, at the cost of additional HTTP requests.
18. **How do multiple Socket.IO servers share room broadcasts?** With a compatible adapter such as the Redis adapter; the current app runs one server instance.
19. **How are errors emitted in this project?** A `room_error` event carries a message, status code, and optionally the event name.
20. **Why re-read the role from MongoDB on protected events?** It prevents stale socket role data from preserving privileges after a role change.

## 4. React questions (15)

1. **What is a React component?** A reusable function that returns UI from props and state.
2. **What is state?** Data owned by a component that causes the UI to rerender when updated.
3. **What is a prop?** An input passed from a parent component to a child.
4. **Why use a custom hook here?** `useWatchParty` encapsulates socket lifecycle, connection state, participants, and event methods.
5. **What does `useEffect` do?** It synchronizes component behavior with external systems such as the YouTube player or a socket.
6. **Why use `useRef` for the player?** It exposes imperative play/seek methods without rerendering on every player operation.
7. **Why use `useCallback` for the playback callback?** It keeps a stable function identity for socket registration while a ref holds the latest callback.
8. **What is controlled input?** An input whose displayed value comes from React state and changes through an event handler.
9. **Why disable participant controls?** It communicates their watch-only capability in the UI, while the server separately enforces it.
10. **How does React Router work in this app?** `BrowserRouter` reads browser history and route components render for paths such as `/join` and `/room/:roomCode`.
11. **Why use a ref to store the YouTube handle?** The parent can invoke the iframe API methods through a small typed interface.
12. **What is lifting state up?** Placing shared state in a common ancestor so sibling routes/components can use the same room session.
13. **How are async API errors shown?** The page sets error state in a `catch` block and renders an alert message.
14. **What does StrictMode do in development?** It helps reveal unsafe side effects by applying extra development checks; it does not change production behavior.
15. **How would you prevent stale socket closures?** Keep current callbacks/state in refs or register effects with the right dependencies and clean up listeners.

## 5. Node.js and Express questions (15)

1. **What is Node.js?** A JavaScript runtime built on V8 that uses an event-driven, nonblocking I/O model.
2. **What is Express?** A Node framework for routing HTTP requests through middleware and handlers.
3. **What is middleware?** A function that can inspect/change a request and response or pass control onward.
4. **Why use `express.json()`?** It parses JSON request bodies so controllers can read values such as `username`.
5. **What does the controller do?** It translates an HTTP request into a service call and formats the response.
6. **Why separate services from controllers?** Business rules remain reusable and do not depend on HTTP details.
7. **How does Express error middleware work?** Errors passed to `next(error)` reach a centralized handler that maps them to safe responses.
8. **Why return generic 500 text for unknown errors?** Internal stack traces may expose implementation details; the server logs the error while clients get a safe message.
9. **What is CORS?** A browser policy configured by response headers to control cross-origin web access.
10. **How does the HTTP server host Socket.IO?** Socket.IO attaches to the same Node HTTP server created around the Express app.
11. **Why read `PORT` from the environment?** Hosting providers assign a port dynamically; local development can use a fallback.
12. **What is graceful shutdown?** Stop accepting new work, close sockets/server, and release database resources before process exit.
13. **How should unhandled async route errors be managed?** Pass them to centralized error middleware, or use a framework-supported async wrapper.
14. **What is a process-level environment variable?** Configuration supplied to the runtime without hardcoding it in source code.
15. **How does the health route help deployment?** Render can avoid routing traffic to an API whose database is not ready.

## 6. MongoDB and Mongoose questions (15)

1. **What is MongoDB?** A document database that stores BSON documents in collections.
2. **What is Mongoose?** An ODM that maps JavaScript objects to MongoDB documents and adds schemas/validation.
3. **What is a Mongoose schema?** A description of document fields, types, constraints, and defaults.
4. **Why embed participants inside a room?** For this small bounded room model, reading or updating room state with its participants is convenient.
5. **What is an index?** A data structure that speeds up lookups; the unique roomCode index also prevents duplicate room codes.
6. **What is a unique index?** A database constraint that rejects duplicate indexed values.
7. **What is Mongoose document validation?** Schema rules are checked before saving and invalid documents fail.
8. **What is a document update?** A change to a room or participant that is persisted with a Mongoose save/update operation.
9. **Why store `updatedAt` with playback?** The server estimates current time for late joiners when the room is playing.
10. **Why store the session token hash?** It supports authentication without persisting the raw bearer token.
11. **What is a connection string?** A URI containing database host and connection settings, and often credentials.
12. **Why keep the Mongo URI in an environment variable?** It is environment-specific and contains credentials that must not be committed.
13. **What does connection `readyState` indicate?** Mongoose's current connection state, used by the health endpoint.
14. **What is a race condition in room joins?** Concurrent requests may read the same participant count before either saves; robust capacity enforcement can use atomic conditional updates/transactions.
15. **When would you choose references instead of embedded participants?** When participant records grow independently, become very large, or need cross-room querying and lifecycle management.

## 7. TypeScript questions (15)

1. **What does TypeScript add to JavaScript?** Static type checking and editor tooling before runtime.
2. **What is a type alias?** A name for a type expression, such as the `RoomRole` union.
3. **What is a union type?** A value may have one of several types or literal values.
4. **Why define socket event interfaces?** They keep client and server event names and payload shapes explicit.
5. **What is an interface?** A structural contract describing an object's expected properties.
6. **What is a generic?** A reusable type parameter that preserves information, such as `postJson<T>()`.
7. **What does `unknown` mean?** A value of unknown type that must be narrowed before safe use.
8. **How do type guards help?** Runtime checks narrow an unknown value to a safe type.
9. **What does `strict` enable?** A collection of stronger checks, including null safety and reduced implicit typing.
10. **Why still validate at runtime?** Types are erased in emitted JavaScript and network payloads can be forged.
11. **What does `as` do?** It tells TypeScript to treat a value as a type; it does not validate the value at runtime.
12. **What is an optional property?** A property that may be absent, written with `?`.
13. **What is a discriminated union?** A union whose shared literal field lets code narrow to a particular variant, as in playback commands.
14. **What does `Promise<RoomSession>` communicate?** An async function resolves to a room session object.
15. **How can shared event types get out of sync across packages?** Put contracts in a shared workspace package or generate schemas; here the interfaces are mirrored separately.

## 8. YouTube IFrame API questions (10)

1. **What is the YouTube IFrame Player API?** A JavaScript API for controlling an embedded YouTube player.
2. **What is a video ID?** The stable identifier used by YouTube embed/player methods to locate a video.
3. **Why parse URLs into IDs?** The API needs a video ID, while users may paste watch, short, embed, or shorts URLs.
4. **How does the app load the API?** It injects the official iframe API script once and waits for its ready callback.
5. **What does `playVideo()` do?** It asks the iframe player to begin playback, subject to browser and video constraints.
6. **What does `pauseVideo()` do?** It pauses the embedded player.
7. **What does `seekTo(seconds, allowSeekAhead)` do?** It moves playback to a timestamp in seconds.
8. **Why wait for player ready/cued before sync?** Calls made before initialization or video cueing may be ignored or applied to the wrong video.
9. **Can every YouTube video be embedded?** No; owners, region restrictions, age restrictions, or video state can prevent playback.
10. **Why map player error codes to messages?** A clear explanation helps distinguish invalid IDs, removed videos, and embedding restrictions.

## 9. System design questions (15)

1. **How would you scale to 1,000+ concurrent users?** Measure room traffic, use multiple Socket.IO instances with a Redis adapter, shard/scale storage, and load test connection fan-out.
2. **Why would Redis Pub/Sub help?** It distributes Socket.IO room broadcasts across server instances.
3. **How would you prevent drift?** Periodically compare authoritative playback time with player time and correct small/large offsets appropriately.
4. **How would you handle simultaneous moderator commands?** Define ordering using server receipt time or a monotonically increasing room version and reject stale updates if needed.
5. **How would you recover after reconnect?** Re-authenticate, rejoin the room, fetch a fresh authoritative snapshot, and resume event subscriptions.
6. **How would you avoid replaying stale commands after reconnect?** Use sequence numbers or room state versions and ignore events older than the applied version.
7. **How would you scale MongoDB?** Add indexes, monitor query patterns, use replica sets, and shard only when workload justifies the operational cost.
8. **What is the system's main bottleneck?** At scale, socket fan-out and database reads/writes for every protected action and state update may dominate.
9. **How might you reduce database traffic?** Cache/authorize carefully, batch state writes, and use Redis/shared presence while preserving authoritative permission checks.
10. **How would you keep room presence accurate?** Track active socket counts/heartbeats and clean up on disconnect with a short grace period for transient failures.
11. **How would you enforce capacity under concurrency?** Perform an atomic conditional update or transaction based on participant count instead of separate read-then-save operations.
12. **How would you protect against abuse?** Add rate limits, payload limits, input validation, per-room quotas, origin checks, and monitoring.
13. **How would you handle host failure?** The MVP promotes the earliest remaining participant on disconnect; a production design may include heartbeat grace and explicit host-transfer rules.
14. **How would you deploy safely?** Keep secrets in the host's secret manager, configure health checks, deploy staged changes, and run production smoke checks.
15. **How would you observe production health?** Collect structured logs, connection/latency/error metrics, database health, room counts, and alert on sustained failures.
