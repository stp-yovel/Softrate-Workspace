const PDFDocument = require('pdfkit');
const moment = require('moment');

/**
 * Converts a number into Indian Rupee words
 * e.g., 51600 => "Fifty One Thousand Six Hundred Rupees Only."
 */
function numberToWordsINR(amount) {
  if (amount === 0 || isNaN(amount)) return "Zero Rupees Only.";

  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertTwoDigits(num) {
    if (num < 20) return units[num];
    const ten = Math.floor(num / 10);
    const unit = num % 10;
    return tens[ten] + (unit ? " " + units[unit] : "");
  }

  function convertThreeDigits(num) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    let res = "";
    if (hundred) res += units[hundred] + " Hundred";
    if (remainder) res += (res ? " " : "") + convertTwoDigits(remainder);
    return res;
  }

  let num = Math.floor(Math.abs(amount));
  let words = "";

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;

  if (crore) words += convertThreeDigits(crore) + " Crore ";
  if (lakh) words += convertThreeDigits(lakh) + " Lakh ";
  if (thousand) words += convertThreeDigits(thousand) + " Thousand ";
  if (remainder) words += convertThreeDigits(remainder);

  words = words.trim();
  if (!words) words = "Zero";

  return words + " Rupees Only.";
}

/**
 * Formats a number with comma separators and 2 decimals (e.g. 10,000.00)
 */
function formatCurrency(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Generates a Payslip PDF Buffer strictly in 1 single page matching the exact layout
 * @param {Object} data - Contains company, employee, salary, and attendance data
 * @returns {Promise<Buffer>} - Resolves with PDF buffer
 */
function generatePayslipPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4', // 595.28 x 841.89
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        autoFirstPage: true
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const {
        company = {},
        employee = {},
        monthString = moment().format('MMMM YYYY'),
        salaryBreakdown = {},
        attendance = {}
      } = data;

      // ── Coordinate & Bounds ────────────────────────────────────────────────
      const PAGE_X = 20;
      const PAGE_Y = 20;
      const PAGE_W = 555.28;
      const PAGE_H = 788; // Ends at 808
      const MID_X = PAGE_X + (PAGE_W / 2); // 297.64

      // Draw Main Outer Box Border
      doc.lineWidth(0.75).strokeColor('#222222');
      doc.rect(PAGE_X, PAGE_Y, PAGE_W, PAGE_H).stroke();

      // ── 1. HEADER SECTION (y = 20 to y = 80) ──────────────────────────────
      let curY = PAGE_Y;

      // Logo on left
      const logoBuffer = company.logoBuffer || null;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, PAGE_X + 16, curY + 9, { fit: [72, 40], align: 'center', valign: 'center' });
        } catch (e) {
          console.warn("Could not render logo in payslip:", e.message);
        }
      }

      // Company Name & Address
      const companyName = company.name || 'Softrate Technologies Private Limited - India';
      const companyAddress = company.address || company.settings?.communication?.companyAddress ||
        'Softrate Tech Park, No: 60A, Velleeswaran Kovil Street, Mangadu, Chennai - 600122';

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
      doc.text(companyName, PAGE_X + 80, curY + 9, { width: PAGE_W - 160, align: 'center', lineBreak: false });

      doc.font('Helvetica').fontSize(8.5).fillColor('#222222');
      doc.text(companyAddress, PAGE_X + 60, curY + 24, { width: PAGE_W - 120, align: 'center', lineBreak: false });

      // Payslip Month Title
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000');
      doc.text(`Payslip for the month of ${monthString}`, PAGE_X + 60, curY + 38, { width: PAGE_W - 120, align: 'center', lineBreak: false });

      curY = 76;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // ── 2. EMPLOYEE & BANK DETAILS GRID (y = 76 to y = 170) ───────────────
      const empGridH = 94;
      const col1X = PAGE_X + 8;
      const col2X = MID_X + 8;
      const rowStep = 13;
      let gridY = curY + 6;

      const dateOfJoining = employee.onboardingDate
        ? moment(employee.onboardingDate).format('DD/MM/YYYY')
        : '-';

      const employeeId = employee.EmployeeId || employee.internid || employee.employeeId || '-';
      const employeeName = employee.fullName || '-';
      const location = employee.workLocation || 'Tidel Park, Chennai';
      const department = employee.department || 'Engineering & Technology';
      const position = employee.designation || employee.role || 'Software Engineer';

      const panNumber = employee.panNumber || '-';
      const uanNumber = employee.uanNumber || '-';
      const esiNumber = employee.esiNumber || '-';
      const bankAcNo = employee.bankDetails?.accountNumber || '-';
      const bankName = employee.bankDetails?.bankName || '-';
      const paidDays = attendance.paidDays !== undefined ? attendance.paidDays : 31;
      const lopDays = attendance.lopDays !== undefined ? attendance.lopDays : 0;

      // Column 1 (Left)
      const col1Rows = [
        ['Employee Code', employeeId],
        ['Employee Name', employeeName],
        ['Location', location],
        ['Department', department],
        ['Position', position],
        ['Date of Joining', dateOfJoining],
      ];

      // Column 2 (Right)
      const col2Rows = [
        ['PAN Number', panNumber],
        ['UAN Number', uanNumber],
        ['ESI Number', esiNumber],
        ['Bank A/C No', bankAcNo],
        ['Bank Name', bankName],
        ['Paid Days', paidDays.toString()],
        ['LOP Days', lopDays.toString()],
      ];

      // Middle vertical line
      doc.moveTo(MID_X, curY).lineTo(MID_X, curY + empGridH).stroke();

      // Render Col 1
      for (let i = 0; i < col1Rows.length; i++) {
        const [label, val] = col1Rows[i];
        doc.font('Helvetica').fontSize(7.5).fillColor('#000000');
        doc.text(label, col1X, gridY + (i * rowStep), { width: 85, lineBreak: false });
        doc.text(':', col1X + 85, gridY + (i * rowStep), { lineBreak: false });
        doc.font('Helvetica-Bold').text(val, col1X + 93, gridY + (i * rowStep), { width: 175, lineBreak: false });
      }

      // Render Col 2
      for (let i = 0; i < col2Rows.length; i++) {
        const [label, val] = col2Rows[i];
        doc.font('Helvetica').fontSize(7.5).fillColor('#000000');
        doc.text(label, col2X, gridY + (i * rowStep), { width: 80, lineBreak: false });
        doc.text(':', col2X + 80, gridY + (i * rowStep), { lineBreak: false });
        doc.font('Helvetica-Bold').text(val, col2X + 88, gridY + (i * rowStep), { width: 175, lineBreak: false });
      }

      curY = 170;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // ── 3. EARNINGS & DEDUCTIONS TABLE (y = 170 to y = 320) ───────────────
      const tblHeaderH = 15;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');

      // Table Header Row
      doc.text('Earnings', PAGE_X + 6, curY + 3, { lineBreak: false });
      doc.text('Monthly', MID_X - 100, curY + 3, { width: 45, align: 'right', lineBreak: false });
      doc.text('YTD', MID_X - 45, curY + 3, { width: 40, align: 'right', lineBreak: false });

      doc.text('Deductions', MID_X + 6, curY + 3, { lineBreak: false });
      doc.text('Monthly', PAGE_X + PAGE_W - 100, curY + 3, { width: 45, align: 'right', lineBreak: false });
      doc.text('YTD', PAGE_X + PAGE_W - 45, curY + 3, { width: 40, align: 'right', lineBreak: false });

      curY += tblHeaderH;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // Salary Values
      const basic = salaryBreakdown.basicPay || 10000;
      const hra = salaryBreakdown.hra || 5000;
      const special = salaryBreakdown.specialAllowance || 2700;
      const conveyance = salaryBreakdown.conveyanceAllowance || 4000;
      const statutoryBonus = salaryBreakdown.statutoryBonus || 1100;
      const incentive = salaryBreakdown.incentive || 0;

      const ytdMultiplier = salaryBreakdown.ytdMonths || 1;

      const earningsList = [
        { label: 'Basic Pay', monthly: basic, ytd: basic * ytdMultiplier },
        { label: 'House Rent Allowance', monthly: hra, ytd: hra * ytdMultiplier },
        { label: 'Special Allowance', monthly: special, ytd: special * ytdMultiplier },
        { label: 'Conveyance Allowance', monthly: conveyance, ytd: conveyance * ytdMultiplier },
        { label: 'Advance Statutory Bonus', monthly: statutoryBonus, ytd: statutoryBonus * ytdMultiplier },
        { label: 'Incentive', monthly: incentive, ytd: incentive * ytdMultiplier },
      ];

      const epfEmployee = salaryBreakdown.epfEmployee !== undefined ? salaryBreakdown.epfEmployee : 1200;
      const profTax = salaryBreakdown.profTax !== undefined ? salaryBreakdown.profTax : 200;
      const lop = salaryBreakdown.lopDeduction !== undefined ? salaryBreakdown.lopDeduction : 0;

      const deductionsList = [
        { label: 'Employee EPF', monthly: epfEmployee, ytd: epfEmployee * ytdMultiplier },
        { label: 'Professional Tax', monthly: profTax, ytd: profTax * ytdMultiplier },
        { label: 'LOP', monthly: lop, ytd: lop * ytdMultiplier },
      ];

      const grossEarningsMonthly = earningsList.reduce((sum, item) => sum + item.monthly, 0);
      const grossEarningsYTD = earningsList.reduce((sum, item) => sum + item.ytd, 0);

      const grossDeductionsMonthly = deductionsList.reduce((sum, item) => sum + item.monthly, 0);
      const grossDeductionsYTD = deductionsList.reduce((sum, item) => sum + item.ytd, 0);

      const netPay = grossEarningsMonthly - grossDeductionsMonthly;

      const tableBodyH = 72; // 6 rows * 11.5 + padding

      // Vertical split
      doc.moveTo(MID_X, curY).lineTo(MID_X, curY + tableBodyH).stroke();

      // Render Earnings lines
      let rY = curY + 3;
      doc.font('Helvetica').fontSize(7.5).fillColor('#000000');
      for (let i = 0; i < earningsList.length; i++) {
        const item = earningsList[i];
        doc.text(item.label, PAGE_X + 6, rY + (i * 11.5), { lineBreak: false });
        doc.text(formatCurrency(item.monthly), MID_X - 100, rY + (i * 11.5), { width: 45, align: 'right', lineBreak: false });
        doc.text(formatCurrency(item.ytd), MID_X - 45, rY + (i * 11.5), { width: 40, align: 'right', lineBreak: false });
      }

      // Render Deductions lines
      for (let i = 0; i < deductionsList.length; i++) {
        const item = deductionsList[i];
        doc.text(item.label, MID_X + 6, rY + (i * 11.5), { lineBreak: false });
        doc.text(formatCurrency(item.monthly), PAGE_X + PAGE_W - 100, rY + (i * 11.5), { width: 45, align: 'right', lineBreak: false });
        doc.text(formatCurrency(item.ytd), PAGE_X + PAGE_W - 45, rY + (i * 11.5), { width: 40, align: 'right', lineBreak: false });
      }

      curY += tableBodyH;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // Gross Line
      const grossH = 15;
      doc.moveTo(MID_X, curY).lineTo(MID_X, curY + grossH).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');

      doc.text('Gross Earnings', PAGE_X + 6, curY + 3, { lineBreak: false });
      doc.text(formatCurrency(grossEarningsMonthly), MID_X - 100, curY + 3, { width: 45, align: 'right', lineBreak: false });

      doc.text('Gross Deductions', MID_X + 6, curY + 3, { lineBreak: false });
      doc.text(formatCurrency(grossDeductionsMonthly), PAGE_X + PAGE_W - 100, curY + 3, { width: 45, align: 'right', lineBreak: false });

      curY += grossH;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // Net Pay Row
      const netPayH = 16;
      doc.moveTo(MID_X, curY).lineTo(MID_X, curY + netPayH).stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');
      doc.text('Net Pay', MID_X + 6, curY + 4, { lineBreak: false });
      doc.text(formatCurrency(netPay), PAGE_X + PAGE_W - 100, curY + 4, { width: 45, align: 'right', lineBreak: false });

      curY += netPayH;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // Net Pay in Words
      const netWords = numberToWordsINR(netPay);
      doc.font('Helvetica').fontSize(8).fillColor('#000000');
      doc.text('Net Pay in Words :', PAGE_X + 6, curY + 3, { lineBreak: false });
      doc.font('Helvetica-Bold').text(netWords, PAGE_X + 90, curY + 3, { lineBreak: false });

      curY += 15;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // ── 4. EMPLOYER CONTRIBUTIONS & OTHER INFO (y = 303 to y = 358) ────────
      const empContribH = 55;
      doc.moveTo(MID_X, curY).lineTo(MID_X, curY + empContribH).stroke();

      // Left: Employer Contributions
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
      doc.text('Employer Contributions', PAGE_X + 6, curY + 3, { lineBreak: false });
      doc.text('Monthly', MID_X - 100, curY + 3, { width: 45, align: 'right', lineBreak: false });
      doc.text('YTD', MID_X - 45, curY + 3, { width: 40, align: 'right', lineBreak: false });

      const pfEmployer = epfEmployee;
      const contribRows = [
        ['ESI EMPLOYER', '0.00', '0.00'],
        ['PF Employer', formatCurrency(pfEmployer), formatCurrency(pfEmployer * ytdMultiplier)],
        ['NPS employer - 80CCD2', '0.00', '0.00'],
      ];

      doc.font('Helvetica').fontSize(7.5);
      for (let i = 0; i < contribRows.length; i++) {
        const [lbl, mVal, yVal] = contribRows[i];
        doc.text(lbl, PAGE_X + 6, curY + 16 + (i * 12), { lineBreak: false });
        doc.text(mVal, MID_X - 100, curY + 16 + (i * 12), { width: 45, align: 'right', lineBreak: false });
        doc.text(yVal, MID_X - 45, curY + 16 + (i * 12), { width: 40, align: 'right', lineBreak: false });
      }

      // Right: Other Info
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Other Info.', MID_X + 6, curY + 3, { lineBreak: false });

      const paymentDate = moment(monthString, 'MMMM YYYY').endOf('month').format('DD/MM/YYYY');
      doc.font('Helvetica').fontSize(7.5);
      doc.text('Mode of Payment', MID_X + 6, curY + 19, { lineBreak: false });
      doc.text('Payment Date', MID_X + 6, curY + 33, { lineBreak: false });

      doc.text('Bank-Transfer', MID_X + 90, curY + 19, { lineBreak: false });
      doc.text(paymentDate, MID_X + 90, curY + 33, { lineBreak: false });

      curY += empContribH;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // ── 5. INCOME TAX CALCULATION FOR FINANCIAL YEAR ───────────────────────
      const fyStartYear = moment(monthString, 'MMMM YYYY').month() >= 3
        ? moment(monthString, 'MMMM YYYY').year()
        : moment(monthString, 'MMMM YYYY').year() - 1;
      const fyEndYear = fyStartYear + 1;

      // Header Bar
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');
      doc.text(`Income Tax Calculation for the Financial Year ${fyStartYear} - ${fyEndYear}`, PAGE_X, curY + 3, {
        width: PAGE_W,
        align: 'center',
        lineBreak: false
      });

      curY += 15;
      doc.moveTo(PAGE_X, curY).lineTo(PAGE_X + PAGE_W, curY).stroke();

      // Tax Table Area (from curY to PAGE_Y + PAGE_H = 808)
      const taxSplitX = PAGE_X + 300;
      const taxBottomY = PAGE_Y + PAGE_H; // exactly 808
      const taxBodyH = taxBottomY - curY;

      doc.moveTo(taxSplitX, curY).lineTo(taxSplitX, taxBottomY).stroke();

      // Left Header: Income Tax Calculation
      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.text('Income Tax Calculation', PAGE_X + 6, curY + 3, { width: taxSplitX - PAGE_X - 12, align: 'center', lineBreak: false });
      doc.moveTo(PAGE_X, curY + 13).lineTo(taxSplitX, curY + 13).stroke();

      // Sub-headers
      doc.font('Helvetica-Bold').fontSize(6.5);
      doc.text('Particulars', PAGE_X + 6, curY + 15, { lineBreak: false });
      doc.text('Income upto\nPrevious', PAGE_X + 110, curY + 13, { width: 45, align: 'right' });
      doc.text('Projected\nIncome', PAGE_X + 158, curY + 13, { width: 45, align: 'right' });
      doc.text('Current\nMonth Income', PAGE_X + 206, curY + 13, { width: 45, align: 'right' });
      doc.text('Annual\nIncome', PAGE_X + 254, curY + 13, { width: 40, align: 'right' });

      doc.moveTo(PAGE_X, curY + 29).lineTo(taxSplitX, curY + 29).stroke();

      // Salary component calculations
      const annualBasic = basic * 12;
      const annualHra = hra * 12;
      const annualSpecial = (special + conveyance) * 12;
      const annualBonus = statutoryBonus * 12;
      const annualGross = annualBasic + annualHra + annualSpecial + annualBonus;

      const prevMonths = Math.max(0, ytdMultiplier - 1);
      const projMonths = Math.max(0, 12 - ytdMultiplier);

      const taxRows = [
        { label: 'Basic Pay', prev: basic * prevMonths, proj: basic * projMonths, cur: basic, ann: annualBasic },
        { label: 'House Rent Allowance', prev: hra * prevMonths, proj: hra * projMonths, cur: hra, ann: annualHra },
        { label: 'Special + Conveyance Allowance', prev: (special + conveyance) * prevMonths, proj: (special + conveyance) * projMonths, cur: special + conveyance, ann: annualSpecial },
        { label: 'Advance Statutory Bonus', prev: statutoryBonus * prevMonths, proj: statutoryBonus * projMonths, cur: statutoryBonus, ann: annualBonus },
      ];

      let tY = curY + 32;
      doc.font('Helvetica').fontSize(6.5);
      for (const row of taxRows) {
        doc.text(row.label, PAGE_X + 6, tY, { width: 105, lineBreak: false });
        doc.text(formatCurrency(row.prev), PAGE_X + 110, tY, { width: 45, align: 'right', lineBreak: false });
        doc.text(formatCurrency(row.proj), PAGE_X + 158, tY, { width: 45, align: 'right', lineBreak: false });
        doc.text(formatCurrency(row.cur), PAGE_X + 206, tY, { width: 45, align: 'right', lineBreak: false });
        doc.text(formatCurrency(row.ann), PAGE_X + 254, tY, { width: 40, align: 'right', lineBreak: false });
        tY += 12;
      }

      // Summary lines
      tY += 3;
      const taxSummaries = [
        ['Salary for the Year', formatCurrency(annualGross), true],
        ['Net Taxable Income', formatCurrency(annualGross), true],
        ['Less: Deduction u/s 10', '0.00', false],
        ['Less : Standard Deduction', '50000.00', false],
        ['Less : Prof. Tax recovered by Current', '0.00', false],
        ['Employer Gross Taxable Income', formatCurrency(Math.max(0, annualGross - 50000)), false],
        ['LESS: Other Income/Loss', '0.00', false],
        ['Total Income', formatCurrency(Math.max(0, annualGross - 50000)), false],
        ['Section 80 Deduction (Chapter VI A)', '0.00', false],
        ['Income Chargeable to Tax (Rounded off)', formatCurrency(Math.max(0, annualGross - 50000)), true],
      ];

      for (const [lbl, val, isBold] of taxSummaries) {
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5);
        doc.text(lbl, PAGE_X + 6, tY, { width: 175, lineBreak: false });
        doc.text(val, PAGE_X + 214, tY, { width: 80, align: 'right', lineBreak: false });
        tY += 11.5;
      }

      // Income Tax Deduction Column (Sub-header)
      tY += 4;
      doc.font('Helvetica-Bold').fontSize(6.5);
      doc.text('Income Tax Deduction', PAGE_X + 6, tY, { width: 180, align: 'center', lineBreak: false });
      tY += 12;

      const taxDeductionItems = [
        ['IncomeTax Payable', '0.0000'],
        ['Net Income Tax Payable', '0.0000'],
        ['EDUCATION CESS', '0.0000'],
        ['Surcharge', '0.0000'],
        ['Total Income Tax & Surcharge Payable', '0.0000'],
        ['Income Tax & S/C Recovered Till Previous Month', '0.0000'],
        ['Marginal Tax To Be Recovered For This Month', '0.0000'],
        ['Avg. Monthly Income Tax & S/C to be recovered', '0.0000'],
      ];

      doc.font('Helvetica').fontSize(6);
      for (const [lbl, val] of taxDeductionItems) {
        doc.text(lbl, PAGE_X + 6, tY, { width: 180, lineBreak: false });
        doc.text(val, PAGE_X + 214, tY, { width: 80, align: 'right', lineBreak: false });
        tY += 10.5;
      }

      // Right Column Blocks: Exemption U/S 10, Perquisites, Investments, HRA
      let rTaxY = curY;
      const rightColW = PAGE_X + PAGE_W - taxSplitX;

      // Block 1: Details of Exemption U/S 10
      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.text('Details of Exemption U/S 10', taxSplitX + 6, rTaxY + 3, { width: rightColW - 12, align: 'center', lineBreak: false });
      rTaxY += 13;
      doc.moveTo(taxSplitX, rTaxY).lineTo(PAGE_X + PAGE_W, rTaxY).stroke();

      doc.font('Helvetica').fontSize(6.5);
      doc.text('HRA Exemption', taxSplitX + 6, rTaxY + 6, { lineBreak: false });
      doc.text(formatCurrency(annualHra), PAGE_X + PAGE_W - 85, rTaxY + 6, { width: 75, align: 'right', lineBreak: false });

      rTaxY = curY + 65;
      doc.moveTo(taxSplitX, rTaxY).lineTo(PAGE_X + PAGE_W, rTaxY).stroke();

      // Block 2: Details of Perquisites
      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.text('Details of Perquisites', taxSplitX + 6, rTaxY + 3, { width: rightColW - 12, align: 'center', lineBreak: false });
      rTaxY += 14;
      doc.moveTo(taxSplitX, rTaxY).lineTo(PAGE_X + PAGE_W, rTaxY).stroke();

      rTaxY = curY + 140;
      doc.moveTo(taxSplitX, rTaxY).lineTo(PAGE_X + PAGE_W, rTaxY).stroke();

      // Block 3: Investment Details
      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.text('Investment Details', taxSplitX + 6, rTaxY + 3, { width: rightColW - 12, align: 'center', lineBreak: false });
      rTaxY += 14;
      doc.moveTo(taxSplitX, rTaxY).lineTo(PAGE_X + PAGE_W, rTaxY).stroke();

      rTaxY = curY + 280;
      doc.moveTo(taxSplitX, rTaxY).lineTo(PAGE_X + PAGE_W, rTaxY).stroke();

      // Block 4: HRA Details
      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.text('HRA Details', taxSplitX + 6, rTaxY + 3, { width: rightColW - 12, align: 'center', lineBreak: false });
      rTaxY += 14;
      doc.moveTo(taxSplitX, rTaxY).lineTo(PAGE_X + PAGE_W, rTaxY).stroke();

      doc.font('Helvetica').fontSize(6.5);
      doc.text('Start Date', taxSplitX + 6, rTaxY + 6, { lineBreak: false });
      doc.text(`01/04/${fyStartYear}`, PAGE_X + PAGE_W - 65, rTaxY + 6, { width: 55, align: 'right', lineBreak: false });
      doc.text('End Date', taxSplitX + 6, rTaxY + 19, { lineBreak: false });
      doc.text(`31/03/${fyEndYear}`, PAGE_X + PAGE_W - 65, rTaxY + 19, { width: 55, align: 'right', lineBreak: false });

      // ── 6. FOOTER STATEMENT (Strictly on Page 1) ───────────────────────────
      doc.font('Helvetica').fontSize(7.5).fillColor('#333333');
      doc.text(
        'This is a computer generated statement and does not require signature',
        PAGE_X,
        PAGE_Y + PAGE_H + 12,
        { width: PAGE_W, align: 'center', lineBreak: false }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generatePayslipPDF,
  numberToWordsINR,
  formatCurrency
};
