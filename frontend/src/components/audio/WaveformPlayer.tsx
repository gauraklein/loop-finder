import React, { useEffect, useRef, useState } from 'react';
import { downloadFile } from '../../utils/download';

interface WaveformPlayerProps {
  audioUrl: string;
  downloadUrl: string;
  downloadFilename: string;
}

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

const WaveformPlayer: React.FC<WaveformPlayerProps> = ({ audioUrl, downloadUrl, downloadFilename }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<number[] | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      ctx.fillStyle = x < progressX ? PLAYED_COLOR : UNPLAYED_COLOR;
      ctx.fillRect(x, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    });
  };

  // Set up the audio element
  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => setError('Failed to load audio');

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = isLooping;
  }, [isLooping]);

  // Fetch and decode audio once to build the bar waveform
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      let audioCtx: AudioContext | null = null;
      try {
        const response = await fetch(audioUrl, { signal: controller.signal });
        if (!response.ok) throw new Error('Failed to fetch audio');
        const arrayBuffer = await response.arrayBuffer();
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        peaksRef.current = computePeaks(decoded.getChannelData(0), BAR_COUNT);
        drawWaveform();
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error building waveform:', err);
        }
      } finally {
        audioCtx?.close();
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // Redraw the progress overlay as playback advances
  useEffect(() => {
    drawWaveform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setError('Playback prevented. Click anywhere to enable audio.'));
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !duration) return;

    const rect = canvas.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = percent * duration;

    audio.currentTime = time;
    setCurrentTime(time);
  };

  const iconButtonClasses =
    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-cyan/40 bg-black text-sm text-chrome transition-all duration-200 ease-linear hover:scale-110 hover:border-cyan hover:text-cyan hover:shadow-glow-cyan';

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
      <button
        onClick={togglePlay}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-magenta bg-black text-magenta transition-all duration-200 ease-linear hover:scale-110 hover:bg-magenta hover:text-black hover:shadow-glow-magenta"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="relative h-16 min-w-[140px] flex-1 cursor-pointer" onClick={handleSeek}>
        <canvas ref={canvasRef} className="block h-full w-full" width={500} height={64} />
        <span className="pointer-events-none absolute bottom-0.5 right-1 bg-black/70 px-1 font-mono text-[0.65rem] text-cyan">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <button
        onClick={() => setIsLooping((looping) => !looping)}
        className={`${iconButtonClasses} ${isLooping ? 'border-cyan bg-cyan text-black shadow-glow-cyan' : ''}`}
        title={isLooping ? 'Disable loop' : 'Enable loop'}
      >
        🔁
      </button>

      <button
        onClick={() => downloadFile(downloadUrl, downloadFilename)}
        className={iconButtonClasses}
        title="Download loop file"
      >
        💾
      </button>

      {error && <span className="basis-full font-mono text-xs text-magenta">{error}</span>}
    </div>
  );
};

export default WaveformPlayer;
