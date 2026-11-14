'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireClientId } = require('../middleware/clientId');
const { overview } = require('../services/statsService');

router.get(
  '/overview',
  requireClientId,
  asyncHandler(async (req, res) => {
    res.json({ data: await overview(req.clientId) });
  })
);

module.exports = router;
