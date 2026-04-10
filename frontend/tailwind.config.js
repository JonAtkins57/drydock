/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        drydock: {
          dark: '#0f2027',
          mid: '#1a3a4a',
          steel: '#5b7b8a',
          light: '#c8dde6',
          accent: '#4ecdc4',
          'accent-dim': '#3ba89f',
          bg: '#0a1a22',
          card: '#0f2a35',
          border: '#1d4455',
          text: '#e8f0f4',
          'text-dim': '#8ab4c7',
        },
      },
      fontFamily: {
        sans: ['"Anthropic Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
