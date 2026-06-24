import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// bcrypt silently truncates input past 72 bytes, and JWTs routinely exceed
// that, so we hash with SHA-256 first to compress to a fixed 64-char digest
// that preserves the full token's entropy before bcrypt-hashing it for storage.
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');


const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      unique: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never return password by default
    },
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    avatar: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['user', 'creator', 'admin'],
      default: 'user',
    },
  },
  { timestamps: true }
);

// Hash password before save, only if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.setRefreshToken = async function (rawRefreshToken) {
  const salt = await bcrypt.genSalt(10);
  this.refreshTokenHash = await bcrypt.hash(sha256(rawRefreshToken), salt);
};

userSchema.methods.compareRefreshToken = async function (candidateToken) {
  if (!this.refreshTokenHash) return false;
  return bcrypt.compare(sha256(candidateToken), this.refreshTokenHash);
};

const User = mongoose.model('User', userSchema);

export default User;
