const { Router } = require('express');
const { readSyncStatus } = require('../parsers/agents');

const router = Router();

router.get('/sync/status', (req, res) => {
  try {
    const status = readSyncStatus();
    res.json({ status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
