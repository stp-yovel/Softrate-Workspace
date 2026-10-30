const mongoose = require("mongoose");

const RemarkSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    addedBy: { type: String, default: "" },
    addedByName: { type: String, default: "HR Team" },
    role: { type: String, default: "HR" },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const ShortlistSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    candidateType: {
      type: String,
      enum: ["Employee", "Intern", "Walkin"],
      default: "Employee",
      index: true
    },

    // Candidate Profile Snapshot
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: "" },
    role: { type: String, default: "" },
    department: { type: String, default: "" },
    qualification: { type: String, default: "" },
    college: { type: String, default: "" },
    location: { type: String, default: "" },
    experienceYears: { type: String, default: "" },
    isExperienced: { type: Boolean, default: false },
    currentCtc: { type: Number, default: 0 },
    expectedCtc: { type: Number, default: 0 },
    noticePeriod: { type: Number, default: 0 },
    linkedin: { type: String, default: "" },
    projectLinks: { type: [String], default: [] },
    resumeUrl: { type: String, default: "" },

    // Interview Schedule Details
    meetDate: { type: Date, required: true, index: true },
    meetTime: { type: String, default: "11:00 AM" },
    meetLink: { type: String, default: "" },
    meetNotes: { type: String, default: "" },
    emailSubject: { type: String, default: "" },
    emailBody: { type: String, default: "" },

    // Interview Reschedule Tracking
    rescheduleToken: { type: String, sparse: true, index: true },
    rescheduleCount: { type: Number, default: 0 },
    rescheduleRequest: {
      status: {
        type: String,
        enum: ["none", "pending", "accepted", "declined"],
        default: "none",
        index: true
      },
      requestedDate: { type: Date },
      requestedTime: { type: String, default: "" },
      reason: { type: String, default: "" },
      requestedAt: { type: Date },
      respondedBy: { type: String, default: "" },
      respondedAt: { type: Date },
      adminNotes: { type: String, default: "" }
    },

    // Remarks & Interviewer Notes History
    remarks: { type: [RemarkSchema], default: [] },

    // Structured Interview Assessment & Evaluation Details
    interviewEvaluation: {
      longTermGoal: { type: String, default: "" },
      expectationsFromCompany: { type: String, default: "" },
      reasonNotSelectedPreviously: { type: String, default: "" },
      redFlags: { type: String, default: "" },
      greenFlags: { type: String, default: "" },
      bond: { type: String, enum: ["Agree", "Disagree", ""], default: "" },
      startupIdeasNext2Years: { type: String, enum: ["Yes", "No", "Not at all", ""], default: "" },
      locationAndRelocation: { type: String, default: "" },
      evaluatedBy: { type: String, default: "" },
      evaluatedByName: { type: String, default: "" },
      evaluatedAt: { type: Date }
    },

    // Pipeline State
    status: {
      type: String,
      enum: ["scheduled", "interviewed", "onboarded", "rejected", "cancelled"],
      default: "scheduled",
      index: true
    },

    // Metadata
    scheduledBy: {
      userId: { type: String, default: "" },
      name: { type: String, default: "" }
    },
    scheduledAt: { type: Date, default: Date.now },
    interviewedAt: { type: Date },
    onboardedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, default: "" }
  },
  {
    timestamps: true
  }
);

// Indexes for high performance querying
ShortlistSchema.index({ companyId: 1, status: 1, meetDate: -1 });
ShortlistSchema.index({ companyId: 1, email: 1 });

module.exports = {
  name: "Shortlist",
  schema: ShortlistSchema
};
