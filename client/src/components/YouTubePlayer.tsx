import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { loadYouTubeApi, type YouTubePlayer as YouTubePlayerInstance, type YouTubePlayerState } from "../services/youtubeApi";
import { extractYouTubeVideoId } from "../utils/youtube";

export interface YouTubePlayerHandle {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  loadVideo(videoId: string): void;
}

interface YouTubePlayerProps {
  videoId: string;
  onReady?: (videoId: string | null) => void;
  onStateChange?: (state: YouTubePlayerState, videoId: string | null) => void;
  onError?: (message: string) => void;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId, onReady, onStateChange, onError }, ref) {
    const mountElementRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YouTubePlayerInstance | null>(null);
    const currentVideoIdRef = useRef(videoId);
    const callbacksRef = useRef({ onReady, onStateChange, onError });
    const [isReady, setIsReady] = useState(false);

    callbacksRef.current = { onReady, onStateChange, onError };

    useImperativeHandle(
      ref,
      () => ({
        play: () => playerRef.current?.playVideo(),
        pause: () => playerRef.current?.pauseVideo(),
        seekTo: (seconds) => {
          if (Number.isFinite(seconds) && seconds >= 0) {
            playerRef.current?.seekTo(seconds, true);
          }
        },
        getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
        loadVideo: (nextVideoId) => {
          if (!/^[A-Za-z0-9_-]{11}$/.test(nextVideoId)) return;
          currentVideoIdRef.current = nextVideoId;
          playerRef.current?.cueVideoById(nextVideoId);
        },
      }),
      [],
    );

    useEffect(() => {
      let cancelled = false;

      loadYouTubeApi()
        .then((youtube) => {
          const mountElement = mountElementRef.current;
          if (cancelled || !mountElement) return;

          playerRef.current = new youtube.Player(mountElement, {
            width: "100%",
            height: "100%",
            videoId: currentVideoIdRef.current,
            playerVars: {
              playsinline: 1,
              rel: 0,
              controls: 0,
              origin: window.location.origin,
            },
            events: {
              onReady: (event) => {
                if (cancelled) return;
                playerRef.current = event.target;
                setIsReady(true);
                callbacksRef.current.onReady?.(extractYouTubeVideoId(event.target.getVideoUrl()));
              },
              onStateChange: (event) => {
                if (typeof event.data === "number") {
                  callbacksRef.current.onStateChange?.(
                    event.data as YouTubePlayerState,
                    extractYouTubeVideoId(event.target.getVideoUrl()),
                  );
                }
              },
              onError: (event) => {
                const messages: Record<number, string> = {
                  2: "This YouTube video ID is invalid.",
                  5: "This video could not be played in the HTML5 player.",
                  100: "This video was not found or has been removed.",
                  101: "The video owner does not allow embedded playback.",
                  150: "The video owner does not allow embedded playback.",
                  153: "YouTube could not verify this player request. Check the page origin and try again.",
                };
                callbacksRef.current.onError?.(messages[event.data ?? -1] ?? `YouTube player error (${event.data ?? "unknown"})`);
              },
            },
          });
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            callbacksRef.current.onError?.(
              error instanceof Error ? error.message : "Could not initialize the YouTube player",
            );
          }
        });

      return () => {
        cancelled = true;
        playerRef.current?.destroy();
        playerRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (!isReady || currentVideoIdRef.current === videoId) return;
      currentVideoIdRef.current = videoId;
      playerRef.current?.cueVideoById(videoId);
    }, [isReady, videoId]);

    return (
      <div className="youtube-player-frame" aria-label="YouTube video player">
        <div ref={mountElementRef} className="youtube-player-mount" />
      </div>
    );
  },
);

YouTubePlayer.displayName = "YouTubePlayer";

export default YouTubePlayer;
