const express = require('express');
const cors = require('cors');
const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const coursesRoutes = require('./modules/courses/courses.routes');
const enrollmentsRoutes = require('./modules/enrollments/enrollments.routes');

const app = express();

// Disable ETags to avoid stale 304 Not Modified responses on dynamic API routes
app.set('etag', false);

// Global Middlewares
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Enforce no-cache on all API responses to ensure fresh state from database
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
  next();
});

// Base route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'softrate-lms',
    message: 'Softrate LMS API is running',
  });
});

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/enrollments', enrollmentsRoutes);

// Media uploads proxy to PeopleSoft
app.use('/uploads', (req, res) => {
  res.redirect(`${config.peopleSoftApiUrl}/uploads${req.url}`);
});

// Fallback & Error Handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
