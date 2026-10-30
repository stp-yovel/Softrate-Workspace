const express = require('express');
const { login, verifyMfa, getMe } = require('./auth.controller');

const router = express.Router();

router.post('/login', login);
router.post('/mfa/verify', verifyMfa);
router.get('/me', getMe);

module.exports = router;
