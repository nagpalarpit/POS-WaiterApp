/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        primary: '#8024DD',
        'primary-dark': '#6a1db8',
        secondary: '#10ce9e',
        accent: '#ff9d00',

        // Dark theme as default
        background: '#141122',
        'background-secondary': '#221F32',
        'background-tertiary': '#060214',

        // Semantic tokens (use these in components instead of hard-coded whites)
        'search-background': '#2A2538',
        'text-inverse': '#1D1931',

        text: '#FFFFFF',
        'text-secondary': '#B8B5C0',
        'text-tertiary': '#8A8795',

        border: '#2A2538',
        'border-light': '#332E42',

        surface: '#221F32',
      },
      fontSize: {
        xs: '0.625rem',
        sm: '0.75rem',
        base: '0.875rem',
        lg: '1rem',
        xl: '1.125rem',
      },
    },
  },
  plugins: [],
};
