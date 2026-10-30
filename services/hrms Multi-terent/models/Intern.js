const mongoose = require("mongoose");

const InternSchema = new mongoose.Schema({
  
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  internid: {
    type: String,
    unique: true,
    sparse: true
  },
  fullName: { type: String, required: true },
  college: { type: String, default: "" },
  year: { type: String, default: "1st Year" },
  department: { type: String, default: "" },
  role: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, default: "" },
  contact: { type: String, required: true },
  emergencyContact: { type: String, default: "" },
  onboardingDate: { type: String, default: ""},
  endDate: { type: String, default: ""},
  linkedin: { type: String, required: true },
  internshipType: { type: String, default: ""},
  applicationType: { type: String, enum: ["Internship", "Job", "Walk-in Drive", "Walkin"], default: "Internship" },
  deviceId: { type: String, default: null },
  projectLinks: { type: [String], default: [] },
  isRemote: { type: Boolean, default: false },
  webAccess: { type: Boolean, default: false },
  remoteAccess: { type: Boolean, default: false },
  dob: { type: Date, default: null },
  gender: { type: String, default: "" },
  location: { type: String, default: "" },
  maritalStatus: { type: String, default: "" },
  degree: { type: String, default: "" },
  countryCode: { type: String, default: "+91" },
  jobId: { type: String, default: "" },
  assessmentAnswers: { type: mongoose.Schema.Types.Mixed, default: {} },
  isWalkinDrive: { type: Boolean, default: false },
  walkinDriveId: { type: mongoose.Schema.Types.ObjectId, ref: "WalkinDrive", default: null },
  isSeasonalInternship: { type: Boolean, default: false },
  seasonalDriveId: { type: mongoose.Schema.Types.ObjectId, ref: "WalkinDrive", default: null },
  seasonalTitle: { type: String, default: "" },

  // Campus Student & Experience Profile (Full-Time Attributes for Interns)
  campusStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "CampusStudent", default: null },
  driveId: { type: mongoose.Schema.Types.ObjectId, ref: "CampusDrive", default: null },
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", default: null },
  isExperienced: { type: Boolean, default: false },
  experienceStatus: { type: String, enum: ["fresher", "experienced"], default: "fresher" },
  passingYear: { type: String, default: "" },
  cgpaOrPercentage: { type: String, default: "" },
  previousOrg: { type: String, default: "" },
  designation: { type: String, default: "" },
  experienceYears: { type: String, default: "" },
  currentCtc: { type: mongoose.Schema.Types.Mixed, default: "" },
  expectedCtc: { type: mongoose.Schema.Types.Mixed, default: "" },
  noticePeriod: { type: mongoose.Schema.Types.Mixed, default: "" },
  joiningDate: { type: String, default: "" },

  // Manager Assignment Logic
  assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  managerApprovalStatus: { type: String, enum: ["initial", "pending", "approved", "rejected", "shortlist", "shortlisted", "maybe"], default: "initial" },
  managerRemarks: { type: String, default: "" },
  isHr: { type: Boolean, default: false },

  status: { type: String, default: "initial" },
  leaveCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  terminationReason: { type: String, default: null },
  terminationDate: { type: Date, default: null },
  payroll: {
    basicSalary: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 }
  },
  profilePhoto: {
    data: { type: Buffer, select: false },
    contentType: { type: String },
    size: { type: Number },
    updatedAt: { type: Date }
  }
});

// Indexes — used by login (exact match on email/internid) and aggregation filters
InternSchema.index({ email: 1 });
InternSchema.index({ companyId: 1, status: 1 });
InternSchema.index({ assignedManager: 1, companyId: 1 });

// Helper function to capitalize the first letter of each word
function capitalizeWords(str) {
  if (!str) return str;
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

InternSchema.pre('save', function () {
  if (this.isModified('fullName') && this.fullName) {
    this.fullName = capitalizeWords(this.fullName);
  }
  if (this.isModified('college') && this.college) {
    this.college = capitalizeWords(this.college);
  }
  if (this.isModified('role') && this.role) {
    this.role = capitalizeWords(this.role);
  }
});

// Multi-Tenant Proxy Wrapper
// Target MUST be a function for the construct trap to work with new Model()
function _InternProxyTarget() {}

function _getInternModel() {
  const { getTenantConnection } = require('../db');
  const { getModelsForConnection } = require('../utilities/modelLoader');
  const { tenantLocalStorage } = require('../utilities/tenantContext');
  const store = tenantLocalStorage ? tenantLocalStorage.getStore() : null;
  const dbName = store && store.dbName ? store.dbName : 'hrdb';
  const connection = getTenantConnection(dbName);
  const models = getModelsForConnection(connection);
  return models["Intern"];
}

module.exports = new Proxy(_InternProxyTarget, {
  get(target, prop) {
    if (prop === 'name') return "Intern";
    if (prop === 'schema') return InternSchema;
    if (prop === '_name') return "Intern";
    if (prop === '_schema') return InternSchema;
    const actualModel = _getInternModel();
    if (!actualModel) throw new Error("Model Intern not found for current tenant");
    if (typeof actualModel[prop] === 'function') return actualModel[prop].bind(actualModel);
    return actualModel[prop];
  },
  construct(target, args) {
    const actualModel = _getInternModel();
    if (!actualModel) throw new Error("Model Intern not found for current tenant");
    return new actualModel(...args);
  }
});
