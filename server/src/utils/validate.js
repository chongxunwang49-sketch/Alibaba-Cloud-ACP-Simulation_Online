'use strict';

const { badRequest } = require('./errors');

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

function parsePositiveInt(raw, fallback, field) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) throw badRequest(`${field} 必须是正整数`);
  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value) || value < 1) throw badRequest(`${field} 必须是正整数`);
  return value;
}

function parsePagination(query = {}) {
  const page = parsePositiveInt(query.page, 1, 'page');
  const pageSize = parsePositiveInt(query.pageSize, PAGE_SIZE_DEFAULT, 'pageSize');
  if (pageSize > PAGE_SIZE_MAX) throw badRequest(`pageSize 不能超过 ${PAGE_SIZE_MAX}`);
  if (page > 100000) throw badRequest('page 过大');
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function parseCount(raw, fallback, max, field = 'count') {
  const value = parsePositiveInt(raw, fallback, field);
  if (value > max) throw badRequest(`${field} 不能超过 ${max}`);
  return value;
}

function assertEnum(value, allowed, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (!allowed.includes(value)) {
    throw badRequest(`${field} 只能是：${allowed.join(' / ')}`);
  }
  return value;
}

function parseBoolean(raw, field = 'mastered') {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  const text = String(raw).toLowerCase();
  if (['true', '1', 'yes'].includes(text)) return true;
  if (['false', '0', 'no'].includes(text)) return false;
  throw badRequest(`${field} 必须是布尔值`);
}

function parseKeyword(raw, maxLength = 60) {
  if (raw === undefined || raw === null) return '';
  const text = String(raw).trim();
  if (!text) return '';
  if (text.length > maxLength) throw badRequest(`keyword 不能超过 ${maxLength} 个字符`);
  return text;
}

/**
 * 把作答字母规范化：大写、去重、按字母序。
 * @param {unknown} input
 * @param {number} optionCount 选项数量，决定合法字母上界
 * @param {string} field 报错字段名
 */
function normalizeLetters(input, optionCount, field = 'selected') {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw badRequest(`${field} 必须是字母数组，如 ["A","C"]`);
  if (optionCount < 1) throw badRequest('题目选项数量异常');
  const maxLetter = String.fromCharCode(65 + optionCount - 1);
  const letters = new Set();
  for (const item of input) {
    if (typeof item !== 'string' || !/^[A-Za-z]$/.test(item)) {
      throw badRequest(`${field} 包含非法选项：${String(item)}`);
    }
    const letter = item.toUpperCase();
    if (letter < 'A' || letter > maxLetter) {
      throw badRequest(`${field} 中 ${letter} 超出该题选项范围 A-${maxLetter}`);
    }
    letters.add(letter);
  }
  return [...letters].sort();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  parsePagination,
  parseCount,
  assertEnum,
  parseBoolean,
  parseKeyword,
  normalizeLetters,
  escapeRegExp,
};
