import React, { useState } from 'react';
import { uploadFile, analyzeUrl } from '../services/apiService';

interface FileUrlInputProps {
  onAnalysisStart: (taskId: string) => void;
}

const inputClasses =
  'w-full border-b-2 border-magenta bg-black px-3 py-2 font-mono text-lg text-cyan placeholder:text-magenta/50 focus:outline-none focus:border-cyan focus:shadow-glow-cyan disabled:opacity-50';

const FileUrlInput: React.FC<FileUrlInputProps> = ({ onAnalysisStart }) => {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string>('');
  const [bars, setBars] = useState<string>('4,2');
  const [top, setTop] = useState<number>(5);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      let taskId: string;

      if (file) {
        const response = await uploadFile(file, bars, top);
        taskId = response.task_id;
      } else if (url.trim()) {
        const response = await analyzeUrl(url.trim(), bars, top);
        taskId = response.task_id;
      } else {
        throw new Error('Please provide either a file or a URL');
      }

      setSuccess(`Analysis started! Task ID: ${taskId}`);
      onAnalysisStart(taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="border-2 border-cyan bg-black/80 shadow-glow-cyan-lg">
      <div className="flex items-center gap-2 border-b border-cyan bg-cyan/10 px-4 py-2">
        <div className="flex gap-2">
          <div className="h-3 w-3 rounded-full bg-magenta" />
          <div className="h-3 w-3 rounded-full bg-cyan" />
          <div className="h-3 w-3 rounded-full bg-sunset" />
        </div>
        <span className="font-mono text-xs uppercase tracking-widest text-cyan/70">
          analyze_audio.exe
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8 p-6 sm:p-8">
        <div>
          <label
            htmlFor="file-input"
            className="mb-3 block font-mono text-sm uppercase tracking-wider text-chrome"
          >
            &gt; Select a local audio file
          </label>
          <input
            type="file"
            id="file-input"
            accept="audio/*"
            onChange={handleFileChange}
            disabled={isProcessing}
            className="w-full border-2 border-dashed border-border bg-panel px-3 py-3 font-mono text-sm text-chrome file:mr-4 file:border-0 file:bg-magenta file:px-4 file:py-2 file:font-mono file:uppercase file:text-white hover:border-magenta disabled:opacity-50"
          />
          {file && <p className="mt-2 font-mono text-sm text-cyan">Selected: {file.name}</p>}
        </div>

        <div>
          <label
            htmlFor="url-input"
            className="mb-3 block font-mono text-sm uppercase tracking-wider text-chrome"
          >
            &gt; Or enter a YouTube / direct audio URL
          </label>
          <input
            type="text"
            id="url-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={isProcessing}
            className={inputClasses}
          />
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
          <div className="flex-1">
            <label
              htmlFor="bars-input"
              className="mb-3 block font-mono text-sm uppercase tracking-wider text-chrome"
            >
              &gt; Bar lengths
            </label>
            <input
              type="text"
              id="bars-input"
              value={bars}
              onChange={(e) => setBars(e.target.value)}
              placeholder="4,2 or 2,4,8"
              disabled={isProcessing}
              className={inputClasses}
            />
          </div>
          <div className="flex-1">
            <label
              htmlFor="top-input"
              className="mb-3 block font-mono text-sm uppercase tracking-wider text-chrome"
            >
              &gt; Top candidates per bar
            </label>
            <input
              type="number"
              id="top-input"
              value={top}
              onChange={(e) => setTop(parseInt(e.target.value) || 5)}
              min="1"
              disabled={isProcessing}
              className={inputClasses}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isProcessing}
          className="-skew-x-12 transform border-2 border-cyan bg-transparent px-6 py-3 font-mono uppercase tracking-widest text-cyan transition-all duration-200 ease-linear hover:skew-x-0 hover:bg-cyan hover:text-black hover:shadow-glow-cyan-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="inline-block skew-x-12 transform">
            {isProcessing ? 'Processing...' : 'Analyze Audio'}
          </span>
        </button>
      </form>

      {error && (
        <div className="mx-6 mb-6 border-2 border-magenta bg-magenta/10 px-4 py-3 font-mono text-sm text-magenta sm:mx-8">
          &gt; ERROR: {error}
        </div>
      )}
      {success && (
        <div className="mx-6 mb-6 border-2 border-cyan bg-cyan/10 px-4 py-3 font-mono text-sm text-cyan sm:mx-8">
          &gt; {success}
        </div>
      )}
    </div>
  );
};

export default FileUrlInput;
