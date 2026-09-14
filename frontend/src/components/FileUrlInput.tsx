import React, { useState } from 'react';
import { uploadFile, analyzeUrl } from '../services/apiService';

interface FileUrlInputProps {
  onAnalysisStart: (taskId: string) => void;
}

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
    <div className="file-url-input">
      <h2>Analyze Audio</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="file-input">Or select a local audio file:</label>
          <input
            type="file"
            id="file-input"
            accept="audio/*"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
          {file && <p>Selected: {file.name}</p>}
        </div>

        <div className="input-group">
          <label htmlFor="url-input">Or enter a YouTube or direct audio URL:</label>
          <input
            type="text"
            id="url-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or direct audio URL"
            disabled={isProcessing}
          />
        </div>

        <div className="options-group">
          <div className="option-row">
            <label htmlFor="bars-input">Bar lengths:</label>
            <input
              type="text"
              id="bars-input"
              value={bars}
              onChange={(e) => setBars(e.target.value)}
              placeholder="4,2 or 2,4,8"
              disabled={isProcessing}
            />
          </div>
          <div className="option-row">
            <label htmlFor="top-input">Top candidates per bar:</label>
            <input
              type="number"
              id="top-input"
              value={top}
              onChange={(e) => setTop(parseInt(e.target.value) || 5)}
              min="1"
              disabled={isProcessing}
            />
          </div>
        </div>

        <button type="submit" disabled={isProcessing} className="btn-primary">
          {isProcessing ? 'Processing...' : 'Analyze Audio'}
        </button>
      </form>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
    </div>
  );
};

export default FileUrlInput;
