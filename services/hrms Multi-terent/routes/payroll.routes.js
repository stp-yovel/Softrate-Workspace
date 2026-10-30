const express = require("express");
const router = express.Router();
const moment = require("moment");
const axios = require("axios");
const verifyTenant = require("../middleware/tenant.middleware");
const { generatePayslipPDF } = require("../utilities/payslipGenerator");
const CompanyModelExport = require("../models/CompanyModel");
const { getMasterConnection } = require("../db");

/**
 * Helper to fetch logo buffer if image URL is provided
 */
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    if (url.startsWith("data:image")) {
      const parts = url.split(";base64,");
      return Buffer.from(parts[1], "base64");
    }
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 4000 });
    return Buffer.from(response.data);
  } catch (err) {
    console.warn("Failed to fetch image buffer for payslip:", err.message);
    return null;
  }
}

/**
 * Calculates YTD months count from start of Financial Year (April 1) or onboarding date up to target month
 */
function calculateYtdMonths(onboardingDate, targetMonthStr) {
  const targetDate = moment(targetMonthStr, "MMMM YYYY");
  if (!targetDate.isValid()) return 1;

  // Fiscal year start (April 1st of current FY)
  const fyStartYear = targetDate.month() >= 3 ? targetDate.year() : targetDate.year() - 1;
  let startDate = moment([fyStartYear, 3, 1]); // April 1st

  if (onboardingDate) {
    const onboard = moment(onboardingDate);
    if (onboard.isValid() && onboard.isAfter(startDate)) {
      startDate = onboard.startOf("month");
    }
  }

  const months = targetDate.diff(startDate, "months") + 1;
  return Math.max(1, Math.min(months, 12));
}

/**
 * @route   GET /api/payroll/payslip-pdf/:employeeId
 * @desc    Generate and download payslip PDF
 */
router.get("/payslip-pdf/:employeeId", verifyTenant, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const monthQuery = req.query.month || moment().subtract(1, "month").format("MMMM YYYY");
    const { Employee, Intern, User, EmployeeLeave, EmployeeAttendance, Holiday } = req.models;

    // 1. Fetch Employee Profile
    let employee = null;
    let query = { companyId: req.tenant.companyId };
    if (employeeId.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = employeeId;
    } else {
      query.$or = [{ EmployeeId: { $regex: new RegExp(`^${employeeId}$`, "i") } }, { internid: { $regex: new RegExp(`^${employeeId}$`, "i") } }, { email: { $regex: new RegExp(`^${employeeId}$`, "i") } }];
    }

    employee = await Employee.findOne(query).lean();
    if (!employee) {
      employee = await Intern.findOne(query).lean();
    }
    if (!employee) {
      employee = await User.findOne(query).populate("roleId").lean();
    }

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee record not found" });
    }

    // 2. Fetch Master Company info
    const masterDb = getMasterConnection();
    const MasterCompany = masterDb.models.Company || masterDb.model("Company", CompanyModelExport.schema);
    let company = await MasterCompany.findById(req.tenant.companyId).lean();
    if (!company) {
      company = {
        name: req.tenant.name || "Softrate Technologies Private Limited - India",
        settings: {
          communication: {
            companyAddress: "Softrate Tech Park, No: 60A, Velleeswaran Kovil Street, Mangadu, Chennai - 600122",
          },
        },
      };
    }

    // Company address resolution
    const resolvedAddress = company.settings?.communication?.companyAddress || company.offerLetterSettings?.address || company.address || "Softrate Tech Park, No: 60A, Velleeswaran Kovil Street, Mangadu, Chennai - 600122";

    // Logo resolution
    const logoUrl = company.settings?.communication?.emailLogoUrl || company.logo || null;
    const logoBuffer = await fetchImageBuffer(logoUrl);

    // 3. Compute Attendance & Paid Days for target month
    const targetMoment = moment(monthQuery, "MMMM YYYY");
    const daysInMonth = targetMoment.isValid() ? targetMoment.daysInMonth() : 30;

    // Derive LOP / Paid Days
    let lopDays = 0;
    try {
      if (EmployeeLeave) {
        const leaves = await EmployeeLeave.find({
          employeeId: employee.EmployeeId || employee._id,
          companyId: req.tenant.companyId,
          status: "approved",
        }).lean();

        // Count unpaid leaves in that month
        for (const l of leaves) {
          if (l.leaveType?.toLowerCase().includes("unpaid") || l.leaveType?.toLowerCase().includes("lop")) {
            const lStart = moment(l.startDate);
            if (lStart.format("MMMM YYYY") === monthQuery) {
              lopDays += l.numberOfDays || 1;
            }
          }
        }
      }
    } catch (_) {}

    const paidDays = Math.max(0, daysInMonth - lopDays);

    // 4. Derive Salary Structure & Components
    const payroll = employee.payroll || {};
    let basicSalary = Number(payroll.basicSalary) || 0;
    let hra = Number(payroll.hra) || 0;
    let totalAllowances = Number(payroll.allowances) || 0;
    let totalDeductions = Number(payroll.deductions) || 0;

    // Fallback if basic salary not explicitly defined
    if (basicSalary === 0) {
      basicSalary = 10000;
      hra = 5000;
      totalAllowances = 7800;
      totalDeductions = 1400;
    }

    // Proportional breakdown of allowances
    let specialAllowance = Math.round(totalAllowances * 0.35) || 2700;
    let conveyanceAllowance = Math.round(totalAllowances * 0.5) || 4000;
    let statutoryBonus = Math.max(0, totalAllowances - specialAllowance - conveyanceAllowance) || 1100;

    // Company PF setting
    const pfSettings = company.settings?.payrollSettings || {};
    const pfPercentage = pfSettings.pfPercentage || 12;
    const epfEmployee = pfSettings.pfCalculateEmployee ? Math.round((basicSalary * pfPercentage) / 100) : 1200;
    const profTax = 200;

    // LOP deduction calculation
    let lopDeduction = 0;
    if (lopDays > 0) {
      const perDaySalary = basicSalary / (pfSettings.lopSettings?.workingDaysEmployee || 26);
      lopDeduction = Math.round(perDaySalary * lopDays);
    }

    const ytdMonths = calculateYtdMonths(employee.onboardingDate, monthQuery);

    const salaryBreakdown = {
      basicPay: basicSalary,
      hra: hra,
      specialAllowance: specialAllowance,
      conveyanceAllowance: conveyanceAllowance,
      statutoryBonus: statutoryBonus,
      incentive: 0,
      epfEmployee: epfEmployee,
      profTax: profTax,
      lopDeduction: lopDeduction,
      ytdMonths: ytdMonths,
    };

    // 5. Generate PDF Document
    const pdfBuffer = await generatePayslipPDF({
      company: {
        name: company.name || "Softrate Technologies Private Limited - India",
        address: resolvedAddress,
        logoBuffer: logoBuffer,
      },
      employee: {
        EmployeeId: employee.EmployeeId || employee.internid || employee.employeeId || "020012",
        fullName: employee.fullName || "Employee",
        workLocation: employee.workLocation || "Tidel Park, Chennai",
        department: employee.department || "Engineering & Technology",
        designation: employee.designation || employee.role || "Software Engineer",
        onboardingDate: employee.onboardingDate,
        panNumber: employee.panNumber || "",
        uanNumber: employee.uanNumber || "",
        esiNumber: employee.esiNumber || "",
        bankDetails: employee.bankDetails || {},
      },
      monthString: monthQuery,
      salaryBreakdown,
      attendance: {
        paidDays,
        lopDays,
      },
    });

    const safeMonth = monthQuery.replace(/[^a-zA-Z0-9]/g, "_");
    const safeEmpId = (employee.EmployeeId || employee._id).toString().replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Payslip_${safeEmpId}_${safeMonth}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Payslip PDF Generation Error:", err);
    res.status(500).json({ success: false, message: "Failed to generate payslip PDF", error: err.message });
  }
});

module.exports = router;
