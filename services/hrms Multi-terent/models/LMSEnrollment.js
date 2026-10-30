const mongoose = require('mongoose');

const videoProgressSchema = new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, required: true },
  order: { type: Number, required: true },
  title: { type: String, default: '' },
  isUnlocked: { type: Boolean, default: false },
  unlockedAt: { type: Date, default: null },
  deadline: { type: Date, default: null }, // Date by which this video must be watched
  isCompleted: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  watchTimeSeconds: { type: Number, default: 0 },
  watchPercentage: { type: Number, default: 0 },
  isOverdue: { type: Boolean, default: false },
}, { _id: false });

const LMSEnrollmentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'LMSCourse', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userType: { type: String, enum: ['employee', 'intern', 'user'], default: 'employee' },
  userEmail: { type: String, default: '' },
  userName: { type: String, default: '' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['enrolled', 'in-progress', 'completed', 'overdue'],
    default: 'enrolled',
  },
  progressPercentage: { type: Number, default: 0 },
  videosProgress: [videoProgressSchema],
}, { timestamps: true });

function _lmsEnrollmentProxyTarget() {}

function _getLMSEnrollmentModel() {
  const { getTenantConnection } = require('../db');
  const { getModelsForConnection } = require('../utilities/modelLoader');
  const { tenantLocalStorage } = require('../utilities/tenantContext');
  const store = tenantLocalStorage ? tenantLocalStorage.getStore() : null;
  const dbName = store && store.dbName ? store.dbName : 'hrdb';
  const connection = getTenantConnection(dbName);
  const models = getModelsForConnection(connection);
  return models['LMSEnrollment'];
}

module.exports = new Proxy(_lmsEnrollmentProxyTarget, {
  get(target, prop) {
    if (prop === 'name') return 'LMSEnrollment';
    if (prop === 'schema') return LMSEnrollmentSchema;
    if (prop === '_name') return 'LMSEnrollment';
    if (prop === '_schema') return LMSEnrollmentSchema;
    const actualModel = _getLMSEnrollmentModel();
    if (!actualModel) throw new Error('Model LMSEnrollment not found for current tenant');
    if (typeof actualModel[prop] === 'function') return actualModel[prop].bind(actualModel);
    return actualModel[prop];
  },
  construct(target, args) {
    const actualModel = _getLMSEnrollmentModel();
    if (!actualModel) throw new Error('Model LMSEnrollment not found for current tenant');
    return new actualModel(...args);
  },
});
