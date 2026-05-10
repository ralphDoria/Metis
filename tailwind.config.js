/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Metis "Nebula" palette
        void: {
          DEFAULT: '#050505',
          deep: '#020203',
          ink: '#0b0b12',
        },
        amethyst: {
          DEFAULT: '#8a2be2',
          soft: '#a06bf0',
          deep: '#5b1aa6',
          haze: 'rgba(138, 43, 226, 0.18)',
        },
        amber: {
          metis: '#ff8c00',
        },
        rose: {
          quartz: '#f472b6',
        },
        ink: {
          glass: 'rgba(255, 255, 255, 0.06)',
          'glass-strong': 'rgba(255, 255, 255, 0.10)',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-strong': 'rgba(255, 255, 255, 0.14)',
        },
        text: {
          primary: '#f5f3ff',
          soft: 'rgba(245, 243, 255, 0.72)',
          faint: 'rgba(245, 243, 255, 0.45)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      letterSpacing: {
        wide: '0.04em',
        wider: '0.08em',
        widest: '0.22em',
      },
      borderRadius: {
        'metis-sm': '12px',
        'metis-md': '18px',
        'metis-lg': '24px',
        'metis-xl': '32px',
      },
      boxShadow: {
        'metis-amethyst':
          '0 0 0 1px rgba(138, 43, 226, 0.35), 0 18px 60px -12px rgba(138, 43, 226, 0.55), 0 4px 24px -6px rgba(160, 107, 240, 0.35)',
        'metis-amber':
          '0 0 0 1px rgba(255, 140, 0, 0.35), 0 18px 60px -12px rgba(255, 140, 0, 0.4)',
        'metis-soft':
          '0 24px 60px -20px rgba(0, 0, 0, 0.6), 0 6px 24px -10px rgba(0, 0, 0, 0.4)',
      },
      backgroundImage: {
        'nebula-violet':
          'radial-gradient(circle, rgba(138, 43, 226, 0.55) 0%, rgba(91, 26, 166, 0.18) 45%, transparent 70%)',
        'nebula-rose':
          'radial-gradient(circle, rgba(244, 114, 182, 0.30) 0%, rgba(138, 43, 226, 0.12) 50%, transparent 75%)',
        'metis-shimmer':
          'linear-gradient(120deg, #a06bf0 0%, #f472b6 50%, #ff8c00 100%)',
      },
      animation: {
        'metis-pulse': 'metis-pulse 5.5s ease-in-out infinite',
        'metis-drift': 'metis-drift 22s ease-in-out infinite',
        'metis-shimmer': 'metis-shimmer 8s ease infinite',
        'metis-fade-up': 'metis-fade-up 0.8s ease both',
        'metis-spin': 'metis-spin 0.7s linear infinite',
      },
      keyframes: {
        'metis-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%':      { transform: 'scale(1.04)', opacity: '0.92' },
        },
        'metis-drift': {
          '0%':   { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          '50%':  { transform: 'translate3d(2%, -1%, 0) rotate(0.6deg)' },
          '100%': { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
        },
        'metis-shimmer': {
          '0%':   { 'background-position': '0% 50%' },
          '100%': { 'background-position': '200% 50%' },
        },
        'metis-fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'metis-spin': {
          to: { transform: 'rotate(360deg)' },
        },
      },
      backdropBlur: {
        glass: '22px',
      },
    },
  },
  plugins: [],
}
