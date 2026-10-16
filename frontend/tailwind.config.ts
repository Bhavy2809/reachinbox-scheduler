import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Green from the Figma (buttons, active nav, chips)
        brand: {
          50: '#effaf3',
          100: '#dcf5e5',
          200: '#b6e9c9',
          500: '#22b45a',
          600: '#0fa64a',
          700: '#0b8a3d',
        },
        // Light greys used for inputs / editor / search bar
        surface: {
          50: '#fafafa',
          100: '#f4f5f4',
          200: '#ececec',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        pixel: ['var(--font-pixel)', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        xs: ['12px', '16px'],
        sm: ['13px', '20px'],
      },
      boxShadow: {
        pop: '0 8px 30px rgba(16, 24, 40, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
