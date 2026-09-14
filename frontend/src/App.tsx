import React, { useState, useEffect } from 'react';
import FileUrlInput from './components/FileUrlInput';
import LoopResultsDisplay from './components/LoopResultsDisplay';
import './App.css';

// Function to set theme
const setTheme = (theme: 'light' | 'dark' | 'system') => {
  const root = window.document.documentElement;
  root.classList.remove('light-theme', 'dark-theme');
  
  if (theme === 'system') {
    // Remove any forced theme classes, let system preference handle it
    return;
  }
  
  root.classList.add(`${theme}-theme`);
  
  // Save preference to localStorage
  localStorage.setItem('theme', theme);
};

function App() {
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    // Initialize theme from localStorage on first load
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    if (savedTheme) {
      setThemeState(savedTheme);
    }
  }, []);

  const handleThemeToggle = () => {
    const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    setThemeState(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <div className={`App ${theme === 'system' ? 'App-theme-transition' : ''}`}>
      <header className="App-header">
        <div className="header-content">
          <div>
            <h1>🎵 Loop Finder UI</h1>
            <p>Find and preview musical loops in audio files</p>
          </div>
          <button
            onClick={handleThemeToggle}
            className="btn-ghost theme-toggle"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : theme === 'light' ? '🌙' : '🖥️'}
          </button>
        </div>
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
