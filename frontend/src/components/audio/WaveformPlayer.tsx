import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { downloadFile } from '../../utils/download';
import { DownloadIcon, ReverseIcon } from '../icons';

// Coordinates playback across every WaveformPlayer under a Provider so
// starting one stops whichever other one is currently playing.
type StopFn = () => void;
const PlaybackContext = createContext<{ requestPlay: (stop: StopFn) => void } | null>(null);

export const PlaybackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const activeStopRef = useRef<StopFn | null>(null);
  const requestPlay = (stop: StopFn) => {
    activeStopRef.current?.();
    activeStopRef.current = stop;
  };
  return <PlaybackContext.Provider value={{ requestPlay }}>{children}</PlaybackContext.Provider>;
};

interface WaveformPlayerProps {
  audioUrl: string;
  downloadUrl: string;
  downloadFilename: string;
  label?: string;
}

// A button with a themed tooltip that appears instantly on hover, instead of
// relying on the browser's slow, plain native `title` tooltip.
const IconButton: React.FC<{
  onClick: () => void;
  tooltip: string;
  className: string;
  children: React.ReactNode;
}> = ({ onClick, tooltip, className, children }) => (
  <div className="group relative inline-flex flex-shrink-0">
    <button onClick={onClick} title={tooltip} className={className}>
      {children}
    </button>
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap border border-cyan bg-black px-2 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-cyan opacity-0 shadow-glow-cyan transition-opacity duration-150 ease-linear group-hover:opacity-100">
      {tooltip}
    </span>
  </div>
);

// Browsers cap how many real AudioContexts can be open at once (a results
// page can easily render 100+ WaveformPlayers between loops and stems), so
// every instance shares this one context instead of creating its own.
let sharedAudioCtx: AudioContext | null = null;
const getSharedAudioContext = (): AudioContext => {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedAudioCtx;
};

const BAR_COUNT = 100;
const PLAYED_COLOR = '#FF00FF';
const UNPLAYED_COLOR = '#2D1B4E';

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

// Downsample channel data into per-bar peak amplitudes for a bar-style waveform
const computePeaks = (channelData: Float32Array, barCount: number): number[] => {
  const samplesPerBar = Math.max(1, Math.floor(channelData.length / barCount));
  const peaks: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }
  return peaks;
};

const WaveformPlayer: React.FC<WaveformPlayerProps> = ({ audioUrl, downloadUrl, downloadFilename, label }) => {
  const playback = useContext(PlaybackContext);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<number[] | null>(null);

  // Reverse playback needs the decoded PCM data - the <audio> element has no
  // way to play backwards, so we drive it through Web Audio instead.
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  const reversedBufferRef = useRef<AudioBuffer | null>(null);
  const reverseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const reverseStartCtxTimeRef = useRef(0);
  const reverseRateRef = useRef(1);
  const reverseRafRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReversed, setIsReversed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [semitones, setSemitones] = useState(0);

  // Vinyl-style pitch: shifting playback rate shifts pitch right along with it
  const playbackRate = Math.pow(2, semitones / 12);

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas || !peaks) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / peaks.length;
    const mid = height / 2;
    const progressX = duration ? (currentTime / duration) * width : 0;

    peaks.forEach((peak, i) => {
      const barHeight = Math.max(2, peak * height);
      const x = i * barWidth;
      const isPlayed = isReversed ? x >= progressX : x < progressX;
      ctx.fillStyle = isPlayed ? PLAYED_COLOR : UNPLAYED_COLOR;
      ctx.fillRect(x, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    });
  };

  const getReversedBuffer = (): AudioBuffer | null => {
    const decoded = decodedBufferRef.current;
    if (!decoded) return null;
    if (reversedBufferRef.current) return reversedBufferRef.current;

    const ctx = getSharedAudioContext();
    const reversed = ctx.createBuffer(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const source = decoded.getChannelData(channel);
      const reversedData = new Float32Array(source.length);
      for (let i = 0; i < source.length; i++) {
        reversedData[i] = source[source.length - 1 - i];
      }
      reversed.copyToChannel(reversedData, channel);
    }
    reversedBufferRef.current = reversed;
    return reversed;
  };

  const stopReversePlayback = () => {
    if (reverseSourceRef.current) {
      reverseSourceRef.current.onended = null;
      try {
        reverseSourceRef.current.stop();
      } catch {
        // already stopped
      }
      reverseSourceRef.current.disconnect();
      reverseSourceRef.current = null;
    }
    if (reverseRafRef.current !== null) {
      cancelAnimationFrame(reverseRafRef.current);
      reverseRafRef.current = null;
    }
  };

  const tickReverseProgress = () => {
    const ctx = getSharedAudioContext();
    const elapsed = (ctx.currentTime - reverseStartCtxTimeRef.current) * reverseRateRef.current;
    const wrapped = duration ? elapsed % duration : elapsed;
    const clamped = Math.min(Math.max(wrapped, 0), duration);
    setCurrentTime(duration - clamped);
    reverseRafRef.current = requestAnimationFrame(tickReverseProgress);
  };

  const playReverseFrom = (offsetSeconds: number) => {
    const buffer = getReversedBuffer();
    if (!buffer) return;
    const ctx = getSharedAudioContext();

    stopReversePlayback();
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = playbackRate;
    source.connect(ctx.destination);

    const clampedOffset = Math.min(Math.max(offsetSeconds, 0), duration || 0);
    source.start(0, clampedOffset);
    reverseSourceRef.current = source;
    reverseStartCtxTimeRef.current = ctx.currentTime - clampedOffset / playbackRate;
    reverseRateRef.current = playbackRate;
    reverseRafRef.current = requestAnimationFrame(tickReverseProgress);
  };

  // Fully stop this player, whichever mode it's playing in - handed to the
  // PlaybackProvider so it can silence this player when another one starts.
  const stopPlayback = () => {
    stopReversePlayback();
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  // Set up the audio element (forward playback) - loops are always on, so
  // the native 'ended' event never fires and needs no handler.
  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.loop = true;
    // Browsers preserve pitch across playbackRate changes by default - we want
    // the opposite (vinyl-style: rate change shifts pitch too), so disable it.
    (audio as any).preservesPitch = false;
    (audio as any).mozPreservesPitch = false;
    (audio as any).webkitPreservesPitch = false;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onError = () => setError('Failed to load audio');

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('error', onError);
    };
  }, [audioUrl]);

  // Apply pitch changes live, without interrupting playback. The <audio>
  // element handles this natively; the reverse AudioBufferSourceNode needs its
  // position-tracking baseline rebased to the new rate so it doesn't drift.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;

    if (reverseSourceRef.current) {
      const ctx = getSharedAudioContext();
      const elapsedBufferTime = (ctx.currentTime - reverseStartCtxTimeRef.current) * reverseRateRef.current;
      reverseSourceRef.current.playbackRate.value = playbackRate;
      reverseStartCtxTimeRef.current = ctx.currentTime - elapsedBufferTime / playbackRate;
      reverseRateRef.current = playbackRate;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackRate]);

  // Fetch and decode audio once to build the bar waveform (and keep the
  // decoded buffer around so reverse playback can reuse it)
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(audioUrl, { signal: controller.signal });
        if (!response.ok) throw new Error('Failed to fetch audio');
        const arrayBuffer = await response.arrayBuffer();
        const ctx = getSharedAudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        decodedBufferRef.current = decoded;
        reversedBufferRef.current = null;
        peaksRef.current = computePeaks(decoded.getChannelData(0), BAR_COUNT);
        drawWaveform();
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error building waveform:', err);
        }
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // Stop any in-flight reverse playback on unmount (the AudioContext itself
  // is shared across all players, so it isn't closed here)
  useEffect(() => {
    return () => {
      stopReversePlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the progress overlay as playback advances
  useEffect(() => {
    drawWaveform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, duration, isReversed]);

  const togglePlay = () => {
    if (isReversed) {
      if (isPlaying) {
        stopReversePlayback();
        setIsPlaying(false);
      } else if (getReversedBuffer()) {
        playback?.requestPlay(stopPlayback);
        playReverseFrom(duration - currentTime);
        setIsPlaying(true);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.currentTime = currentTime;
      audio
        .play()
        .then(() => {
          playback?.requestPlay(stopPlayback);
          setIsPlaying(true);
        })
        .catch(() => setError('Playback prevented. Click anywhere to enable audio.'));
    }
  };

  const handleToggleReverse = () => {
    const wasPlaying = isPlaying;
    const position = currentTime;
    const next = !isReversed;

    if (isReversed) {
      stopReversePlayback();
    } else {
      audioRef.current?.pause();
    }
    setIsReversed(next);

    if (!wasPlaying) {
      setCurrentTime(next ? duration : 0);
      return;
    }

    // Already playing and already registered as the active player with the
    // PlaybackProvider - just carry on in the new direction from the same spot.
    if (next) {
      playReverseFrom(duration - position);
    } else {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = position;
        audio.play().catch(() => setError('Playback prevented. Click anywhere to enable audio.'));
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;

    const rect = canvas.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = percent * duration;
    setCurrentTime(time);

    if (isReversed) {
      if (isPlaying) playReverseFrom(duration - time);
    } else if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const iconButtonClasses =
    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-cyan/40 bg-black text-sm text-chrome transition-all duration-200 ease-linear hover:scale-110 hover:border-cyan hover:text-cyan hover:shadow-glow-cyan';

  return (
    <div className="border-t border-border px-5 py-4">
      {label && (
        <div className="mb-2 font-mono text-xs uppercase tracking-widest text-magenta">{label}</div>
      )}

      <div className="relative h-28 w-full cursor-pointer" onClick={handleSeek}>
        <canvas ref={canvasRef} className="block h-full w-full" width={800} height={112} />
        <span className="pointer-events-none absolute bottom-1 right-2 bg-black/70 px-1.5 py-0.5 font-mono text-xs text-cyan">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <IconButton
          onClick={togglePlay}
          tooltip={isPlaying ? 'Pause' : 'Play'}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-magenta bg-black text-magenta transition-all duration-200 ease-linear hover:scale-110 hover:bg-magenta hover:text-black hover:shadow-glow-magenta"
        >
          {isPlaying ? '⏸' : '▶'}
        </IconButton>

        <IconButton
          onClick={handleToggleReverse}
          tooltip={isReversed ? 'Switch to forward playback' : 'Play in reverse'}
          className={`${iconButtonClasses} ${isReversed ? 'border-sunset bg-sunset text-black shadow-[0_0_15px_#FF9900]' : ''}`}
        >
          <ReverseIcon className="h-4 w-4" />
        </IconButton>

        <div className="flex flex-shrink-0 items-center gap-1">
          <IconButton
            onClick={() => setSemitones((s) => Math.max(-12, s - 1))}
            tooltip="Pitch down"
            className="flex h-9 w-6 items-center justify-center border-2 border-cyan/40 bg-black font-mono text-chrome transition-all duration-200 ease-linear hover:border-cyan hover:text-cyan hover:shadow-glow-cyan"
          >
            &minus;
          </IconButton>
          <span
            onClick={() => setSemitones(0)}
            title="Click to reset pitch"
            className="w-12 flex-shrink-0 cursor-pointer text-center font-mono text-xs text-magenta"
          >
            {semitones > 0 ? `+${semitones}` : semitones}ST
          </span>
          <IconButton
            onClick={() => setSemitones((s) => Math.min(12, s + 1))}
            tooltip="Pitch up"
            className="flex h-9 w-6 items-center justify-center border-2 border-cyan/40 bg-black font-mono text-chrome transition-all duration-200 ease-linear hover:border-cyan hover:text-cyan hover:shadow-glow-cyan"
          >
            +
          </IconButton>
        </div>

        <IconButton
          onClick={() => downloadFile(downloadUrl, downloadFilename)}
          tooltip="Download loop file"
          className={iconButtonClasses}
        >
          <DownloadIcon className="h-4 w-4" />
        </IconButton>

        {error && <span className="basis-full font-mono text-xs text-magenta">{error}</span>}
      </div>
    </div>
  );
};

export default WaveformPlayer;
