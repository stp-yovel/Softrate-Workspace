const mongoose = require('mongoose');

const videoRuleSchema = new mongoose.Schema({
  deadlineDays: { type: Number, default: 3 }, // E.g., must watch within 3 days of unlock
  unlockType: { type: String, enum: ['sequential', 'immediate'], default: 'sequential' },
  minWatchPercentage: { type: Number, default: 90 }, // 90% required to complete
  preventSeekForward: { type: Boolean, default: true },
}, { _id: false });

const videoItemSchema = new mongoose.Schema({
  order: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  youtubeUrl: { type: String, required: true },
  youtubeVideoId: { type: String, required: true },
  durationSeconds: { type: Number, default: 0 },
  rules: { type: videoRuleSchema, default: () => ({}) },
}, { timestamps: true });

const LMSCourseSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  title: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'Onboarding' },
  bannerUrl: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },
  videos: [videoItemSchema],
}, { timestamps: true });

function _lmsCourseProxyTarget() {}

function _getLMSCourseModel() {
  const { getTenantConnection } = require('../db');
  const { getModelsForConnection } = require('../utilities/modelLoader');
  const { tenantLocalStorage } = require('../utilities/tenantContext');
  const store = tenantLocalStorage ? tenantLocalStorage.getStore() : null;
  const dbName = store && store.dbName ? store.dbName : 'hrdb';
  const connection = getTenantConnection(dbName);
  const models = getModelsForConnection(connection);
  return models['LMSCourse'];
}

module.exports = new Proxy(_lmsCourseProxyTarget, {
  get(target, prop) {
    if (prop === 'name') return 'LMSCourse';
    if (prop === 'schema') return LMSCourseSchema;
    if (prop === '_name') return 'LMSCourse';
    if (prop === '_schema') return LMSCourseSchema;
    const actualModel = _getLMSCourseModel();
    if (!actualModel) throw new Error('Model LMSCourse not found for current tenant');
    if (typeof actualModel[prop] === 'function') return actualModel[prop].bind(actualModel);
    return actualModel[prop];
  },
  construct(target, args) {
    const actualModel = _getLMSCourseModel();
    if (!actualModel) throw new Error('Model LMSCourse not found for current tenant');
    return new actualModel(...args);
  },
});
