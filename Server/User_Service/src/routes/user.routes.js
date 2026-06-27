import express from 'express';
import {
  blockUser,
  createChannel,
  getChannelByHandle,
  getMyProfile,
  getProfile,
  getSubscriptions,
  subscribe,
  updateChannel,
} from '../controllers/user.controller.js';
import requireDB from '../middleware/requireDB.js';
import verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

router.get('/me', requireDB, verifyToken, getMyProfile);
router.get('/me/subscriptions', requireDB, verifyToken, getSubscriptions);
router.post('/channel', requireDB, verifyToken, createChannel);
router.patch('/me', requireDB, verifyToken, updateChannel);
router.post('/:userId/subscribe', requireDB, verifyToken, subscribe);
router.post('/:userId/block', requireDB, verifyToken, blockUser);
router.get('/handle/:handle', requireDB, getChannelByHandle);
router.get('/:userId', requireDB, getProfile);

export default router;
