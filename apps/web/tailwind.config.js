/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        'theme-primary': 'rgb(var(--theme-primary) / <alpha-value>)',
        'theme-primary-light': 'rgb(var(--theme-primary-light) / <alpha-value>)',
        'theme-primary-dark': 'rgb(var(--theme-primary-dark) / <alpha-value>)',
        'theme-accent': 'rgb(var(--theme-accent) / <alpha-value>)',
        'theme-accent-light': 'rgb(var(--theme-accent-light) / <alpha-value>)',
        'theme-gradient-from': 'rgb(var(--theme-gradient-from) / <alpha-value>)',
        'theme-gradient-to': 'rgb(var(--theme-gradient-to) / <alpha-value>)',
        'theme-background': 'rgb(var(--theme-background) / <alpha-value>)',
        'theme-surface': 'rgb(var(--theme-surface) / <alpha-value>)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Merriweather', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
