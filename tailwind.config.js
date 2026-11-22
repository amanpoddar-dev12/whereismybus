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
        canvas: 'rgb(var(--wimb-canvas) / <alpha-value>)',
        card: 'rgb(var(--wimb-card) / <alpha-value>)',
        border: 'rgb(var(--wimb-border) / <alpha-value>)',
        transit: {
          navy: '#18181B',
          indigo: '#27272A',
          accent: '#18181B',
          emerald: '#059669',
          emeraldBright: '#10B981',
          amber: '#D97706',
          coral: '#E11D48',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(9, 9, 11, 0.06), 0 1px 1px -1px rgba(9, 9, 11, 0.04)',
        'card': '0 1px 3px 0 rgba(9, 9, 11, 0.08), 0 1px 2px -1px rgba(9, 9, 11, 0.05)',
        'elevated': '0 12px 32px -4px rgba(9, 9, 11, 0.12), 0 4px 12px -2px rgba(9, 9, 11, 0.06)',
      },
      animation: {
        'pulse-fast': 'pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar-ping': 'ping 2.2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
