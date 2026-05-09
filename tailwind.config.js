/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0a0a0c",
          800: "#15151a",
          700: "#1f1f27",
          600: "#2a2a35",
          500: "#3a3a48",
          400: "#5b5b6e",
          300: "#8a8a9a",
          200: "#c4c4d0",
          100: "#e8e8ee"
        },
        accent: {
          500: "#6366f1",
          600: "#4f46e5",
          400: "#818cf8"
        },
        danger: {
          500: "#ef4444",
          600: "#dc2626"
        },
        warn: {
          500: "#f59e0b",
          600: "#d97706"
        },
        ok: {
          500: "#10b981",
          600: "#059669"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"]
      },
      animation: {
        "pulse-recording": "pulse-recording 1.6s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite"
      },
      keyframes: {
        "pulse-recording": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(1.15)" }
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        }
      }
    }
  },
  plugins: []
}
