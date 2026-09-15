import React, { useState, useEffect } from 'react';
import WaveformPlayer from './audio/WaveformPlayer';
import { getTaskStatus } from '../services/apiService';
import { downloadFile } from '../utils/download';
import { DownloadIcon } from './icons';

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

const statusMessageClasses = 'p-8 text-center font-mono text-cyan';

const btnOutline =
  '-skew-x-12 transform border-2 border-magenta bg-transparent px-5 py-2.5 font-mono text-sm uppercase tracking-wider text-magenta transition-all duration-200 ease-linear hover:skew-x-0 hover:bg-magenta hover:text-white hover:shadow-glow-magenta-lg disabled:cursor-not-allowed disabled:opacity-50';

const btnSecondary =
  '-skew-x-12 transform border-2 border-cyan bg-cyan px-5 py-2.5 font-mono text-sm uppercase tracking-wider text-black transition-all duration-200 ease-linear hover:skew-x-0 hover:shadow-glow-cyan-lg disabled:cursor-not-allowed disabled:opacity-50';

const LoopResultsDisplay: React.FC<LoopResultsDisplayProps> = ({ taskId }) => {
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingZip, setIsGeneratingZip] = useState<boolean>(false);

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

  if (loading) {
    return <div className={statusMessageClasses}>&gt; Analyzing audio... Please wait.</div>;
  }

  if (error) {
    return <div className={`${statusMessageClasses} text-magenta`}>&gt; Error: {error}</div>;
  }

  if (!taskStatus) {
    return <div className={statusMessageClasses}>&gt; No task data available.</div>;
  }

  if (taskStatus.status === 'failed') {
    return (
      <div className={`${statusMessageClasses} text-magenta`}>
        &gt; Analysis failed: {taskStatus.error}
      </div>
    );
  }

  if (taskStatus.status !== 'completed' || !taskStatus.result || !taskStatus.result.loops) {
    return (
      <div className={statusMessageClasses}>
        &gt; Waiting for analysis to complete... Current status: {taskStatus.status}
      </div>
    );
  }

  const loops: LoopResult[] = taskStatus.result.loops;
  const hasStems = taskStatus.result?.stems_dir !== null;
  const reportUrl = taskStatus.result?.report_path
    ? `/api/report/${taskId}`
    : null;

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-cyan bg-cyan/10 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <h2 className="font-heading text-xl font-bold uppercase tracking-wider text-cyan drop-shadow-title">
          Detected Loops ({loops.length} found)
        </h2>
        <div className="flex flex-wrap gap-3">
          {reportUrl && (
            <button onClick={() => downloadFile(reportUrl, `report-${taskId}.json`)} className={btnOutline}>
              <span className="inline-flex skew-x-12 transform items-center gap-2">
                <DownloadIcon className="h-4 w-4" /> Download Report
              </span>
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
            className={btnSecondary}
          >
            <span className="inline-flex skew-x-12 transform items-center gap-2">
              <DownloadIcon className="h-4 w-4" />
              {isGeneratingZip ? 'Generating...' : 'Download All Loops'}
            </span>
          </button>
          {hasStems && (
            <button
              onClick={() => {
                setIsGeneratingZip(true);
                alert('Stem ZIP generation would be implemented here');
                setIsGeneratingZip(false);
              }}
              disabled={isGeneratingZip}
              className={btnOutline}
            >
              <span className="inline-flex skew-x-12 transform items-center gap-2">
                <DownloadIcon className="h-4 w-4" /> Download All Stems
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-7 p-6 md:grid-cols-2 sm:p-8">
        {loops.map((loop) => (
          <div
            key={loop.id}
            className="border border-magenta/30 border-t-2 border-t-cyan bg-panel backdrop-blur-md transition-transform duration-200 ease-linear hover:-translate-y-2 hover:shadow-glow-cyan-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-heading text-lg font-bold uppercase text-cyan drop-shadow-title">
                Loop #{loop.rank}
              </h3>
              <span className="border border-sunset px-3 py-1 font-mono text-xs text-sunset">
                {(loop.score * 100).toFixed(1)}%
              </span>
            </div>

            <div className="space-y-1 px-5 py-4 font-mono text-sm text-chrome/70">
              <p><span className="text-chrome">Bars:</span> {loop.bars}</p>
              <p><span className="text-chrome">Duration:</span> {loop.duration.toFixed(2)}s</p>
              <p><span className="text-chrome">Time:</span> {loop.start_time.toFixed(2)}s &rarr; {loop.end_time.toFixed(2)}s</p>
            </div>

            <WaveformPlayer
              audioUrl={`${process.env.REACT_APP_API_URL}/api/loop/${taskId}/${loop.filename}`}
              downloadUrl={`${process.env.REACT_APP_API_URL}/api/loop/${taskId}/${loop.filename}`}
              downloadFilename={loop.filename}
            />

            {loop.stems && Object.keys(loop.stems).length > 0 && (
              <div className="border-t border-border px-5 py-4">
                <strong className="mb-3 block font-mono text-xs uppercase tracking-widest text-chrome">
                  Stems
                </strong>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(loop.stems).map((stemName) => (
                    <button
                      key={stemName}
                      onClick={() => {
                        const stemUrl = `${process.env.REACT_APP_API_URL}/api/stem/${taskId}/${loop.basename || loop.filename.replace('.wav', '')}/${stemName}`;
                        downloadFile(stemUrl, `${loop.basename || loop.filename.replace('.wav', '')}_${stemName}.wav`);
                      }}
                      title={`Download ${stemName} stem`}
                      className="group flex h-9 w-9 rotate-45 items-center justify-center border-2 border-magenta font-mono text-xs font-bold text-magenta transition-all duration-200 ease-linear hover:rotate-90 hover:bg-magenta hover:text-white hover:shadow-glow-magenta"
                    >
                      <span className="-rotate-45 transform transition-all duration-200 ease-linear group-hover:-rotate-90">
                        {stemName.charAt(0).toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoopResultsDisplay;
