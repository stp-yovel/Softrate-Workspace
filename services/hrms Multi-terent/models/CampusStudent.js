const mongoose = require('mongoose');

const StudentRoundHistorySchema = new mongoose.Schema({
  roundId: { type: String, required: true },
  roundName: { type: String, required: true },
  roundOrder: { type: Number, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Cleared', 'Rejected', 'On Hold', 'Absent'],
    default: 'Pending'
  },
  score: { type: Number, default: 0 },
  remarks: { type: String, default: '' },
  evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  evaluatedAt: { type: Date }
}, { _id: true });

const CampusStudentSchema = new mongoose.Schema({
  driveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CampusDrive',
    required: true,
    index: true
  },
  collegeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true,
    index: true
  },
  rollNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  dob: {
    type: Date
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    default: '',
    trim: true // e.g., 'Computer Science & Engineering'
  },
  degree: {
    type: String,
    default: '',
    trim: true // e.g., 'B.Tech'
  },
  cgpa: {
    type: String,
    default: '',
    trim: true // e.g., '8.5'
  },
  resumeUrl: {
    type: String,
    default: ''
  },
  appliedRoles: {
    type: [String],
    default: []
  },
  selectedRole: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  collegeName: {
    type: String,
    default: ''
  },
  linkedin: {
    type: String,
    default: ''
  },
  passingYear: {
    type: String,
    default: ''
  },
  resumeBase64: {
    type: String,
    default: ''
  },
  assessmentAnswers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  projectLinks: {
    type: [String],
    default: []
  },
  candidateDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isFormSubmitted: {
    type: Boolean,
    default: false
  },
  formSubmittedAt: {
    type: Date
  },
  currentRoundOrder: {
    type: Number,
    default: 1
  },
  currentRoundName: {
    type: String,
    default: 'Project Shortlisting from Resume'
  },
  roundHistory: {
    type: [StudentRoundHistorySchema],
    default: []
  },
  overallStatus: {
    type: String,
    enum: ['Active', 'Selected', 'Rejected', 'Withdrawn'],
    default: 'Active',
    index: true
  },
  isOnboarded: {
    type: Boolean,
    default: false,
    index: true
  },
  onboardedAt: {
    type: Date
  },
  linkedCandidateId: {
    type: mongoose.Schema.Types.ObjectId
  },
  internId: {
    type: String,
    trim: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  }
}, { timestamps: true });

CampusStudentSchema.index({ companyId: 1, driveId: 1, rollNumber: 1 }, { unique: true });
CampusStudentSchema.index({ companyId: 1, driveId: 1, email: 1 });

function _campusStudentProxyTarget() {}

function _getCampusStudentModel() {
  const { getTenantConnection } = require('../db');
  const { getModelsForConnection } = require('../utilities/modelLoader');
  const { tenantLocalStorage } = require('../utilities/tenantContext');
  const store = tenantLocalStorage ? tenantLocalStorage.getStore() : null;
  const dbName = store && store.dbName ? store.dbName : 'hrdb';
  const connection = getTenantConnection(dbName);
  const models = getModelsForConnection(connection);
  return models['CampusStudent'];
}

module.exports = new Proxy(_campusStudentProxyTarget, {
  get(target, prop) {
    if (prop === 'name') return 'CampusStudent';
    if (prop === 'schema') return CampusStudentSchema;
    if (prop === '_name') return 'CampusStudent';
    if (prop === '_schema') return CampusStudentSchema;
    const actualModel = _getCampusStudentModel();
    if (!actualModel) throw new Error('Model CampusStudent not found for current tenant');
    if (typeof actualModel[prop] === 'function') return actualModel[prop].bind(actualModel);
    return actualModel[prop];
  },
  construct(target, args) {
    const actualModel = _getCampusStudentModel();
    if (!actualModel) throw new Error('Model CampusStudent not found for current tenant');
    return new actualModel(...args);
  }
});

