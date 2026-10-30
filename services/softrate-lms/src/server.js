const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log(`[softrate-lms] Server started successfully on port ${config.port} (${config.env})`);
  console.log(`[softrate-lms] Health check: http://localhost:${config.port}/api/health`);
});

const handleShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[softrate-lms] Closed out remaining connections.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
