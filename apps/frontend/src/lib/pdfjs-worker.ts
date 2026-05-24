import { pdfjs } from 'react-pdf';

// Configure pdf.js worker from the bundled file to avoid CDN/CSP issues
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
