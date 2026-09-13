import React, { useState } from 'react';
import FileUrlInput from './components/FileUrlInput';
import LoopResultsDisplay from './components/LoopResultsDisplay';
import './App.css';

function App() {
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎵 Loop Finder UI</h1>
        <p>Find and preview musical loops in audio files</p>
      </header>

      <main>
        <FileUrlInput onAnalysisStart={setCurrentTaskId} />

        {currentTaskId && (
          <div className="results-section">
            <LoopResultsDisplay taskId={currentTaskId} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;