const express = require('express');
const cors = require('cors');
const { PORT, CORS_ORIGINS } = require('./config');

const tasksRouter = require('./routes/tasks');
const decisionsRouter = require('./routes/decisions');
const memoryRouter = require('./routes/memory');
const syncRouter = require('./routes/sync');

const app = express();

app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());

app.use('/api', tasksRouter);
app.use('/api', decisionsRouter);
app.use('/api', memoryRouter);
app.use('/api', syncRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`Dashboard API server running on http://localhost:${PORT}`);
});

module.exports = app;
