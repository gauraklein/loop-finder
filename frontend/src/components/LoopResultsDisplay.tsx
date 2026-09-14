import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    const checkStatus = async () => {
      try {
        setLoading(true);
        const status = await getTaskStatus(taskId);
        setTaskStatus(status);
        setLoading(false);

        // Poll for updates if still processing
        if (status.status === 'analyzing' || status.status === 'processing_url' || status.status === 'downloading') {
          setTimeout(checkStatus, 2000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch task status');
        setLoading(false);
      }
    };

    checkStatus();

    // Set up interval polling
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [taskId]);

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

  // Generate ZIP download URL (would need backend endpoint)
  const zipUrl = hasStems
    ? `/api/zip-loops/${taskId}`
    : `/api/zip-loops/${taskId}?stems=false`;

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

            <div className="loop-actions">
              <div className="action-group">
                <button
                  onClick={() => {
                    const previewUrl = `${process.env.REACT_APP_API_URL}/api/loop/${taskId}/${loop.filename}`;
                    playPreview(previewUrl);
                  }}
                  className="preview-button"
                  title="Play preview"
                >
                  ▶️
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

// Helper function to play audio preview with better error handling
const playPreview = async (previewUrl: string) => {
  console.log('Attempting to play:', previewUrl);

  try {
    const audio = new Audio(previewUrl);

    audio.addEventListener('canplaythrough', () => {
      console.log('Audio ready to play');
    });

    audio.addEventListener('error', (e) => {
      console.error('Audio element error:', e);
      alert('Failed to load audio preview. Check console for details.');
    });

    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.then(_ => {
        console.log('Playback started successfully');
      }).catch(error => {
        console.error('Autoplay prevented:', error);
        alert('Click anywhere on the page first to enable audio playback, then try again.');
      });
    }
  } catch (err) {
    console.error('Failed to create audio player:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    alert('Error creating audio player: ' + message);
  }
};

export default LoopResultsDisplay;