const { Router } = require('express');
const { readMemoryStats } = require('../parsers/memory-stats');

const router = Router();

router.get('/memory/stats', async (req, res) => {
  try {
    const stats = await readMemoryStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
