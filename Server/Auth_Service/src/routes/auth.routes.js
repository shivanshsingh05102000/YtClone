import express from 'express';
import { register, login, refresh, logout, me } from '../controllers/auth.controller.js';
import verifyToken from '../middleware/verifyToken.js';
import requireDB from '../middleware/requireDB.js';

const router = express.Router();

router.post('/register', requireDB, register);
router.post('/login', requireDB, login);
router.post('/refresh', requireDB, refresh);
router.post('/logout', requireDB, logout);
router.get('/me', requireDB, verifyToken, me);

export default router;
