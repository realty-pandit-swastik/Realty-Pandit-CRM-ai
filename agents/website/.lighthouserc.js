// Lighthouse CI config — Marketing / Agent+Builder portal (Next.js, port 3001)
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm start -- --port 3001',
      startServerReadyPattern: 'Ready on|started server',
      startServerReadyTimeout: 60000,
      url: [
        'http://localhost:3001',
        'http://localhost:3001/about',
      ],
      numberOfRuns: 1,
      settings: {
        throttlingMethod: 'simulate',
        skipAudits: ['uses-http2'],
        chromeFlags: '--no-sandbox --disable-dev-shm-usage --disable-gpu',
      },
    },
    assert: {
      assertions: {
        'categories:performance':    ['warn',  { minScore: 0.85 }],
        'categories:accessibility':  ['error', { minScore: 0.90 }],
        'categories:best-practices': ['warn',  { minScore: 0.90 }],
        'categories:seo':            ['warn',  { minScore: 0.90 }],
        'categories:pwa':            ['warn',  { minScore: 0.80 }],
        'first-contentful-paint':    ['warn',  { maxNumericValue: 3000 }],
        'largest-contentful-paint':  ['warn',  { maxNumericValue: 4000 }],
        'cumulative-layout-shift':   ['warn',  { maxNumericValue: 0.1  }],
        'total-blocking-time':       ['warn',  { maxNumericValue: 600  }],
        'installable-manifest':      ['warn',  { minScore: 1 }],
        'service-worker':            ['warn',  { minScore: 1 }],
        'color-contrast':            ['error', { minScore: 1 }],
        'image-alt':                 ['error', { minScore: 1 }],
        'label':                     ['error', { minScore: 1 }],
        'is-on-https':               ['error', { minScore: 1 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
