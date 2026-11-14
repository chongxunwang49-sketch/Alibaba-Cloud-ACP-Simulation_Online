'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // clientId（uuid v4）
    nickname: { type: String, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports = mongoose.model('User', userSchema);
