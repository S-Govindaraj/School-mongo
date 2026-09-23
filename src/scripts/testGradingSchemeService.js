/**
 * Framework-free regression tests for gradingSchemeService — this file DOES
 * touch the DB (Setting.findOne), so instead of a live MongoDB we stub the
 * Setting model's export via require.cache injection, the same technique
 * testStudent360Service.js uses to stub a repository module.
 *
 * Usage: node src/scripts/testGradingSchemeService.js
 */
const assert = require('assert');

const settingModelPath = require.resolve('../models/Setting');
const stub = {};
require.cache[settingModelPath] = { id: settingModelPath, filename: settingModelPath, loaded: true, exports: stub };

const { getThresholds } = require('../services/gradingSchemeService');
const { GRADE_THRESHOLDS } = require('../services/resultCalculationService');

const SCHOOL_ID = 'school-1';

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
    process.exitCode = 1;
  }
};

// Setting.findOne(...).lean() — stub returns a thenable-free object with .lean()
const stubFindOne = (value) => {
  stub.findOne = () => ({ lean: async () => value });
};

async function run() {
  console.log('\n--- gradingSchemeService regression tests ---\n');

  await test('no setting found returns the default GRADE_THRESHOLDS', async () => {
    stubFindOne(null);
    const result = await getThresholds(SCHOOL_ID);
    assert.strictEqual(result, GRADE_THRESHOLDS);
  });

  await test('a valid JSON array setting returns the parsed and sorted (descending by min) array', async () => {
    stubFindOne({ value: JSON.stringify([{ min: 0, grade: 'F' }, { min: 90, grade: 'A+' }, { min: 50, grade: 'C' }]) });
    const result = await getThresholds(SCHOOL_ID);
    assert.deepStrictEqual(result, [
      { min: 90, grade: 'A+' },
      { min: 50, grade: 'C' },
      { min: 0, grade: 'F' },
    ]);
  });

  await test('a malformed JSON string falls back to GRADE_THRESHOLDS', async () => {
    stubFindOne({ value: '{not valid json' });
    const result = await getThresholds(SCHOOL_ID);
    assert.strictEqual(result, GRADE_THRESHOLDS);
  });

  await test('an array missing the required shape (no min/grade) falls back to GRADE_THRESHOLDS', async () => {
    stubFindOne({ value: JSON.stringify([{ label: 'A+' }, { label: 'F' }]) });
    const result = await getThresholds(SCHOOL_ID);
    assert.strictEqual(result, GRADE_THRESHOLDS);
  });

  await test('an empty array falls back to GRADE_THRESHOLDS', async () => {
    stubFindOne({ value: JSON.stringify([]) });
    const result = await getThresholds(SCHOOL_ID);
    assert.strictEqual(result, GRADE_THRESHOLDS);
  });

  await test('a setting document with an empty/falsy value falls back to GRADE_THRESHOLDS', async () => {
    stubFindOne({ value: '' });
    const result = await getThresholds(SCHOOL_ID);
    assert.strictEqual(result, GRADE_THRESHOLDS);
  });

  console.log(`\n${passed} test(s) passed.\n`);
}

run();
