'use strict';

const mongoose = require('mongoose');
const { QUESTION_TYPES, TOPIC_KEYS } = require('../constants/topics');

/**
 * 题库（只读）。_id 直接使用题库 id（q001…），
 * 避免额外 id 字段与 Mongoose 的 id 虚拟属性冲突。
 */
const questionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    type: { type: String, required: true, enum: QUESTION_TYPES },
    topic: { type: String, required: true, enum: TOPIC_KEYS },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    answer: { type: [String], required: true },
    explanation: { type: String, default: '' },
    source: { type: String, default: '' },
    sourceUrl: { type: String, default: '' },
  },
  { versionKey: false, timestamps: false }
);

questionSchema.index({ topic: 1, type: 1 });

module.exports = mongoose.model('Question', questionSchema);
