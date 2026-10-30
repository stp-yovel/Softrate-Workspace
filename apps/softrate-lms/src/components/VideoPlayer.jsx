import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  CheckCircle2,
  Lock,
  ArrowRight,
  ArrowLeft,
  Clock,
  AlertTriangle,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export default function VideoPlayer({
  video,
  onComplete,
  hasNext,
  onNext,
  hasPrev,
  onPrev,
  isSubmitting,
  seekRequest,
  onPlaybackProgress,
}) {
  const [watchProgress, setWatchProgress] = useState(video?.watchPercentage || 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video?.durationSeconds || 0);
  const playerRef = useRef(null);
  const embedContainerRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const completedSentRef = useRef(false);
  const maxSeenSecondsRef = useRef(0);
  const loadedVideoIdRef = useRef(null);
  const lastEmittedSecRef = useRef(-1);

  // Keep callback refs up to date to prevent effect churn
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onPlaybackProgressRef = useRef(onPlaybackProgress);
  onPlaybackProgressRef.current = onPlaybackProgress;

  const minWatch = video?.rules?.minWatchPercentage || 90;
  const deadlineDays = video?.rules?.deadlineDays || 3;

  useEffect(() => {
    setWatchProgress(video?.watchPercentage || 0);
    setCurrentTime(0);
    setDuration(video?.durationSeconds || 0);
    setIsPlaying(false);
    completedSentRef.current = video?.isCompleted || false;
    const initialMaxSeen = (video?.watchPercentage && video?.durationSeconds)
      ? Math.round((video.watchPercentage / 100) * video.durationSeconds)
      : 0;
    maxSeenSecondsRef.current = initialMaxSeen;

    if (typeof onPlaybackProgressRef.current === 'function') {
      onPlaybackProgressRef.current({
        currentTime: 0,
        maxSeenSeconds: initialMaxSeen,
        duration: video?.durationSeconds || 0,
      });
    }
  }, [video?.videoId]);

  // Handle external seek request (e.g. from Slice / Notes click)
  useEffect(() => {
    if (seekRequest && seekRequest.time != null && playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(seekRequest.time, true);
        if (typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        }
      } catch {
        // Fallback
      }
    }
  }, [seekRequest]);

  // Fullscreen listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const elem = embedContainerRef.current;
    if (!elem) return;

    if (!isFullscreen) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  };

  // 'f' shortcut for fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Load YouTube IFrame API once
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }, []);

  // Initialize or update YouTube Player
  useEffect(() => {
    if (!video || !video.isUnlocked || !video.youtubeVideoId) return;

    let destroyed = false;

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const startPolling = (player) => {
      stopPolling();
      pollIntervalRef.current = setInterval(() => {
        try {
          if (!player || typeof player.getCurrentTime !== 'function') return;
          const current = player.getCurrentTime() || 0;
          const dur = player.getDuration() || 1;
          const percent = Math.min(100, Math.round((current / dur) * 100));

          setCurrentTime(current);
          if (dur > 1) setDuration(dur);
          setWatchProgress((prev) => Math.max(prev, percent));

          maxSeenSecondsRef.current = Math.max(maxSeenSecondsRef.current, Math.round(current));
          const roundedCur = Math.round(current);
          if (roundedCur !== lastEmittedSecRef.current) {
            lastEmittedSecRef.current = roundedCur;
            if (typeof onPlaybackProgressRef.current === 'function') {
              onPlaybackProgressRef.current({
                currentTime: roundedCur,
                maxSeenSeconds: maxSeenSecondsRef.current,
                duration: Math.round(dur),
              });
            }
          }

          // Auto-trigger completion as video reaches the end
          if (dur > 2 && current >= dur - 1.5) {
            stopPolling();
            if (!completedSentRef.current) {
              completedSentRef.current = true;
              if (typeof onCompleteRef.current === 'function') {
                onCompleteRef.current(video.videoId, 100, true);
              }
            }
          }
        } catch {
          // Ignore polling errors if player is transitioning
        }
      }, 500);
    };

    const onPlayerStateChange = (event) => {
      // YT.PlayerState: PLAYING = 1, ENDED = 0, PAUSED = 2
      if (event.data === 1) {
        setIsPlaying(true);
        startPolling(event.target);
      } else if (event.data === 0) {
        // Video finished completely
        setIsPlaying(false);
        stopPolling();
        setWatchProgress(100);
        completedSentRef.current = true;
        if (typeof onCompleteRef.current === 'function') {
          onCompleteRef.current(video.videoId, 100, true);
        }
      } else {
        setIsPlaying(false);
        stopPolling();
      }
    };

    const initPlayer = () => {
      if (destroyed || !window.YT || !window.YT.Player) return;

      const container = document.getElementById('youtube-lms-player');
      if (!container) return;

      try {
        if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
          // Only reload if the video ID actually changed to another lesson
          if (loadedVideoIdRef.current !== video.youtubeVideoId) {
            loadedVideoIdRef.current = video.youtubeVideoId;
            playerRef.current.loadVideoById({
              videoId: video.youtubeVideoId,
              suggestedQuality: 'hd720',
            });
            try {
              playerRef.current.unloadModule('captions');
              playerRef.current.unloadModule('cc');
            } catch {
              // Ignore
            }
          }
        } else {
          loadedVideoIdRef.current = video.youtubeVideoId;
          playerRef.current = new window.YT.Player('youtube-lms-player', {
            videoId: video.youtubeVideoId,
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              fs: 0,
              playsinline: 1,
              cc_load_policy: 0,
              cc_lang_pref: '',
            },
            events: {
              onReady: (event) => {
                try {
                  const dur = event.target.getDuration() || video?.durationSeconds || 0;
                  if (dur > 0) setDuration(dur);
                  event.target.unloadModule('captions');
                  event.target.unloadModule('cc');
                  if (typeof event.target.setOption === 'function') {
                    event.target.setOption('captions', 'track', {});
                    event.target.setOption('cc', 'track', {});
                  }
                } catch {
                  // Ignore
                }
              },
              onStateChange: (event) => {
                try {
                  event.target.unloadModule('captions');
                  event.target.unloadModule('cc');
                } catch {
                  // Ignore
                }
                onPlayerStateChange(event);
              },
            },
          });
        }
      } catch {
        // Fallback gracefully
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') prevCallback();
        initPlayer();
      };
    }

    return () => {
      destroyed = true;
      stopPolling();
      if (playerRef.current) {
        try {
          if (typeof playerRef.current.destroy === 'function') {
            playerRef.current.destroy();
          }
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, [video?.videoId, video?.youtubeVideoId, video?.isUnlocked]);

  if (!video) {
    return (
      <div className="player-empty-state">
        <Play size={40} className="player-empty-icon" />
        <p>Select a lesson from the timeline to start learning.</p>
      </div>
    );
  }

  if (!video.isUnlocked) {
    return (
      <div className="player-locked-state">
        <div className="locked-icon-badge">
          <Lock size={32} />
        </div>
        <h2>Lesson Locked</h2>
        <p>This lesson will unlock automatically after you complete the previous video.</p>
      </div>
    );
  }

  // Format deadline date
  const formatDeadline = (dateStr) => {
    if (!dateStr) return `${deadlineDays} days from unlock`;
    const d = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60));
    const diffDays = Math.ceil(diffHours / 24);

    if (diffHours < 0) return 'Overdue';
    if (diffDays <= 1) return `Due in ${Math.max(1, diffHours)} hours`;
    return `Due in ${diffDays} days (${d.toLocaleDateString()})`;
  };

  // Playback controls (Play / Pause toggle only - timeline seeking disabled)
  const togglePlayPause = () => {
    if (!playerRef.current) return;
    try {
      const state = typeof playerRef.current.getPlayerState === 'function' ? playerRef.current.getPlayerState() : -1;
      if (state === 1) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
    } catch {
      // Fallback
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className="video-player-card">
      {/* YouTube IFrame Embed Container (controls=0 hides seekbar/timeline) */}
      <div className="video-embed-wrapper" ref={embedContainerRef}>
        <div id="youtube-lms-player" className="video-iframe" />
      </div>

      {/* Video Header & Meta */}
      <div className="video-info-box">
        <div className="video-meta-row">
          <div className="meta-left-group">
            <div className="lesson-badge">Lesson {video.order}</div>

            <div className="rules-badges">
              {video.isCompleted ? (
                <span className="badge-status completed">
                  <CheckCircle2 size={13} />
                  Completed
                </span>
              ) : video.isOverdue ? (
                <span className="badge-status overdue">
                  <AlertTriangle size={13} />
                  Overdue
                </span>
              ) : (
                <span className="badge-status due">
                  <Clock size={13} />
                  {formatDeadline(video.deadline)}
                </span>
              )}
            </div>
          </div>

          {/* Video Timeline & Interactive Scrubber Bar */}
          <div className="player-timeline-controls">
            <button
              type="button"
              className="btn-playback-toggle"
              onClick={togglePlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <span className="playback-time-text">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div
              className="timeline-scrubber-track read-only"
              title={`Progress: ${formatTime(currentTime)} / ${formatTime(duration)}`}
            >
              <div
                className="timeline-scrubber-fill"
                style={{ width: `${progressPct}%` }}
              />
              <div
                className="timeline-scrubber-thumb"
                style={{ left: `${progressPct}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn-fullscreen-inline"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Full Screen (Esc)' : 'Full Screen (F)'}
            aria-label={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        <h2 className="video-title">{video.title}</h2>

        {/* Navigation & Clean Completion State */}
        <div className="player-actions-row">
          <button
            type="button"
            className="btn-nav"
            onClick={onPrev}
            disabled={!hasPrev || isSubmitting}
          >
            <ArrowLeft size={16} />
            <span>Previous Lesson</span>
          </button>

          <div className="right-actions">
            {hasNext && (
              <button
                type="button"
                className="btn-primary"
                onClick={onNext}
                disabled={!video.isCompleted || isSubmitting}
              >
                <span>Next Lesson</span>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

