/** @type {import('tailwindcss').Config} */
const scale = (name) => Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, `rgb(var(--${name}-${k}) / <alpha-value>)`]));
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary + accent come from CSS variables so the theme can be changed at runtime (Admin → Branding).
        brand: scale('brand'),
        accent: scale('accent'),
        dark: 'rgb(var(--dark) / <alpha-value>)',
        // Slate neutrals (SSL Wireless UI greys)
        ink: { 900: '#0F172A', 800: '#1E293B', 700: '#334155', 500: '#64748B', 300: '#CBD5E1', 100: '#E2E8F0', 50: '#F8FAFC' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { theme: 'var(--radius)' },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.04), 0 4px 16px rgba(15,23,42,.06)', pop: '0 12px 40px rgba(15,23,42,.18)' },
      keyframes: { fadein: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } } },
      animation: { fadein: 'fadein .25s ease-out' },
    },
  },
  plugins: [],
};
