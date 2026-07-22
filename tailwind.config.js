/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      screens: {
        'mobile': {'max': '639px'},     // Écran extra-petit
        'tablette': {'min': '640px', 'max': '767px'},  // Écran petit
        'desktop': {'min': '768px', 'max': '1279px'}, // Écran moyen
        'xl': {'min': '1280px'},        // Écran extra-large
      },
    },
  },

  plugins: [
    require("daisyui"),
  ],

  daisyui: {
    themes: [
      {
        senafreight: {
          "primary": "#0F766E",
          "secondary": "#10201D",
          "accent": "#0F766E",
          "neutral": "#101816",
          "base-100": "#FFFFFF",

          "info": "#0EA5E9",
          "success": "#16A34A",
          "warning": "#D97706",
          "error": "#DC2626",
        },
      },
    ],
  },
}
