import mongoose from 'mongoose';
import Channel from '../models/Channel.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

const HANDLE_PATTERN = /^[a-z0-9_]+$/;
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const UPDATE_FIELDS = ['displayName', 'bio', 'avatar', 'banner'];

function assertObjectId(value, fieldName = 'userId') {
  if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
}

function hasOwn(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function assertString(value, field) {
  if (typeof value !== 'string') {
    throw new ApiError(400, `${field} must be a string`);
  }
}

function normalizeHandle(handle) {
  return handle.toLowerCase().replace(/^@/, '');
}

function validateHandle(handle) {
  if (handle.length < 3 || handle.length > 30) {
    throw new ApiError(400, 'Handle must be between 3 and 30 characters');
  }
  if (!HANDLE_PATTERN.test(handle)) {
    throw new ApiError(400, 'Handle may only contain lowercase letters, numbers, and underscores');
  }
}

function validateDisplayName(displayName) {
  const normalized = displayName.trim();
  if (normalized.length < 1 || normalized.length > 50) {
    throw new ApiError(400, 'Display name must be between 1 and 50 characters');
  }
}

function validateBio(bio) {
  if (bio.length > 500) {
    throw new ApiError(400, 'Bio must not exceed 500 characters');
  }
}

function validateUpdateField(field, value) {
  assertString(value, field);
  if (field === 'displayName') validateDisplayName(value);
  if (field === 'bio') validateBio(value);
}

function serializePublicChannel(channel) {
  return {
    userId: channel.userId,
    handle: channel.handle,
    displayName: channel.displayName,
    bio: channel.bio,
    avatar: channel.avatar,
    banner: channel.banner,
    subscriberCount: channel.subscriberCount,
    isVerified: channel.isVerified,
    role: channel.role,
    createdAt: channel.createdAt,
  };
}

function serializePrivateChannel(channel) {
  return {
    ...serializePublicChannel(channel),
    subscribers: (channel.subscribers || []).map((id) => id.toString()),
    blocked: (channel.blocked || []).map((id) => id.toString()),
  };
}

function serializeSubscription(channel) {
  return {
    userId: channel.userId,
    handle: channel.handle,
    displayName: channel.displayName,
    avatar: channel.avatar,
    subscriberCount: channel.subscriberCount,
    isVerified: channel.isVerified,
  };
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export const getProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  assertObjectId(userId);

  const channel = await Channel.findOne({ userId }).select('-subscribers -blocked');
  if (!channel) {
    throw new ApiError(404, 'Channel not found');
  }

  res.status(200).json({
    success: true,
    message: 'Channel profile fetched',
    channel: serializePublicChannel(channel),
  });
});

export const getMyProfile = asyncHandler(async (req, res) => {
  const channel = await Channel.findOne({ userId: req.user.id }).select('+subscribers +blocked');
  if (!channel) {
    throw new ApiError(404, 'Channel not found');
  }

  res.status(200).json({
    success: true,
    message: 'Channel profile fetched',
    channel: serializePrivateChannel(channel),
  });
});

export const createChannel = asyncHandler(async (req, res) => {
  const { handle, displayName, bio, avatar, banner } = req.body;

  if (!handle || !displayName) {
    throw new ApiError(400, 'handle and displayName are required');
  }

  assertString(handle, 'handle');
  assertString(displayName, 'displayName');
  ['bio', 'avatar', 'banner'].forEach((field) => {
    if (hasOwn(req.body, field)) assertString(req.body[field], field);
  });

  validateHandle(handle);
  validateDisplayName(displayName);
  if (hasOwn(req.body, 'bio')) validateBio(bio);

  const existingHandle = await Channel.findOne({ handle });
  if (existingHandle) {
    throw new ApiError(409, 'Handle already taken');
  }

  const existingChannel = await Channel.findOne({ userId: req.user.id });
  if (existingChannel) {
    throw new ApiError(409, 'Channel already exists for this account');
  }

  const channel = await Channel.create({
    userId: req.user.id,
    handle,
    displayName,
    bio,
    avatar,
    banner,
    role: req.user.role || 'user',
  });

  logger.info('Channel created', {
    requestId: req.requestId,
    userId: req.user.id,
    handle: channel.handle,
  });

  const createdChannel = await Channel.findById(channel._id).select('+subscribers +blocked');

  res.status(201).json({
    success: true,
    message: 'Channel created successfully',
    channel: serializePrivateChannel(createdChannel),
  });
});

export const updateChannel = asyncHandler(async (req, res) => {
  const updates = {};

  UPDATE_FIELDS.forEach((field) => {
    if (hasOwn(req.body, field)) {
      validateUpdateField(field, req.body[field]);
      updates[field] = req.body[field];
    }
  });

  const channel =
    Object.keys(updates).length === 0
      ? await Channel.findOne({ userId: req.user.id }).select('+subscribers +blocked')
      : await Channel.findOneAndUpdate(
          { userId: req.user.id },
          { $set: updates },
          { new: true, runValidators: true }
        ).select('+subscribers +blocked');

  if (!channel) {
    throw new ApiError(404, 'Channel not found');
  }

  logger.info('Channel updated', { requestId: req.requestId, userId: req.user.id });

  res.status(200).json({
    success: true,
    message: 'Channel updated successfully',
    channel: serializePrivateChannel(channel),
  });
});

export const subscribe = asyncHandler(async (req, res) => {
  const { userId: targetId } = req.params;
  assertObjectId(targetId);

  const actorId = req.user.id;
  if (targetId === actorId) {
    throw new ApiError(400, 'Cannot subscribe to your own channel');
  }

  const target = await Channel.findOne({ userId: targetId }).select('+subscribers');
  if (!target) {
    throw new ApiError(404, 'Channel not found');
  }

  const alreadySubscribed = target.subscribers.some((subscriberId) => subscriberId.toString() === actorId);
  const actorObjectId = new mongoose.Types.ObjectId(actorId);

  // This read-then-update toggle is eventually consistent under concurrent requests;
  // a production path would use a transaction or stricter conditional update.
  if (alreadySubscribed) {
    await Channel.updateOne(
      { userId: targetId },
      { $pull: { subscribers: actorObjectId }, $inc: { subscriberCount: -1 } }
    );
  } else {
    await Channel.updateOne(
      { userId: targetId },
      { $addToSet: { subscribers: actorObjectId }, $inc: { subscriberCount: 1 } }
    );
  }

  const updatedTarget = await Channel.findOne({ userId: targetId }).select('subscriberCount');
  const subscribed = !alreadySubscribed;

  logger.info('Subscription toggled', {
    requestId: req.requestId,
    actorId,
    targetId,
    subscribed,
  });

  res.status(200).json({
    success: true,
    message: subscribed ? 'Subscribed successfully' : 'Unsubscribed successfully',
    subscribed,
    subscriberCount: updatedTarget.subscriberCount,
  });
});

export const blockUser = asyncHandler(async (req, res) => {
  const { userId: targetUserId } = req.params;
  assertObjectId(targetUserId);

  const actorId = req.user.id;
  if (targetUserId === actorId) {
    throw new ApiError(400, 'Cannot block yourself');
  }

  const actorChannel = await Channel.findOne({ userId: actorId }).select('+blocked');
  if (!actorChannel) {
    throw new ApiError(404, 'Your channel not found');
  }

  const alreadyBlocked = actorChannel.blocked.some((blockedId) => blockedId.toString() === targetUserId);
  const targetObjectId = new mongoose.Types.ObjectId(targetUserId);

  // This toggle intentionally avoids transactions for portfolio simplicity;
  // concurrent requests can briefly observe stale state until Mongo applies the update.
  if (alreadyBlocked) {
    await Channel.updateOne({ userId: actorId }, { $pull: { blocked: targetObjectId } });
  } else {
    await Channel.updateOne({ userId: actorId }, { $addToSet: { blocked: targetObjectId } });
  }

  const blocked = !alreadyBlocked;
  const logMeta = { requestId: req.requestId, userId: actorId, targetUserId };
  if (blocked) {
    logger.warn('User blocked', logMeta);
  } else {
    logger.info('User unblocked', logMeta);
  }

  res.status(200).json({
    success: true,
    message: blocked ? 'User blocked successfully' : 'User unblocked successfully',
    blocked,
    targetUserId,
  });
});

export const getSubscriptions = asyncHandler(async (req, res) => {
  const actor = await Channel.findOne({ userId: req.user.id });
  if (!actor) {
    throw new ApiError(404, 'Channel not found');
  }

  const page = parsePositiveInteger(req.query.page, 1);
  const limit = parsePositiveInteger(req.query.limit, 20);
  const skip = (page - 1) * limit;

  const [subscriptions, total] = await Promise.all([
    Channel.find({ subscribers: req.user.id })
      .select('-subscribers -blocked')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Channel.countDocuments({ subscribers: req.user.id }),
  ]);

  res.status(200).json({
    success: true,
    message: 'Subscriptions fetched',
    subscriptions: subscriptions.map(serializeSubscription),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

export const getChannelByHandle = asyncHandler(async (req, res) => {
  const { handle } = req.params;
  assertString(handle, 'handle');

  const normalizedHandle = normalizeHandle(handle);
  validateHandle(normalizedHandle);

  const channel = await Channel.findByHandle(normalizedHandle).select('-subscribers -blocked');
  if (!channel) {
    throw new ApiError(404, 'Channel not found');
  }

  res.status(200).json({
    success: true,
    message: 'Channel profile fetched',
    channel: serializePublicChannel(channel),
  });
});
