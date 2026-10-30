const mongoose = require('mongoose');

const PlacementOfficerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  designation: { type: String, default: 'Placement Officer', trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  alternatePhone: { type: String, default: '', trim: true },
  linkedin: { type: String, default: '', trim: true }
}, { _id: false });

const SecondaryCoordinatorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  designation: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true }
}, { _id: true });

const AcademicYearSchema = new mongoose.Schema({
  year: { type: String, required: true, trim: true }, // e.g., '2024-2025', '2025-2026'
  startDate: { type: Date },
  endDate: { type: Date },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const CollegeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  university: {
    type: String,
    default: '',
    trim: true
  },
  placementOfficer: {
    type: PlacementOfficerSchema,
    required: true
  },
  secondaryCoordinators: {
    type: [SecondaryCoordinatorSchema],
    default: []
  },
  logoUrl: {
    type: String,
    default: ''
  },
  bannerUrl: {
    type: String,
    default: ''
  },
  // MOU document compressed base64 storage
  mouDocument: {
    data: { type: String, default: '' }, // zlib compressed buffer as base64 string
    fileName: { type: String, default: '' },
    fileType: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    uploadedAt: { type: Date }
  },
  mouDriveLink: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Archived'],
    default: 'Active',
    index: true
  },
  academicYears: {
    type: [AcademicYearSchema],
    default: []
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

// Compound index for unique college per company
CollegeSchema.index({ companyId: 1, name: 1 }, { unique: true });

function _collegeProxyTarget() {}

function _getCollegeModel() {
  const { getTenantConnection } = require('../db');
  const { getModelsForConnection } = require('../utilities/modelLoader');
  const { tenantLocalStorage } = require('../utilities/tenantContext');
  const store = tenantLocalStorage ? tenantLocalStorage.getStore() : null;
  const dbName = store && store.dbName ? store.dbName : 'hrdb';
  const connection = getTenantConnection(dbName);
  const models = getModelsForConnection(connection);
  return models['College'];
}

module.exports = new Proxy(_collegeProxyTarget, {
  get(target, prop) {
    if (prop === 'name') return 'College';
    if (prop === 'schema') return CollegeSchema;
    if (prop === '_name') return 'College';
    if (prop === '_schema') return CollegeSchema;
    const actualModel = _getCollegeModel();
    if (!actualModel) throw new Error('Model College not found for current tenant');
    if (typeof actualModel[prop] === 'function') return actualModel[prop].bind(actualModel);
    return actualModel[prop];
  },
  construct(target, args) {
    const actualModel = _getCollegeModel();
    if (!actualModel) throw new Error('Model College not found for current tenant');
    return new actualModel(...args);
  }
});

