/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f5f0fa',
          100: '#ebe1f5',
          200: '#d5c2eb',
          300: '#b896d8',
          400: '#9a63c4',
          500: '#7c3aed',
          600: '#6B21A8',
          700: '#5b1a8f',
          800: '#4a1572',
          900: '#3b1059',
          950: '#250a38',
        },
      },
    },
  },
  plugins: [],
};
