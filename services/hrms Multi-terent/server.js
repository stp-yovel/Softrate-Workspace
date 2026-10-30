const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const compression = require('compression');

[
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
].filter((envPath) => fs.existsSync(envPath)).forEach((envPath) => {
  dotenv.config({ path: envPath });
});

// ============================
// Startup Guards
// ============================
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET is not set in environment. Refusing to start.');
  process.exit(1);
}

require("./cron/leaveReset.cron");


const app = express();
app.set("trust proxy", 1);
app.use(compression());

// ── CORS: allow softrate domains, careers portal, localhost, and env-configured origins ──
const defaultAllowedPatterns = [
  /^https?:\/\/(.+\.)?softrateglobal\.com(:\d+)?$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/
];

const envAllowed = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (defaultAllowedPatterns.some(pattern => pattern.test(origin))) {
      return callback(null, true);
    }
    if (envAllowed.length === 0 || envAllowed.includes(origin) || envAllowed.includes('*')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-company-code',
    'X-Demo-Mode',
    'Cache-Control',
    'Pragma',
    'Expires'
  ],
  credentials: true
}));

// ── Body limits: 50 MB for JSON, multer handles large uploads separately ──
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ============================
// MongoDB Multi-Tenant Connections
// ============================
const { getMasterConnection, getTenantConnection, waitForConnection } = require('./db');

// Pre-warm Master DB connection at startup
const masterDb = getMasterConnection();
waitForConnection(masterDb)
  .then(async () => {
    console.log('✅ Master DB (hrdb_master) ready');
    // Pre-warm the publicTenant company cache so the first user request is never slow.
    // Atlas M0 free tier has ~26s cold fetch for large documents;
    // after this startup pre-warm, all public route requests hit the in-memory cache (0ms).
    try {
      const CompanyModelExport = require('./models/CompanyModel');
      const Company = masterDb.models.Company || masterDb.model('Company', CompanyModelExport.schema);
      // ❌ DO NOT include settings.offerLetterSettings here — it's 2.2MB per company
      // and causes a 24s cold start on every container restart.
      const companies = await Company.find(
        {},
        {
          name: 1, companyCode: 1, dbName: 1,
          'settings.receivingEmail': 1,
          'settings.defaultPassword': 1,
          'settings.careerPostings': 1,
          'settings.communication.emailLogoUrl': 1,
          'settings.communication.smtpHost': 1,
          'settings.communication.fromName': 1,
        }
      ).lean();

      // 1️⃣ Pre-warm the publicTenant middleware cache (unauthenticated public routes)
      const { warmPublicCompanyCache } = require('./middleware/publicTenant.middleware');
      if (typeof warmPublicCompanyCache === 'function') {
        warmPublicCompanyCache(companies);
        console.log(`✅ Public company cache pre-warmed for ${companies.length} tenant(s)`);
      }

      // 2️⃣ Pre-warm the authenticated tenant middleware cache (companyId → company)
      // This ensures /me, /settings/company, etc. are instant after restart
      const { warmTenantCache } = require('./middleware/tenant.middleware');
      if (typeof warmTenantCache === 'function') {
        warmTenantCache(companies);
        console.log(`✅ Authenticated tenant cache pre-warmed for ${companies.length} tenant(s)`);
      }

      // 3️⃣ Also seed the shared companyCache (keyed by companyCode) for login/forgotPassword
      const { setCachedCompany } = require('./utilities/companyCache');
      companies.forEach(c => {
        if (c.companyCode) setCachedCompany(c.companyCode, c);
      });

      // 3️⃣ Pre-warm tenant DB connections for each company
      companies.forEach(c => {
        if (c.dbName) {
          const tenantDb = getTenantConnection(c.dbName);
          waitForConnection(tenantDb)
            .then(() => console.log(`  ✅ Tenant DB ready: ${c.dbName}`))
            .catch(() => {}); // non-fatal
        }
      });
    } catch (err) {
      console.warn('⚠️  Company cache pre-warm failed (non-fatal):', err.message);
    }
  })
  .catch(err => console.error('❌ Master DB connection error:', err));

// Pre-warm legacy hrdb for existing mobile app users (no companyCode)
const legacyDb = getTenantConnection('hrdb');
waitForConnection(legacyDb)
  .then(() => console.log('✅ Legacy DB (hrdb) ready'))
  .catch(err => console.error('❌ Legacy DB connection error:', err));


// ============================
// Routes
// ============================
app.use('/api/hr', require('./routes/HrRouters'));
app.use('/api/intern', require('./routes/internRoutes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/attendance', require('./routes/attendanceroutes'));
app.use('/api/reviews', require('./routes/internReview.route'));
app.use('/api/resignation', require('./routes/resignation.routes'));
app.use('/api', require('./routes/send-documents'));
app.use('/api/employee', require('./routes/EmployeeRouter'));
app.use('/api/employeeAttanance', require('./routes/EmployeeAttendance'));
app.use("/api/employee-leave", require("./routes/employeeLeave.routes"));
app.use("/api/employee-reviews", require("./routes/employeeReview.routes"));
app.use("/api/employee-resignations", require("./routes/employee-resignation-routes"));
app.use('/api/employee-terminations', require('./routes/employeeTermination.routes'));
app.use('/api/leave-counter', require('./routes/leaveCounter.routes'));
app.use('/api/policy', require('./routes/policyRoutes'));
app.use("/api/holidays", require("./routes/holiday.routes"));
app.use("/api/assignments", require("./routes/assignment.routes"));
app.use("/api/attendance-requests", require("./routes/attendanceRequest.routes"));
app.use('/api/projects', require('./routes/project.routes'));
app.use('/api/onboarding', require('./routes/onboarding.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/performance-templates', require('./routes/performance.routes'));
app.use('/api/convert', require('./routes/conversion.routes'));
app.use('/api/fund-requests', require('./routes/fundRequest.routes'));
app.use('/api/device-change-requests', require('./routes/deviceChangeRequest.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/walkin-drives', require('./routes/walkinDrive.routes'));
app.use('/api/payroll', require('./routes/payroll.routes'));
app.use('/api/shortlist', require('./routes/shortlist.routes'));
app.use('/api/campus-hiring', require('./routes/campusHiring.routes'));
app.use('/api/lms', require('./routes/lms.routes'));

// ============================
// Test Route
// ============================
app.get('/', (req, res) => {
  res.send('HRM Backend is running');
});


// ============================
// Start Server with Socket.io
// ============================
const PORT = process.env.PORT || 5001;
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Make io accessible in routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`🏠 Client ${socket.id} joined room: ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// ============================
// Global Error Handler
// ============================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error')
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
