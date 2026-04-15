require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { initDB } = require('./db/init');
const authRoutes = require('./routes/auth');
const wrapRoutes = require('./routes/wraps');
const userRoutes = require('./routes/users');
const rbacRoutes = require('./routes/rbac');
const { router: analyticsRoutes } = require('./routes/analytics');
const { router: integrationsRoutes } = require('./routes/integrations');
const forecastingRoutes = require('./routes/forecasting');
const { errorHandler } = require('./middleware/errorHandler');
const { autoAuthenticateAgent } = require('./middleware/agent-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',').map(s => s.trim());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// Health check (before auth middleware)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes (before auth middleware)
app.use('/api/auth', authRoutes);

// Auto-detect and authenticate any agent (for protected routes)
app.use(autoAuthenticateAgent);

// Protected routes (after auth middleware)
app.use('/api/wraps', wrapRoutes);
app.use('/api/users', userRoutes);
app.use('/api', rbacRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', integrationsRoutes);
app.use('/api/forecasting', forecastingRoutes);

// Error handling
app.use(errorHandler);

// Serve React static files
app.use(express.static(path.join(__dirname, '../web/dist')));

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});

// Initialize DB and start server
async function start() {
  try {
    console.log('🔧 Initializing database...');
    await initDB();
    console.log('✅ Database initialized');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 API: http://localhost:${PORT}/api`);
      console.log(`❤️  Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();

module.exports = app;
