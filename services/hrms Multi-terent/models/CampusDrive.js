const mongoose = require('mongoose');

const InterviewRoundSchema = new mongoose.Schema({
  roundId: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  order: { type: Number, required: true }, // 1, 2, 3...
  isActive: { type: Boolean, default: true },
  description: { type: String, default: '' },
  isHireProLinked: { type: Boolean, default: false },
  hireProExamMapping: [{
    role: { type: String, required: true, trim: true },
    examId: { type: String, required: true, trim: true },
    examTitle: { type: String, default: '', trim: true }
  }]
}, { _id: false });

const CampusDriveSchema = new mongoose.Schema({
  collegeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true
  },
  academicYear: {
    type: String,
    required: true,
    trim: true,
    index: true // e.g. '2024-2025', '2025-2026'
  },
  title: {
    type: String,
    required: true,
    trim: true // e.g. 'Software Developer Campus Drive 2025'
  },
  roles: {
    type: [String],
    default: [],
    required: true // e.g. ['Software Engineer', 'Frontend Developer']
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  rounds: {
    type: [InterviewRoundSchema],
    default: [
      { roundId: 'r_resume', name: 'Project Shortlisting from Resume', order: 1, isActive: true },
      { roundId: 'r_aptitude', name: 'Aptitude Test', order: 2, isActive: true },
      { roundId: 'r_gd', name: 'Group Discussion', order: 3, isActive: true },
      { roundId: 'r_interview', name: 'One-to-One Interview', order: 4, isActive: true },
      { roundId: 'r_task', name: 'Technical Task / Test', order: 5, isActive: true }
    ]
  },
  status: {
    type: String,
    enum: ['Draft', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Scheduled',
    index: true
  },
  description: {
    type: String,
    default: ''
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

CampusDriveSchema.index({ companyId: 1, collegeId: 1, academicYear: 1 });

function _campusDriveProxyTarget() {}

function _getCampusDriveModel() {
  const { getTenantConnection } = require('../db');
  const { getModelsForConnection } = require('../utilities/modelLoader');
  const { tenantLocalStorage } = require('../utilities/tenantContext');
  const store = tenantLocalStorage ? tenantLocalStorage.getStore() : null;
  const dbName = store && store.dbName ? store.dbName : 'hrdb';
  const connection = getTenantConnection(dbName);
  const models = getModelsForConnection(connection);
  return models['CampusDrive'];
}

module.exports = new Proxy(_campusDriveProxyTarget, {
  get(target, prop) {
    if (prop === 'name') return 'CampusDrive';
    if (prop === 'schema') return CampusDriveSchema;
    if (prop === '_name') return 'CampusDrive';
    if (prop === '_schema') return CampusDriveSchema;
    const actualModel = _getCampusDriveModel();
    if (!actualModel) throw new Error('Model CampusDrive not found for current tenant');
    if (typeof actualModel[prop] === 'function') return actualModel[prop].bind(actualModel);
    return actualModel[prop];
  },
  construct(target, args) {
    const actualModel = _getCampusDriveModel();
    if (!actualModel) throw new Error('Model CampusDrive not found for current tenant');
    return new actualModel(...args);
  }
});

