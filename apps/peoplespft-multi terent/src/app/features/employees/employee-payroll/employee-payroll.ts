import { AlertService } from '../../../shared/services/alert';
import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { UserCircleIcon, FingerAccessIcon, CalendarCheckOut01Icon, LicenseDraftIcon, Money03Icon, Download02Icon } from '@hugeicons/core-free-icons';
import { EmployeeSidebar } from '../employee-sidebar/employee-sidebar';
import { InternSidebar } from '../../interns/intern-sidebar/intern-sidebar';
import { ApiService } from '../../../services/api.service';

@Component({
  selector: 'app-employee-payroll',
  standalone: true,
  imports: [CommonModule, HugeiconsIconComponent, RouterModule, EmployeeSidebar, InternSidebar],
  templateUrl: './employee-payroll.html',
  styleUrl: './employee-payroll.css'
})
export class EmployeePayroll implements OnInit {
  private alertService = inject(AlertService);

  private apiService = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);

  goBack() {
    this.location.back();
  }

  readonly UserCircleIcon = UserCircleIcon;
  readonly FingerAccessIcon = FingerAccessIcon;
  readonly CalendarCheckOut01Icon = CalendarCheckOut01Icon;
  readonly LicenseDraftIcon = LicenseDraftIcon;
  readonly Money03Icon = Money03Icon;
  readonly Download02Icon = Download02Icon;

  navigateTo(path: string[]) {
    this.router.navigate(path).then(() => {
      const mainContent = document.querySelector('.main-content');
      if (mainContent) mainContent.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  
  employeeId = signal<string>('');
  employee = signal<any>(null);
  isLoading = signal(true);
  isSelfPortal = signal<boolean>(false);
  
  // Dynamic payroll stats from employee DB record
  get grossSalary(): string {
    const p = this.employee()?.payroll;
    if (!p) return '₹ 45,000';
    const gross = (Number(p.basicSalary) || 0) + (Number(p.hra) || 0) + (Number(p.allowances) || 0);
    return `₹ ${gross > 0 ? gross.toLocaleString('en-IN') : '45,000'}`;
  }

  get netSalary(): string {
    const p = this.employee()?.payroll;
    if (!p) return '₹ 41,200';
    const gross = (Number(p.basicSalary) || 0) + (Number(p.hra) || 0) + (Number(p.allowances) || 0);
    const net = gross - (Number(p.deductions) || 0);
    return `₹ ${net > 0 ? net.toLocaleString('en-IN') : '41,200'}`;
  }

  get deductions(): string {
    const p = this.employee()?.payroll;
    const ded = Number(p?.deductions) || 0;
    return `₹ ${ded > 0 ? ded.toLocaleString('en-IN') : '3,800'}`;
  }

  // Dynamic payslip history based on onboarding date
  get salaryHistory(): { month: string; status: string; amount: string; date: string }[] {
    const emp = this.employee();
    const now = new Date();
    const results: { month: string; status: string; amount: string; date: string }[] = [];

    // Start from current month so payslip for the 31st/end of current month is immediately visible & downloadable
    let checkDate = new Date(now.getFullYear(), now.getMonth(), 1);

    // Determine earliest payslip month from onboardingDate
    let onboardDate: Date | null = null;
    if (emp?.onboardingDate) {
      try { onboardDate = new Date(emp.onboardingDate); } catch (_) {}
    }

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const maxSlips = 12;

    for (let i = 0; i < maxSlips; i++) {
      if (onboardDate) {
        const onboardStart = new Date(onboardDate.getFullYear(), onboardDate.getMonth(), 1);
        if (checkDate < onboardStart && results.length > 0) break;
      }

      const monthLabel = `${monthNames[checkDate.getMonth()]} ${checkDate.getFullYear()}`;
      // Issue date on 31st / last day of the month
      const lastDayOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0);
      const issueDateStr = `${String(lastDayOfMonth.getDate()).padStart(2,'0')} ${monthNames[checkDate.getMonth()].substring(0,3)} ${checkDate.getFullYear()}`;

      results.push({ month: monthLabel, status: 'Paid', amount: this.netSalary, date: issueDateStr });
      checkDate = new Date(checkDate.getFullYear(), checkDate.getMonth() - 1, 1);
    }

    return results;
  }

  isIntern = signal<boolean>(false);

  ngOnInit() {
    const url = this.router.url.toLowerCase();
    const isSelf = url.includes('/employee/payroll') || url.includes('/intern/payroll') || url.includes('payroll');
    this.isSelfPortal.set(isSelf);

    const isInternUrl = url.includes('/intern') || url.includes('intern');
    this.isIntern.set(isInternUrl);

    let id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      const data = localStorage.getItem('user_data');
      if (data) {
        const parsedData = JSON.parse(data);
        id = isInternUrl
          ? (parsedData.internid || parsedData._id || parsedData.id || '')
          : (parsedData.EmployeeId || parsedData._id || parsedData.id || '');
      }
    }
    this.employeeId.set(id || '');
    this.fetchEmployee();
  }

  fetchEmployee() {
    this.isLoading.set(true);
    const fetchObs = this.isIntern() 
      ? this.apiService.getInternById(this.employeeId())
      : this.apiService.getEmployeeById(this.employeeId());

    fetchObs.subscribe({
      next: (data) => {
        this.employee.set(data);
        this.isLoading.set(false);
      },
      error: (err: any) => {
        console.error('Failed to fetch employee', err);
        this.isLoading.set(false);
      }
    });
  }

  downloadPayslip(month: string) {
    this.alertService.show(`Preparing payslip for ${month}...`);
    this.apiService.downloadPayslipPdf(this.employeeId(), month).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeMonth = month.replace(/\s+/g, '_');
        a.download = `Payslip_${this.employee()?.fullName || this.employeeId()}_${safeMonth}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.alertService.show(`Payslip for ${month} downloaded successfully!`);
      },
      error: (err) => {
        console.error('Failed to download payslip PDF', err);
        this.alertService.show('Failed to download payslip. Please try again.');
      }
    });
  }
}
