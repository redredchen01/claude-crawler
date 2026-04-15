const { Router } = require('express');
const { readDecisions } = require('../parsers/decisions');

const router = Router();

router.get('/decisions', (req, res) => {
  try {
    const { q, agent, start_date, end_date } = req.query;
    const decisions = readDecisions({ q, agent, start_date, end_date });
    res.json({ decisions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
