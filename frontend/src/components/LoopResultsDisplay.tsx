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

  return (
    <div className="loop-results">
      <h2>Detected Loops ({loops.length} found)</h2>
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
              <button
                onClick={() => playPreview(loop.preview_url)}
                className="preview-button"
              >
                ▶️ Preview
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to play audio preview
const playPreview = async (previewUrl: string) => {
  try {
    const audio = new Audio(previewUrl);
    await audio.play();
  } catch (err) {
    console.error('Failed to play preview:', err);
    // In a real app, show user-friendly error
  }
};

export default LoopResultsDisplay;