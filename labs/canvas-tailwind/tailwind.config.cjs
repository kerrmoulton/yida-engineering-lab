module.exports = {
  prefix: 'lab-',
  content: ['./labs/canvas-tailwind/src/**/*.{js,jsx,ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        proof: '#7c3aed',
      },
      borderRadius: {
        proof: '14px',
      },
    },
  },
  plugins: [],
};
