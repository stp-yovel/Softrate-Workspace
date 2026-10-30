const mongoose = require('mongoose');

const LMSNoteSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    courseId: {
      type: String,
      required: true,
      index: true,
    },
    videoId: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['slice', 'normal'],
      default: 'normal',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    slice: {
      startTime: { type: Number, default: 0 },
      endTime: { type: Number, default: 0 },
      videoOrder: { type: Number, default: 1 },
      videoTitle: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

// Compound index for fast queries by company, user, and course
LMSNoteSchema.index({ companyId: 1, userId: 1, courseId: 1, createdAt: -1 });

function _lmsNoteProxyTarget() {}

function _getLMSNoteModel() {
  const { getTenantConnection } = require('../db');
  const { getModelsForConnection } = require('../utilities/modelLoader');
  const { tenantLocalStorage } = require('../utilities/tenantContext');
  const store = tenantLocalStorage ? tenantLocalStorage.getStore() : null;
  const dbName = store && store.dbName ? store.dbName : 'hrdb';
  const connection = getTenantConnection(dbName);
  const models = getModelsForConnection(connection);
  return models['LMSNote'];
}

module.exports = new Proxy(_lmsNoteProxyTarget, {
  get(target, prop) {
    if (prop === 'name') return 'LMSNote';
    if (prop === 'schema') return LMSNoteSchema;
    if (prop === '_name') return 'LMSNote';
    if (prop === '_schema') return LMSNoteSchema;
    const actualModel = _getLMSNoteModel();
    if (!actualModel) throw new Error('Model LMSNote not found for current tenant');
    if (typeof actualModel[prop] === 'function') return actualModel[prop].bind(actualModel);
    return actualModel[prop];
  },
  construct(target, args) {
    const actualModel = _getLMSNoteModel();
    if (!actualModel) throw new Error('Model LMSNote not found for current tenant');
    return new actualModel(...args);
  },
});

