'use strict';

const mongoose = require('mongoose');

/** 逐题作答流水：练习与考试都写，用于统计趋势/正确率。 */
const answerRecordSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },
    questionId: { type: String, required: true },
    // 冗余题型/板块，统计时免 join 题库
    type: { type: String, required: true, enum: ['single', 'multiple'] },
    topic: { type: String, required: true },
    selected: { type: [String], default: [] },
    correct: { type: Boolean, required: true },
    mode: { type: String, required: true, enum: ['practice', 'exam'] },
    examId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: false },
  }
);

answerRecordSchema.index({ clientId: 1, createdAt: -1 });
answerRecordSchema.index({ clientId: 1, questionId: 1 });

module.exports = mongoose.model('AnswerRecord', answerRecordSchema);
