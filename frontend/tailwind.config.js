export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        ink: {
          950: '#060a13',
          900: '#0a0f1c',
          800: '#0d1424',
          700: '#131b2e',
        },
        sidebar: '#070b15',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        card:      '0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.35)',
        'card-lg': '0 0 0 1px rgba(255,255,255,0.03), 0 16px 48px rgba(0,0,0,0.45)',
        'glow-indigo':  '0 0 20px rgba(99,102,241,0.35)',
        'glow-emerald': '0 0 14px rgba(16,185,129,0.30)',
        'glow-red':     '0 0 14px rgba(239,68,68,0.30)',
      },
    },
  },
  plugins: [],
};
