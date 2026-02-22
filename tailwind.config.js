/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand (POS_V2 light palette)
        primary: '#604be8',
        'primary-dark': '#4a3bb8',
        secondary: '#10ce9e',
        accent: '#ff9d00',

        // Light theme as default (POS_V2)
        background: '#f3f7ff',
        'background-secondary': '#ffffff',
        'background-tertiary': '#eef2f7',

        // Semantic tokens (use these in components instead of hard-coded whites)
        'search-background': '#ffffff',
        'text-inverse': '#ffffff',

        text: '#232121',
        'text-secondary': '#4a68a6',
        'text-tertiary': '#757575',

        border: '#d8dde6',
        'border-light': '#e8edf6',

        surface: '#ffffff',
      },
      fontSize: {
        // Mobile-friendly global typography scale
        xs: '0.75rem',   // 12
        sm: '0.875rem',  // 14
        base: '1rem',    // 16
        lg: '1.125rem',  // 18
        xl: '1.25rem',   // 20
        '2xl': '1.5rem', // 24
      },
    },
  },
  plugins: [],
};
