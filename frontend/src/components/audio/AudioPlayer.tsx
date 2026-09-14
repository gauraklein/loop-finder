import React, { useState, useRef, useEffect } from 'react';
import './AudioPlayer.css';

interface AudioPlayerProps {
  previewUrl: string;
  onEnd?: () => void;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ previewUrl, onEnd }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const volumeProgressRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    if (!previewUrl) return;
    
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    audio.volume = volume;
    
    const handleLoadedMetadata = () => {
      setIsLoaded(true);
      setDuration(audio.duration);
    };
    
    const handleTimeUpdate = () => {
      if (!isSeeking && audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (onEnd) onEnd();
    };
    
    const handleError = () => {
      setError('Failed to load audio preview');
      setIsPlaying(false);
    };
    
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [previewUrl, volume, onEnd]);
  
  const getClientX = (e: React.MouseEvent<HTMLDivElement, MouseEvent> | React.TouchEvent<HTMLDivElement>): number => {
    if ('touches' in e && e.touches !== undefined && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    // Type assertion: at this point we know it's a MouseEvent
    const mouseEvent = e as React.MouseEvent<HTMLDivElement, MouseEvent>;
    return mouseEvent.clientX;
  };
  
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      if (error) {
        // Try to reload if there was an error
        audioRef.current.load();
        setError(null);
      }
      audioRef.current.play().catch(err => {
        console.error('Playback failed:', err);
        setError('Playback prevented. Click anywhere to enable audio.');
      });
    }
  };
  
  const handleSeek = (e: React.MouseEvent<HTMLDivElement, MouseEvent> | React.TouchEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    
    setIsSeeking(true);
    const clientX = getClientX(e);
    
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const seekTime = percent * duration;
    
    audioRef.current!.currentTime = seekTime;
    setCurrentTime(seekTime);
  };
  
  const handleSeekEnd = () => {
    setIsSeeking(false);
  };
  
  const handleVolumeDragStart = (e: React.MouseEvent<HTMLDivElement, MouseEvent> | React.TouchEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    e.preventDefault(); // Prevent text selection during drag
    setIsVolumeDragging(true);
    handleVolumeDrag(e);
  };
  
  const handleVolumeDrag = (e: React.MouseEvent<HTMLDivElement, MouseEvent> | React.TouchEvent<HTMLDivElement>) => {
    if (!audioRef.current || !isVolumeDragging) return;
    
    const clientX = getClientX(e);
    
    const rect = volumeProgressRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    let percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // Make volume curve more natural for better UX at low volumes
    percent = Math.pow(percent, 0.5);
    setVolume(percent);
    
    if (audioRef.current) {
      audioRef.current.volume = percent;
    }
  };
  
  const handleVolumeDragEnd = () => {
    setIsVolumeDragging(false);
  };
  
  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent> | React.TouchEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    
    const clientX = getClientX(e);
    
    const rect = volumeProgressRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    let percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // Make volume curve more natural
    percent = Math.pow(percent, 0.5);
    setVolume(percent);
    
    if (audioRef.current) {
      audioRef.current.volume = percent;
    }
  };
  
  if (error && !isLoaded) {
    return (
      <div className="audio-player-error">
        {error}
        <button 
          onClick={() => {
            setError(null);
            if (audioRef.current) {
              audioRef.current.load();
            }
          }}
          className="btn-ghost btn-sm"
        >
          Try Again
        </button>
      </div>
    );
  }
  
  return (
    <div className="audio-player-container">
      <div className="audio-player-header">
        <h4>Audio Preview</h4>
        {!isLoaded && !isPlaying && (
          <span className="audio-player-status">Loading...</span>
        )}
        {isLoaded && !isPlaying && (
          <span className="audio-player-status">Ready to play</span>
        )}
        {isPlaying && (
          <span className="audio-player-status">Playing...</span>
        )}
      </div>
      
      {!isLoaded && !error ? (
        <div className="audio-player-loading">
          <div className="audio-spinner"></div>
        </div>
      ) : (
        <>
          <div className="audio-player-controls">
            <button 
              onClick={handlePlayPause}
              className={`btn-icon ${isPlaying ? 'btn-pause' : ''}`}
              title={isPlaying ? 'Pause' : 'Play'}
              disabled={!isLoaded}
            >
              {isPlaying ? '⏸' : '▶️'}
            </button>
            
            <div className="audio-player-time">
              <span className="current-time">{formatTime(currentTime)}</span>
              <span className="time-separator">/</span>
              <span className="duration-time">{isLoaded ? formatTime(duration) : '--:--'}</span>
            </div>
            
            <div className="audio-player-progress-container">
              <div
                ref={progressRef}
                className="audio-player-progress-track"
                onMouseDown={handleSeek}
                onTouchStart={handleSeek}
                onMouseUp={handleSeekEnd}
                onTouchEnd={handleSeekEnd}
                onMouseLeave={handleSeekEnd}
                onMouseMove={handleSeek}
              >
                <div
                  className="audio-player-progress-fill"
                  style={{ width: isLoaded && !isSeeking ? (currentTime / duration) * 100 : 0 }}
                ></div>
                {isSeeking && (
                  <div className="audio-player-progress-thumb"></div>
                )}
              </div>
            </div>
          </div>
          
          <div className="audio-player-volume">
            <button 
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.muted = !audioRef.current.muted;
                  setVolume(audioRef.current.muted ? 0 : audioRef.current.volume);
                }
              }}
              className="btn-icon btn-volume"
              title={volume > 0 ? 'Mute' : 'Unmute'}
            >
              {volume > 0 ? '🔊' : '🔇'}
            </button>
            
            <div
              ref={volumeProgressRef}
              className="audio-player-volume-track"
              onMouseDown={handleVolumeDragStart}
              onTouchStart={handleVolumeDragStart}
              onMouseUp={handleVolumeDragEnd}
              onTouchEnd={handleVolumeDragEnd}
              onMouseLeave={handleVolumeDragEnd}
              onMouseMove={handleVolumeDrag}
              onClick={handleVolumeClick}
            >
              <div
                className="audio-player-volume-fill"
                style={{ width: volume * 100 }}
              ></div>
              {isVolumeDragging && (
                <div className="audio-player-volume-thumb"></div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AudioPlayer;
