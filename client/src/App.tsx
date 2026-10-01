import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router";
import YouTubePlayer, { type YouTubePlayerHandle } from "./components/YouTubePlayer";
import { useWatchParty } from "./hooks/useWatchParty";
import { createRoom, joinRoom } from "./services/roomApi";
import type { YouTubePlayerState } from "./services/youtubeApi";
import type { PlaybackCommand, RoomRole, RoomSession } from "./types/watchParty";
import { extractYouTubeVideoId } from "./utils/youtube";
import "./App.css";

const INITIAL_VIDEO_ID = "M7lc1UVf-VE";
const PLAYER_STATES: Record<YouTubePlayerState, string> = {
  [-1]: "Unstarted", 0: "Ended", 1: "Playing", 2: "Paused", 3: "Buffering", 5: "Video cued",
};

function App() {
  const navigate = useNavigate();
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [username, setUsername] = useState("");
  const [session, setSession] = useState<RoomSession | null>(null);
  const [videoInput, setVideoInput] = useState("");
  const [videoId, setVideoId] = useState(INITIAL_VIDEO_ID);
  const [playerReady, setPlayerReady] = useState(false);
  const [cuedVideoId, setCuedVideoId] = useState<string | null>(null);
  const [roomSnapshot, setRoomSnapshot] = useState<Extract<PlaybackCommand, { type: "sync_state" }> | null>(null);
  const appliedSnapshotRef = useRef<typeof roomSnapshot>(null);
  const [seekInput, setSeekInput] = useState("30");
  const [playerState, setPlayerState] = useState("Loading YouTube player…");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);

  const applyPlaybackCommand = useCallback((command: PlaybackCommand) => {
    switch (command.type) {
      case "play": playerRef.current?.seekTo(command.time); playerRef.current?.play(); break;
      case "pause": playerRef.current?.seekTo(command.time); playerRef.current?.pause(); break;
      case "seek": playerRef.current?.seekTo(command.time); break;
      case "change_video": setVideoId(command.videoId); break;
      case "sync_state":
        setRoomSnapshot(command);
        if (command.videoId) setVideoId(command.videoId);
        break;
    }
  }, []);
  const party = useWatchParty(applyPlaybackCommand);

  useEffect(() => {
    if (!roomSnapshot || !playerReady || !roomSnapshot.videoId || videoId !== roomSnapshot.videoId ||
      cuedVideoId !== roomSnapshot.videoId || appliedSnapshotRef.current === roomSnapshot) return;
    playerRef.current?.seekTo(roomSnapshot.currentTime);
    if (roomSnapshot.playState === "playing") playerRef.current?.play();
    else playerRef.current?.pause();
    appliedSnapshotRef.current = roomSnapshot;
  }, [roomSnapshot, playerReady, videoId, cuedVideoId]);

  async function enterRoom(action: "create" | "join", roomCode = "") {
    setBusy(true);
    setFormError("");
    try {
      const nextSession = action === "create" ? await createRoom(username.trim()) : await joinRoom(roomCode.trim().toUpperCase(), username.trim());
      setRoomSnapshot(null);
      appliedSnapshotRef.current = null;
      setPlayerReady(false);
      setCuedVideoId(null);
      setSession(nextSession);
      party.connectToRoom(nextSession);
      navigate(`/room/${nextSession.roomCode}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not enter the room");
    } finally { setBusy(false); }
  }

  function handleChangeVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextVideoId = extractYouTubeVideoId(videoInput);
    if (!nextVideoId) { setFormError("Enter a valid YouTube video URL or 11-character video ID."); return; }
    setFormError("");
    party.sendChangeVideo(nextVideoId);
    setVideoInput("");
  }
  function handlePlay() {
    const time = playerRef.current?.getCurrentTime() ?? 0;
    playerRef.current?.play();
    party.sendPlay(time);
  }
  function handlePause() {
    const time = playerRef.current?.getCurrentTime() ?? 0;
    playerRef.current?.pause();
    party.sendPause(time);
  }
  function handleSeek() {
    const time = Number(seekInput);
    if (!Number.isFinite(time) || time < 0) { setFormError("Seek time must be a non-negative number of seconds."); return; }
    setFormError("");
    playerRef.current?.seekTo(time);
    party.sendSeek(time);
  }
  function leaveRoom() {
    party.leaveRoom();
    setSession(null);
    setVideoInput("");
    setFormError("");
    setRoomSnapshot(null);
    appliedSnapshotRef.current = null;
    setPlayerReady(false);
    setCuedVideoId(null);
    navigate("/");
  }
  function returnToJoin(roomCode: string) {
    party.leaveRoom();
    setSession(null);
    setRoomSnapshot(null);
    appliedSnapshotRef.current = null;
    setPlayerReady(false);
    setCuedVideoId(null);
    navigate(`/room/${roomCode}`);
  }
  async function copyInvite() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${session.roomCode}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setFormError("Could not copy the invite link. You can share the room code instead."); }
  }

  return <main className="app-shell">
    <header className="topbar">
      <Link className="brand" to="/" aria-label="Watch Together home"><span className="brand-mark">W</span><span>watch<span className="brand-light">together</span></span></Link>
      <span className="phase-tag">REAL-TIME WATCH PARTIES · PHASE 11</span>
    </header>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/create" element={<EntryPage username={username} setUsername={setUsername} busy={busy} error={formError} onSubmit={() => void enterRoom("create")} />} />
      <Route path="/join" element={<JoinPage inviteCode="" username={username} setUsername={setUsername} busy={busy} error={formError} onSubmit={(code) => void enterRoom("join", code)} />} />
      <Route path="/room/:roomCode" element={session ? <WatchRoom session={session} party={party} playerRef={playerRef} videoId={videoId} videoInput={videoInput} setVideoInput={setVideoInput} playerState={playerState} setPlayerReady={setPlayerReady} setCuedVideoId={setCuedVideoId} onPlayerState={setPlayerState} onPlayerError={setFormError} onChangeVideo={handleChangeVideo} onPlay={handlePlay} onPause={handlePause} seekInput={seekInput} setSeekInput={setSeekInput} onSeek={handleSeek} onLeave={leaveRoom} onReturnToJoin={() => returnToJoin(session.roomCode)} onCopyInvite={() => void copyInvite()} copied={copied} formError={formError} setFormError={setFormError} /> : <RoomJoinPage username={username} setUsername={setUsername} busy={busy} error={formError} onSubmit={(code) => void enterRoom("join", code)} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </main>;
}

function HomePage() {
  return <section className="lobby home-page">
    <p className="eyebrow">A SHARED SCREEN, WHEREVER YOU ARE</p>
    <h1>Watch together.<br /><span>Stay in sync.</span></h1>
    <p className="intro-copy">Bring friends into one room and enjoy the same video, at the same time.</p>
    <div className="home-actions"><Link className="primary-button home-action" to="/create">Create a watch party</Link><Link className="secondary-button home-action" to="/join">Join a room</Link></div>
    <div className="feature-row"><span>One shared player</span><span>Live room presence</span><span>Host and moderator controls</span></div>
  </section>;
}

function EntryPage({ username, setUsername, busy, error, onSubmit }: { username: string; setUsername: (name: string) => void; busy: boolean; error: string; onSubmit: () => void }) {
  return <section className="lobby entry-page">
    <p className="eyebrow">START A NEW ROOM</p><h1>Create your<br /><span>watch party.</span></h1>
    <p className="intro-copy">Choose the name your friends will see in the room.</p>
    <div className="lobby-card">
      <label className="field-label" htmlFor="create-username">Your name</label>
      <input id="create-username" className="text-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. Alex" maxLength={24} />
      <button className="primary-button full-width" type="button" disabled={busy || username.trim().length < 2} onClick={onSubmit}>{busy ? "Creating room…" : "Create room"}</button>
      {error && <p className="error-message" role="alert">{error}</p>}
      <Link className="back-link" to="/">← Back home</Link>
    </div>
  </section>;
}

function JoinPage({ inviteCode, username, setUsername, busy, error, onSubmit }: { inviteCode: string; username: string; setUsername: (name: string) => void; busy: boolean; error: string; onSubmit: (code: string) => void }) {
  const [roomCode, setRoomCode] = useState(inviteCode ?? "");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(roomCode); }
  return <section className="lobby entry-page">
    <p className="eyebrow">JOIN YOUR FRIENDS</p><h1>Enter the<br /><span>watch party.</span></h1>
    <p className="intro-copy">Use the room code shared by your host.</p>
    <form className="lobby-card" onSubmit={submit}>
      <label className="field-label" htmlFor="join-username">Your name</label>
      <input id="join-username" className="text-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. Alex" maxLength={24} />
      <label className="field-label separated-label" htmlFor="room-code">Room code</label>
      <input id="room-code" className="text-input room-code-input" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="8-character code" maxLength={8} />
      <button className="primary-button full-width" type="submit" disabled={busy || username.trim().length < 2 || roomCode.trim().length === 0}>{busy ? "Joining room…" : "Join room"}</button>
      {error && <p className="error-message" role="alert">{error}</p>}
      <Link className="back-link" to="/">← Back home</Link>
    </form>
  </section>;
}

function RoomJoinPage(props: Omit<Parameters<typeof JoinPage>[0], "inviteCode">) {
  const { roomCode = "" } = useParams();
  return <JoinPage key={roomCode} inviteCode={roomCode} {...props} />;
}

type Party = ReturnType<typeof useWatchParty>;
function WatchRoom(props: {
  session: RoomSession; party: Party; playerRef: React.RefObject<YouTubePlayerHandle | null>; videoId: string; videoInput: string; setVideoInput: (value: string) => void;
  playerState: string; setPlayerReady: (value: boolean) => void; setCuedVideoId: (value: string | null) => void; onPlayerState: (value: string) => void; onPlayerError: (value: string) => void;
  onChangeVideo: (event: FormEvent<HTMLFormElement>) => void; onPlay: () => void; onPause: () => void; seekInput: string; setSeekInput: (value: string) => void; onSeek: () => void; onLeave: () => void; onReturnToJoin: () => void; onCopyInvite: () => void;
  copied: boolean; formError: string; setFormError: (value: string) => void;
}) {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { session, party } = props;
  const currentRole = party.currentRole ?? session.role;
  const canControl = currentRole === "host" || currentRole === "moderator";
  const isHost = currentRole === "host";
  const isConnected = party.connectionState === "joined";
  useEffect(() => { if (roomCode && roomCode.toUpperCase() !== session.roomCode.toUpperCase()) navigate(`/room/${session.roomCode}`, { replace: true }); }, [roomCode, session.roomCode, navigate]);
  return <section className="watch-room">
    <div className="room-heading"><div><p className="eyebrow">WATCH PARTY ROOM</p><h1>{session.username}<span className="heading-light">’s room</span></h1></div><button className="text-button" type="button" onClick={props.onLeave}>Leave room</button></div>
    <div className="room-code-row"><span>ROOM CODE</span><code>{session.roomCode}</code><button className="invite-button" type="button" onClick={props.onCopyInvite}>{props.copied ? "Copied invite" : "Copy invite link"}</button><span className={`connection-pill ${isConnected ? "online" : ""}`}><span className="status-dot" />{party.connectionState}</span></div>
    {(party.connectionState === "disconnected" || party.connectionState === "removed") && <div className="recovery-banner" role="status"><span>{party.roomError || "Your connection to this room ended."} Rejoin using the room code to continue.</span><button className="secondary-button" type="button" onClick={props.onReturnToJoin}>Return to join screen</button></div>}
    <div className="room-layout">
      <section className="player-card" aria-label="Shared YouTube player">
        <YouTubePlayer ref={props.playerRef} videoId={props.videoId}
          onReady={(loadedVideoId) => { props.setPlayerReady(true); props.setCuedVideoId(loadedVideoId); props.onPlayerState("Ready"); }}
          onStateChange={(state, loadedVideoId) => { props.onPlayerState(PLAYER_STATES[state] ?? "Unknown state"); if ((state === -1 || state === 5) && loadedVideoId) props.setCuedVideoId(loadedVideoId); }}
          onError={props.onPlayerError} />
        <div className="player-toolbar">
          <form className="video-form" onSubmit={props.onChangeVideo}><label className="field-label" htmlFor="video-url">YouTube URL or video ID</label><div className="input-row"><input id="video-url" className="text-input" value={props.videoInput} onChange={(event) => props.setVideoInput(event.target.value)} placeholder="Paste a YouTube link" disabled={!canControl || !isConnected} /><button className="secondary-button" type="submit" disabled={!canControl || !isConnected}>Change video</button></div></form>
          <div className="player-controls"><button type="button" onClick={props.onPlay} disabled={!canControl || !isConnected}>Play</button><button type="button" onClick={props.onPause} disabled={!canControl || !isConnected}>Pause</button><div className="seek-controls"><label className="sr-only" htmlFor="seek-time">Seek time in seconds</label><input id="seek-time" className="text-input seek-input" type="number" min="0" value={props.seekInput} onChange={(event) => props.setSeekInput(event.target.value)} disabled={!canControl || !isConnected} /><button type="button" onClick={props.onSeek} disabled={!canControl || !isConnected}>Seek (s)</button></div></div>
          <div className="player-meta"><span><span className="status-dot" />{props.playerState}</span><code>{props.videoId}</code></div>
          {props.formError && <p className="error-message" role="alert">{props.formError}</p>}
          {!canControl && <p className="watch-only-note">You’re watching as a participant. Playback controls are disabled.</p>}
        </div>
      </section>
      <aside className="participants-card"><div className="participants-heading"><h2>In this room</h2><span>{party.participants.length}</span></div>
        <ul className="participant-list">{party.participants.map((participant) => <li key={participant.userId}>
          <span className="avatar">{participant.username.slice(0, 1).toUpperCase()}</span><span className="participant-name">{participant.username}{participant.userId === session.userId && <small>you</small>}</span><span className={`role-badge role-${participant.role}`}>{participant.role}</span>
          {isHost && participant.userId !== session.userId && participant.role !== "host" && <div className="participant-actions"><select aria-label={`Set ${participant.username}'s role`} value={participant.role} onChange={(event) => party.assignRole(participant.userId, event.target.value as Extract<RoomRole, "moderator" | "participant">)}><option value="participant">Participant</option><option value="moderator">Moderator</option></select><button type="button" className="remove-button" onClick={() => party.removeParticipant(participant.userId)} aria-label={`Remove ${participant.username}`}>Remove</button></div>}
        </li>)}{party.participants.length === 0 && <li className="empty-participants">Connecting to the room…</li>}</ul>
        {party.roomError && <p className="error-message" role="alert">{party.roomError}</p>}
      </aside>
    </div>
    <p className="event-caption">You are a <span className={`role-badge role-${currentRole}`}>{currentRole}</span>. {isHost ? "You can manage participants and playback." : canControl ? "You can control playback." : "You can watch along with the room."}</p>
  </section>;
}

export default App;
