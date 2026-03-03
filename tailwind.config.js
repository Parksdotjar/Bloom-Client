/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bloom: {
          500: '#ff7eb3',
          900: '#5c228a'
        },
        surface: {
          DEFAULT: '#17171d',
          dark: '#0f0f13'
        }
      }
    },
  },
  plugins: [],
}
