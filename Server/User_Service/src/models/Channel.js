import mongoose from 'mongoose';

const channelSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'User ID is required'],
      unique: true,
    },
    handle: {
      type: String,
      required: [true, 'Handle is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [/^[a-z0-9_]+$/, 'Handle may only contain lowercase letters, numbers, and underscores'],
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    bio: {
      type: String,
      default: '',
      maxlength: 500,
    },
    avatar: {
      type: String,
      default: '',
    },
    banner: {
      type: String,
      default: '',
    },
    subscriberCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    subscribers: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
      select: false,
    },
    blocked: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
      select: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['user', 'creator', 'admin'],
      default: 'user',
    },
  },
  { timestamps: true }
);

channelSchema.index({ subscriberCount: -1 });

channelSchema.statics.findByHandle = function (handle) {
  const normalizedHandle = String(handle).toLowerCase().replace(/^@/, '');
  return this.findOne({ handle: normalizedHandle });
};

const Channel = mongoose.model('Channel', channelSchema);

export default Channel;
