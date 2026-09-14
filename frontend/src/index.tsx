import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

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

// Initialize theme on load
const initializeTheme = () => {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('system'); // Will use dark mode due to CSS media query
    } else {
      setTheme('system'); // Will use light mode due to CSS media query
    }
  }
};

// Initialize theme when the script loads
if (typeof window !== 'undefined') {
  initializeTheme();
  
  // Listen for system theme changes - only update if user hasn't explicitly set a theme
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    // Only respond to system changes if we're currently in system mode
    if (!savedTheme || savedTheme === 'system') {
      // In system mode, we don't need to change the theme class - CSS handles it automatically
      // But we could store the preferred value for reference if needed
      // localStorage.setItem('system-preference', e.matches ? 'dark' : 'light');
    }
  });
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
