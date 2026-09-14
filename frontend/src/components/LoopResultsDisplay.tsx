import React, { useState, useEffect } from 'react';
import AudioPlayer from './audio/AudioPlayer';
import { getTaskStatus } from '../services/apiService';

interface LoopResult {
  id: string;
  filename: string;
  basename: string | undefined;
  bars: number;
  rank: number;
  score: number;
  start_time: number;
  end_time: number;
  duration: number;
  preview_url: string;
  stems?: Record<string, string>;
}

interface LoopResultsDisplayProps {
  taskId: string;
}

const LoopResultsDisplay: React.FC<LoopResultsDisplayProps> = ({ taskId }) => {
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingZip, setIsGeneratingZip] = useState<boolean>(false);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null); // ID of currently playing preview
  const [waveformData, setWaveformData] = useState<Map<string, ArrayBuffer | null>>(new Map());

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        setLoading(true);
        const status = await getTaskStatus(taskId);
        setTaskStatus(status);
        setLoading(false);

        // Schedule next check ONLY if still processing
        if (status.status === 'analyzing' || status.status === 'processing_url' || status.status === 'downloading') {
          // Clear any existing timeout
          if (timeoutId) clearTimeout(timeoutId);
          // Schedule next check in 2 seconds
          timeoutId = setTimeout(checkStatus, 2000);
        } else {
          // Task completed/failed - clear any pending timeouts
          if (timeoutId) clearTimeout(timeoutId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch task status');
        setLoading(false);
        // Still schedule retry on error (with backoff in production)
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(checkStatus, 2000);
      }
    };

    // Start polling
    checkStatus();

    // Cleanup on unmount
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [taskId]);

  // Draw waveforms when data is available
  useEffect(() => {
    waveformData.forEach((data, loopId) => {
      if (data !== null) {
        const canvas = document.querySelector(`canvas[data-loop-id="${loopId}"]`);
        if (canvas) {
          drawWaveform(canvas as HTMLCanvasElement, data);
        }
      }
    });
  }, [waveformData]);

  if (loading) {
    return <div className="loop-results">Analyzing audio... Please wait.</div>;
  }

  if (error) {
    return <div className="loop-results error">Error: {error}</div>;
  }

  if (!taskStatus) {
    return <div className="loop-results">No task data available.</div>;
  }

  if (taskStatus.status === 'failed') {
    return (
      <div className="loop-results error">
        Analysis failed: {taskStatus.error}
      </div>
    );
  }

  if (taskStatus.status !== 'completed' || !taskStatus.result || !taskStatus.result.loops) {
    return (
      <div className="loop-results">
        Waiting for analysis to complete... Current status: {taskStatus.status}
      </div>
    );
  }

  const loops: LoopResult[] = taskStatus.result.loops;
  const hasStems = taskStatus.result?.stems_dir !== null;
  const reportUrl = taskStatus.result?.report_path
    ? `/api/report/${taskId}`
    : null;

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreviewEnd = () => {
    setPlayingPreview(null);
  };

  // Function to fetch and decode audio data for waveform generation
  const fetchWaveformData = async (loop: LoopResult): Promise<ArrayBuffer | null> => {
    try {
      // Check if we already have this data
      const cached = waveformData.get(loop.id);
      if (cached !== undefined) {
        return cached;
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/loop/${taskId}/${loop.filename}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      // Update cache
      const newMap = new Map(waveformData);
      newMap.set(loop.id, arrayBuffer);
      setWaveformData(newMap);
      return arrayBuffer;
    } catch (err) {
      console.error('Error fetching waveform data:', err);
      // Cache null to prevent repeated failed requests
      const newMap = new Map(waveformData);
      newMap.set(loop.id, null);
      setWaveformData(newMap);
      return null;
    }
  };

  // Function to draw waveform on canvas
  const drawWaveform = (canvas: HTMLCanvasElement, arrayBuffer: ArrayBuffer) => {
    if (!canvas || !arrayBuffer) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    // Clear canvas
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    // Set up audio context
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode audio data
    audioCtx.decodeAudioData(arrayBuffer).then((decodedData) => {
      const channelData = decodedData.getChannelData(0); // Use first channel
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const mid = canvasHeight / 2;

      // Draw waveform
      canvasCtx.lineWidth = 1;
      canvasCtx.strokeStyle = '#6366f1'; // Primary color
      canvasCtx.beginPath();

      const sliceWidth = Math.max(1, channelData.length / canvasWidth);
      let x = 0;

      for (let i = 0; i < channelData.length; i += sliceWidth) {
        const sample = channelData[i];
        const y = sample * mid;
        
        if (i === 0) {
          canvasCtx.moveTo(x, mid + y);
        } else {
          canvasCtx.lineTo(x, mid + y);
        }
        x += 1;
      }

      canvasCtx.lineTo(canvasWidth, mid);
      canvasCtx.stroke();
      
      // Close the audio context to prevent resource leaks
      audioCtx.close();
    }).catch((err) => {
      console.error('Error decoding audio data:', err);
      // Try to close the audio context if it was created
      try {
        audioCtx.close();
      } catch (e) {
        // Ignore errors on close
      }
    });
  };

  return (
    <div className="loop-results">
      <div className="results-header">
        <h2>Detected Loops ({loops.length} found)</h2>
        <div className="export-buttons">
          {reportUrl && (
            <button
              onClick={() => downloadFile(reportUrl, `report-${taskId}.json`)}
              className="btn-secondary"
            >
              📄 Download Report
            </button>
          )}
          <button
            onClick={() => {
              setIsGeneratingZip(true);
              // In a real implementation, this would call a backend endpoint
              // to generate and serve a ZIP file
              alert('ZIP generation would be implemented here - for now, use individual download buttons');
              setIsGeneratingZip(false);
            }}
            disabled={isGeneratingZip}
            className={isGeneratingZip ? 'btn-disabled' : 'btn-primary'}
          >
            {isGeneratingZip ? 'Generating...' : '📦 Download All Loops'}
          </button>
          {hasStems && (
            <button
              onClick={() => {
                setIsGeneratingZip(true);
                alert('Stem ZIP generation would be implemented here');
                setIsGeneratingZip(false);
              }}
              disabled={isGeneratingZip}
              className="btn-secondary"
            >
              📦 Download All Stems
            </button>
          )}
        </div>
      </div>

      <div className="loops-grid">
        {loops.map((loop) => (
          <div key={loop.id} className="loop-card">
            <div className="loop-header">
              <h3>Loop #{loop.rank}</h3>
              <span className="loop-score">Score: {(loop.score * 100).toFixed(1)}%</span>
            </div>

            <div className="loop-details">
              <p><strong>Bars:</strong> {loop.bars}</p>
              <p><strong>Duration:</strong> {loop.duration.toFixed(2)} seconds</p>
              <p><strong>Time:</strong> {loop.start_time.toFixed(2)}s → {loop.end_time.toFixed(2)}s</p>
            </div>

            {/* Waveform container */}
            <div className="waveform-container">
              <canvas 
                data-loop-id={loop.id}
                className="waveform-canvas"
                width="100"
                height="40"
              />
            </div>

            <div className="loop-actions">
              <div className="action-group">
                <button
                  onClick={() => {
                    setPlayingPreview(loop.id);
                    // Fetch waveform data when preparing to play
                    fetchWaveformData(loop);
                  }}
                  className="preview-button"
                  title="Play preview"
                  disabled={playingPreview !== null}
                >
                  {playingPreview === loop.id ? '⏳' : '▶️'}
                </button>

                <button
                  onClick={() => {
                    const downloadUrl = `${process.env.REACT_APP_API_URL}/api/loop/${taskId}/${loop.filename}`;
                    downloadFile(downloadUrl, loop.filename);
                  }}
                  className="download-button"
                  title="Download loop file"
                >
                  💾
                </button>
              </div>

              {playingPreview === loop.id && (
                <div className="audio-player-wrapper">
                  <AudioPlayer
                    previewUrl={`${process.env.REACT_APP_API_URL}/api/loop/${taskId}/${loop.filename}`}
                    onEnd={handlePreviewEnd}
                  />
                </div>
              )}

              {loop.stems && (
                <div className="stem-actions">
                  <strong>Stems:</strong>
                  <div className="stem-buttons">
                    {Object.keys(loop.stems).map((stemName) => (
                      <button
                        key={stemName}
                        onClick={() => {
                          const stemUrl = `${process.env.REACT_APP_API_URL}/api/stem/${taskId}/${loop.basename || loop.filename.replace('.wav', '')}/${stemName}`;
                          downloadFile(stemUrl, `${loop.basename || loop.filename.replace('.wav', '')}_${stemName}.wav`);
                        }}
                        className="stem-button"
                        title={`Download ${stemName} stem`}
                      >
                        {stemName.charAt(0).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoopResultsDisplay;
