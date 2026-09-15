import React, { useState } from 'react';
import FileUrlInput from './components/FileUrlInput';
import LoopResultsDisplay from './components/LoopResultsDisplay';

function App() {
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen bg-void text-chrome">
      <div className="bg-grid-floor" />
      <div className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gradient-to-b from-sunset to-magenta opacity-20 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <header className="mb-12 text-center">
          <h1 className="font-heading text-4xl font-black uppercase tracking-wider text-transparent sm:text-6xl">
            <span className="bg-gradient-to-r from-sunset via-magenta to-cyan bg-clip-text drop-shadow-title">
              Loop Finder
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl font-mono text-sm text-chrome/70 sm:text-lg">
            &gt; Find and preview musical loops in audio files
          </p>
        </header>

        <main className="flex flex-col gap-10">
          <FileUrlInput onAnalysisStart={setCurrentTaskId} />

          {currentTaskId && (
            <div className="border-2 border-cyan bg-black/80 shadow-glow-cyan-lg">
              <LoopResultsDisplay taskId={currentTaskId} />
            </div>
          )}
        </main>
      </div>

      <div className="scanline-overlay" />
    </div>
  );
}

export default App;
