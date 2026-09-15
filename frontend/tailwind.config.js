/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#090014',
        chrome: '#E0E0E0',
        panel: 'rgba(26, 16, 60, 0.8)',
        magenta: '#FF00FF',
        cyan: '#00FFFF',
        sunset: '#FF9900',
        border: '#2D1B4E',
      },
      fontFamily: {
        heading: ['Orbitron', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-magenta': '0 0 10px #FF00FF',
        'glow-magenta-lg': '0 0 20px #FF00FF',
        'glow-cyan': '0 0 15px #00FFFF',
        'glow-cyan-lg': '0 0 20px rgba(0,255,255,0.2)',
        'glow-cyan-xl': '0 0 50px rgba(0,255,255,0.2)',
      },
      dropShadow: {
        heading: '0 0 10px rgba(255,255,255,0.5)',
        gradient: '0 0 30px rgba(255,0,255,0.6)',
        title: '0 0 5px rgba(0,255,255,0.8)',
      },
      transitionTimingFunction: {
        digital: 'linear',
      },
    },
  },
  plugins: [],
};
