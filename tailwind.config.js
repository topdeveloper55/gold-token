/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // './public/**/*.html',
    './src/**/*.{js,jsx,ts,tsx,css,scss}',
  ],
  darkMode: 'class', // 'media' is the default, change to 'class' if you want to use dark mode in with class names
  theme: {
    extend: {},
    screens: {
      desktop: '1420px',
      mobile: '640px',
    },
  },

  plugins: [require('@tailwindcss/typography')],
}
