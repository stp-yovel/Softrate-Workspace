import { AlertService } from '../../shared/services/alert';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { 
  PlusSignIcon,
  Delete02Icon,
  Location01Icon,
  MapsLocation02Icon,
  Settings01Icon,
  CheckmarkCircle01Icon,
  Coordinate01Icon,
  MailReceive01Icon,
  UserCircleIcon,
  UserGroupIcon,
  PaymentSuccess02Icon,
  Search01Icon,
  TimeQuarterIcon,
  Calendar01Icon
} from '@hugeicons/core-free-icons';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { TourService } from '../../services/tour.service';
import { WalkinDrivesComponent } from '../walkin-drives/walkin-drives.component';

@Component({
  selector: 'app-app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, HugeiconsIconComponent, WalkinDrivesComponent],
  templateUrl: './app-settings.html',
  styleUrl: './app-settings.css'
})
export class AppSettings implements OnInit {
  private alertService = inject(AlertService);

  private apiService = inject(ApiService);
  private tourService = inject(TourService);

  readonly PlusSignIcon = PlusSignIcon;
  readonly Delete02Icon = Delete02Icon;
  readonly Location01Icon = Location01Icon;
  readonly MapsLocation02Icon = MapsLocation02Icon;
  readonly Settings01Icon = Settings01Icon;
  readonly CheckmarkCircle01Icon = CheckmarkCircle01Icon;
  readonly Coordinate01Icon = Coordinate01Icon;
  readonly MailReceive01Icon = MailReceive01Icon;
  readonly UserCircleIcon = UserCircleIcon;
  readonly UserGroupIcon = UserGroupIcon;
  readonly PaymentSuccess02Icon = PaymentSuccess02Icon;
  readonly Search01Icon = Search01Icon;
  readonly TimeQuarterIcon = TimeQuarterIcon;
  readonly Calendar01Icon = Calendar01Icon;

  userRole = signal<string | null>(localStorage.getItem('user_role'));
  currentUser = signal<any>(null);

  receivingEmail = signal<string>('');
  locations = signal<any[]>([]);
  communication = signal<any>({
    emailNotifications: true,
    emailSignatureUrl: null,
    emailLogoUrl: null,
    companyAddress: '',
    offboardingRejectionTemplate: '',
    offboardingAcceptanceTemplate: '',
    onboardingTemplateEmployee: '',
    onboardingTemplateIntern: '',
    shortlistInterviewTemplate: '',
    applicationRejectionTemplate: ''
  });
  defaultPassword = signal<string>('');
  roles = signal<{ name: string, isEmployee: boolean, isIntern: boolean }[]>([]);
  rolesActiveFilter = signal<'all' | 'employee' | 'intern' | 'both' | 'careers'>('all');
  rolesSearchQuery = signal<string>('');
  employeeRoles = signal<string[]>([]);
  internRoles = signal<string[]>([]);
  leavePolicies = signal<any[]>([
    { name: 'Casual Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' },
    { name: 'Sick Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' }
  ]);
  careerPostings = signal<any[]>([]);

  filteredRoles = computed(() => {
    const query = (this.rolesSearchQuery() || '').toLowerCase().trim();
    const filter = this.rolesActiveFilter();
    let list = this.roles() || [];

    if (query) {
      list = list.filter(r => (r?.name || '').toLowerCase().includes(query));
    }

    if (filter === 'employee') {
      list = list.filter(r => r?.isEmployee);
    } else if (filter === 'intern') {
      list = list.filter(r => r?.isIntern);
    } else if (filter === 'both') {
      list = list.filter(r => r?.isEmployee && r?.isIntern);
    } else if (filter === 'careers') {
      list = list.filter(r => r?.name && this.isRoleListedInCareers(r.name));
    }

    return list;
  });

  rolesCountAll = computed(() => (this.roles() || []).length);
  rolesCountEmployee = computed(() => (this.roles() || []).filter(r => r?.isEmployee).length);
  rolesCountIntern = computed(() => (this.roles() || []).filter(r => r?.isIntern).length);
  rolesCountBoth = computed(() => (this.roles() || []).filter(r => r?.isEmployee && r?.isIntern).length);
  rolesCountCareers = computed(() => (this.roles() || []).filter(r => r?.name && this.isRoleListedInCareers(r.name)).length);

  // Career Modal State
  isCareerModalOpen = signal<boolean>(false);
  isSavingCareerPosting = signal<boolean>(false);
  currentEditingJob = signal<any | null>(null);
  tempResponsibility = signal<string>('');
  tempRequirement = signal<string>('');
  tempTag = signal<string>('');

  // Assessment Modal State
  isAssessmentModalOpen = signal<boolean>(false);
  isSavingAssessment = signal<boolean>(false);
  currentAssessmentRoleName = signal<string>('');
  currentEditingAssessment = signal<any | null>(null);

  // Default Payroll settings
  defaultEmployeeBasic = signal<number>(35000);
  defaultEmployeeHra = signal<number>(12000);
  defaultEmployeeAllowances = signal<number>(6000);
  defaultEmployeeDeductions = signal<number>(3000);
  defaultInternBasic = signal<number>(12000);
  defaultInternAllowances = signal<number>(2000);
  defaultInternDeductions = signal<number>(1000);

  // PF and Tax settings
  pfCalculateEmployee = signal<boolean>(false);
  pfPercentage = signal<number>(12);
  taxPercentage = signal<number>(10);
  taxLimitThreshold = signal<number>(50000);

  // LOP (Loss of Pay) settings
  // Applies to: pending leaves + absence without any approval
  enableLopEmployee     = signal<boolean>(false);
  enableLopIntern       = signal<boolean>(false);
  lopTypeEmployee       = signal<'percentage' | 'amount'>('percentage');
  lopTypeIntern         = signal<'percentage' | 'amount'>('percentage');
  lopPercentageEmployee = signal<number>(100);
  lopPercentageIntern   = signal<number>(100);
  lopAmountEmployee     = signal<number>(0);
  lopAmountIntern       = signal<number>(0);
  workingDaysEmployee   = signal<number>(26);
  workingDaysIntern     = signal<number>(26);

  // Individual payroll lists
  allEmployees = signal<any[]>([]);
  allInterns = signal<any[]>([]);
  payrollSearchQuery = signal<string>('');
  payrollActiveSubTab = signal<'employees' | 'interns'>('employees');

  filteredPayrollEmployees = computed(() => {
    const query = this.payrollSearchQuery().toLowerCase().trim();
    const emps = this.allEmployees();
    if (!query) return emps;
    return emps.filter(e => 
      e.fullName?.toLowerCase().includes(query) ||
      (e.EmployeeId || '').toLowerCase().includes(query) ||
      (e.department || '').toLowerCase().includes(query) ||
      (e.role || '').toLowerCase().includes(query)
    );
  });

  filteredPayrollInterns = computed(() => {
    const query = this.payrollSearchQuery().toLowerCase().trim();
    const ints = this.allInterns();
    if (!query) return ints;
    return ints.filter(i => 
      i.fullName?.toLowerCase().includes(query) ||
      (i.internid || i.internId || '').toLowerCase().includes(query) ||
      (i.department || '').toLowerCase().includes(query)
    );
  });
  
  // Work Duration Settings — how many hours/day is considered a full day per role
  workDurationHr       = signal<number>(8);
  workDurationManager  = signal<number>(8);
  workDurationEmployee = signal<number>(8);
  workDurationIntern   = signal<number>(6);
  showInRegistrationDropdown = signal<boolean>(true);

  activeTab = signal<'locations' | 'communication' | 'employee_roles' | 'intern_roles' | 'company_roles' | 'payroll_settings' | 'system_settings' | 'leave_policies' | 'walkin_drives'>('locations');

  isSaving = signal(false);
  isLoading = signal(true);
  
  isDemoMode = signal(localStorage.getItem('demo_mode') === 'true');

  toggleDemoMode(enabled: boolean) {
    this.isDemoMode.set(enabled);
    localStorage.setItem('demo_mode', enabled ? 'true' : 'false');
    // We should reload to apply the interceptor across all data sources
    window.location.reload();
  }

  ngOnInit() {
    const data = localStorage.getItem('user_data');
    if (data) {
      this.currentUser.set(JSON.parse(data));
    }
    // Load default payroll settings from localStorage if available
    const payrollDefaultsStr = localStorage.getItem('payroll_default_settings');
    if (payrollDefaultsStr) {
      try {
        const defaults = JSON.parse(payrollDefaultsStr);
        if (defaults.empBasic !== undefined) this.defaultEmployeeBasic.set(defaults.empBasic);
        if (defaults.empHra !== undefined) this.defaultEmployeeHra.set(defaults.empHra);
        if (defaults.empAllowances !== undefined) this.defaultEmployeeAllowances.set(defaults.empAllowances);
        if (defaults.empDeductions !== undefined) this.defaultEmployeeDeductions.set(defaults.empDeductions);
        if (defaults.intBasic !== undefined) this.defaultInternBasic.set(defaults.intBasic);
        if (defaults.intAllowances !== undefined) this.defaultInternAllowances.set(defaults.intAllowances);
        if (defaults.intDeductions !== undefined) this.defaultInternDeductions.set(defaults.intDeductions);
        if (defaults.pfCalculateEmployee !== undefined) this.pfCalculateEmployee.set(defaults.pfCalculateEmployee);
        if (defaults.pfPercentage !== undefined) this.pfPercentage.set(defaults.pfPercentage);
        if (defaults.taxPercentage !== undefined) this.taxPercentage.set(defaults.taxPercentage);
        if (defaults.taxLimitThreshold !== undefined) this.taxLimitThreshold.set(defaults.taxLimitThreshold);
      } catch (e) {
        console.error('Failed to parse payroll defaults', e);
      }
    }
    this.fetchSettings();

    setTimeout(() => {
      this.tourService.startAppSettingsTour();
    }, 800);
  }

  fetchSettings() {
    this.isLoading.set(true);
    
    // 1. Fetch lightweight settings immediately
    this.apiService.getCompanySettings().subscribe({
      next: (res: any) => {
        if (res && res.success && res.settings) {
          const s = res.settings;
          this.defaultPassword.set(s.defaultPassword || '');
          this.receivingEmail.set(s.receivingEmail || '');
          this.locations.set(s.locations || []);
          this.communication.set(s.communication || {
            whatsappNotifications: false,
            emailNotifications: true,
            emailSignatureUrl: null,
            emailLogoUrl: null,
            companyAddress: s.companyAddress || res.offerLetterSettings?.address || 'Softrate Tech Park, No: 60A, Velleeswaran Kovil Street, Mangadu, Chennai - 600122',
            offboardingRejectionTemplate: '',
            offboardingAcceptanceTemplate: '',
            onboardingTemplateEmployee: '',
            onboardingTemplateIntern: '',
            shortlistInterviewTemplate: '',
            applicationRejectionTemplate: ''
          });
          // Load Unified Roles
          let unifiedRoles: { name: string, isEmployee: boolean, isIntern: boolean }[] = (s.roles || []).map((r: any) => ({ ...r }));
          if (!unifiedRoles || unifiedRoles.length === 0) {
            const empList: string[] = (s.employeeRoles || []).filter((r: any) => typeof r === 'string' && r.trim() && r !== 'Other');
            const intList: string[] = (s.internRoles || []).filter((r: any) => typeof r === 'string' && r.trim() && r !== 'Other');
            const empSet = new Set<string>(empList);
            const intSet = new Set<string>(intList);
            const combined: string[] = Array.from(new Set<string>([...empList, ...intList]));
            unifiedRoles = combined.map((name: string) => ({
              name,
              isEmployee: empSet.has(name) || !intSet.has(name),
              isIntern: intSet.has(name)
            }));
            if (unifiedRoles.length === 0) {
              unifiedRoles = [{ name: 'Other', isEmployee: true, isIntern: true }];
            }
          }

          // Ensure all careerPostings titles are represented in unifiedRoles so they appear in all tabs & "On Careers"
          const existingRoleNames = new Set(unifiedRoles.map(r => (r?.name || '').trim().toLowerCase()));
          (s.careerPostings || []).forEach((cp: any) => {
            const title = (cp?.title || '').trim();
            if (title && !existingRoleNames.has(title.toLowerCase())) {
              const isIntern = cp.roleType === 'Internship' || cp.workType === 'Internship';
              unifiedRoles.push({
                name: title,
                isEmployee: !isIntern || cp.roleType === 'Employee',
                isIntern: isIntern
              });
              existingRoleNames.add(title.toLowerCase());
            }
          });

          this.roles.set(unifiedRoles);
          this.employeeRoles.set(s.employeeRoles || []);
          this.internRoles.set(s.internRoles || []);
          this.careerPostings.set(s.careerPostings || []);
          this.showInRegistrationDropdown.set(s.showInRegistrationDropdown ?? true);
          this.leavePolicies.set((s.leavePolicies && s.leavePolicies.length > 0) ? s.leavePolicies : [
            { name: 'Casual Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' },
            { name: 'Sick Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' }
          ]);

          if (s.payrollSettings) {
            const ps = s.payrollSettings;
            this.pfCalculateEmployee.set(ps.pfCalculateEmployee ?? false);
            this.pfPercentage.set(ps.pfPercentage ?? 12);
            this.taxPercentage.set(ps.taxPercentage ?? 10);
            this.taxLimitThreshold.set(ps.taxLimitThreshold ?? 50000);

            // Load LOP settings
            const lop = ps.lopSettings || {};
            this.enableLopEmployee.set(lop.enableLopEmployee ?? false);
            this.enableLopIntern.set(lop.enableLopIntern ?? false);
            this.lopTypeEmployee.set(lop.lopTypeEmployee ?? 'percentage');
            this.lopTypeIntern.set(lop.lopTypeIntern ?? 'percentage');
            this.lopPercentageEmployee.set(lop.lopPercentageEmployee ?? 100);
            this.lopPercentageIntern.set(lop.lopPercentageIntern ?? 100);
            this.lopAmountEmployee.set(lop.lopAmountEmployee ?? 0);
            this.lopAmountIntern.set(lop.lopAmountIntern ?? 0);
            this.workingDaysEmployee.set(lop.workingDaysEmployee ?? 26);
            this.workingDaysIntern.set(lop.workingDaysIntern ?? 26);
          }

          // Load Work Duration Settings
          if (s.workDurationSettings) {
            const wd = s.workDurationSettings;
            this.workDurationHr.set(wd.hr ?? 8);
            this.workDurationManager.set(wd.manager ?? 8);
            this.workDurationEmployee.set(wd.employee ?? 8);
            this.workDurationIntern.set(wd.intern ?? 6);
          }
        }
        
        // Settings loaded, unblock the UI!
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to fetch settings', err);
        this.isLoading.set(false);
      }
    });

    // 2. Fetch heavy data (employees/interns) in the background asynchronously
    forkJoin({
      employees: this.apiService.getAllEmployees('all', 'approved'),
      interns: this.apiService.getAllActiveInterns('all', 'approved')
    }).subscribe({
      next: (res: any) => {
        const emps = (res.employees || []).map((emp: any) => {
          const payroll = this.getIndividualPayroll(emp, 'employee');
          return { ...emp, payroll };
        });
        const ints = (res.interns || []).map((intern: any) => {
          const payroll = this.getIndividualPayroll(intern, 'intern');
          return { ...intern, payroll };
        });

        this.allEmployees.set(emps);
        this.allInterns.set(ints);
      },
      error: (err) => {
        console.error('Failed to fetch employees and interns in background', err);
      }
    });
  }

  getIndividualPayroll(person: any, type: 'employee' | 'intern') {
    // 1. Check if person already has payroll fields in database (configured > 0)
    if (person.payroll && typeof person.payroll === 'object' && person.payroll.basicSalary) {
      return {
        basicSalary: Number(person.payroll.basicSalary) || 0,
        hra: Number(person.payroll.hra) || 0,
        allowances: Number(person.payroll.allowances) || 0,
        deductions: Number(person.payroll.deductions) || 0
      };
    }
    // 2. Fall back to default settings signals
    if (type === 'employee') {
      return {
        basicSalary: this.defaultEmployeeBasic(),
        hra: this.defaultEmployeeHra(),
        allowances: this.defaultEmployeeAllowances(),
        deductions: this.defaultEmployeeDeductions()
      };
    } else {
      return {
        basicSalary: this.defaultInternBasic(),
        hra: 0,
        allowances: this.defaultInternAllowances(),
        deductions: this.defaultInternDeductions()
      };
    }
  }

  canEditCommunication(): boolean {
    const role = this.userRole()?.toLowerCase();
    return role === 'hr' || role === 'hr_admin';
  }

  canEditLocation(location: any): boolean {
    const role = this.userRole()?.toLowerCase();
    if (role === 'hr' || role === 'hr_admin') return true;
    if (this.userRole() === 'manager') {
      // If it's a new location being added, or one they created
      return !location._id || location.addedBy === this.currentUser()?.employeeId;
    }
    return false;
  }

  addLocation() {
    const current = this.locations();
    current.push({
      name: 'New Branch',
      latitude: 0,
      longitude: 0,
      radius: 200,
      addedBy: (this.userRole()?.toLowerCase() === 'hr' || this.userRole()?.toLowerCase() === 'hr_admin') ? 'hr' : this.currentUser()?.employeeId
    });
    this.locations.set([...current]);
  }

  removeLocation(index: number) {
    const loc = this.locations()[index];
    if (!this.canEditLocation(loc)) {
      this.alertService.show('You do not have permission to remove this location');
      return;
    }
    const current = this.locations();
    current.splice(index, 1);
    this.locations.set([...current]);
  }

  saveAllSettings() {
    this.isSaving.set(true);

    const empRoles = this.roles().filter(r => r.isEmployee && r.name !== 'Other').map(r => r.name);
    const intRoles = this.roles().filter(r => r.isIntern && r.name !== 'Other').map(r => r.name);

    const payload = {
      defaultPassword: this.defaultPassword(),
      showInRegistrationDropdown: this.showInRegistrationDropdown(),
      receivingEmail: this.receivingEmail(),
      locations: this.locations(),
      communication: this.communication(),
      roles: this.roles(),
      employeeRoles: empRoles,
      internRoles: intRoles,
      careerPostings: this.careerPostings(),
      leavePolicies: this.leavePolicies(),
      payrollSettings: {
        pfCalculateEmployee: this.pfCalculateEmployee(),
        pfCalculateIntern: false,
        pfPercentage: Number(this.pfPercentage()) || 0,
        taxPercentage: Number(this.taxPercentage()) || 0,
        taxLimitThreshold: Number(this.taxLimitThreshold()) || 0,
        lopSettings: {
          enableLopEmployee:     this.enableLopEmployee(),
          enableLopIntern:       this.enableLopIntern(),
          lopTypeEmployee:       this.lopTypeEmployee(),
          lopTypeIntern:         this.lopTypeIntern(),
          lopPercentageEmployee: Number(this.lopPercentageEmployee()) || 0,
          lopPercentageIntern:   Number(this.lopPercentageIntern()) || 0,
          lopAmountEmployee:     Number(this.lopAmountEmployee()) || 0,
          lopAmountIntern:       Number(this.lopAmountIntern()) || 0,
          workingDaysEmployee:   Number(this.workingDaysEmployee()) || 26,
          workingDaysIntern:     Number(this.workingDaysIntern()) || 26
        }
      },
      workDurationSettings: {
        hr:       Number(this.workDurationHr())       || 8,
        manager:  Number(this.workDurationManager())  || 8,
        employee: Number(this.workDurationEmployee()) || 8,
        intern:   Number(this.workDurationIntern())   || 6,
      }
    };

    // Save payroll default settings to localStorage
    const payrollDefaults = {
      empBasic: Number(this.defaultEmployeeBasic()) || 0,
      empHra: Number(this.defaultEmployeeHra()) || 0,
      empAllowances: Number(this.defaultEmployeeAllowances()) || 0,
      empDeductions: Number(this.defaultEmployeeDeductions()) || 0,
      intBasic: Number(this.defaultInternBasic()) || 0,
      intAllowances: Number(this.defaultInternAllowances()) || 0,
      intDeductions: Number(this.defaultInternDeductions()) || 0,
      pfCalculateEmployee: this.pfCalculateEmployee(),
      pfPercentage: Number(this.pfPercentage()) || 0,
      taxPercentage: Number(this.taxPercentage()) || 0,
      taxLimitThreshold: Number(this.taxLimitThreshold()) || 0
    };
    localStorage.setItem('payroll_default_settings', JSON.stringify(payrollDefaults));

    const updates: any[] = [];

    // Save each employee's individual payroll structure to localStorage and DB
    for (const emp of this.allEmployees()) {
      const id = emp.EmployeeId || emp._id;
      const payroll = {
        basicSalary: Number(emp.payroll.basicSalary) || 0,
        hra: Number(emp.payroll.hra) || 0,
        allowances: Number(emp.payroll.allowances) || 0,
        deductions: Number(emp.payroll.deductions) || 0
      };
      localStorage.setItem(`payroll_struct_${id}`, JSON.stringify(payroll));
      if (emp._id) {
        updates.push(
          this.apiService.updateEmployee(emp._id, { payroll }).pipe(
            catchError(() => of(null)) // Ignore if employee not found
          )
        );
      }
    }

    // Save each intern's individual payroll structure to localStorage and DB
    for (const intern of this.allInterns()) {
      const id = intern.internid || intern.internId || intern._id;
      const payroll = {
        basicSalary: Number(intern.payroll.basicSalary) || 0,
        hra: 0,
        allowances: Number(intern.payroll.allowances) || 0,
        deductions: Number(intern.payroll.deductions) || 0
      };
      localStorage.setItem(`payroll_struct_${id}`, JSON.stringify(payroll));
      if (intern._id) {
        updates.push(
          this.apiService.updateIntern(intern._id, { payroll }).pipe(
            catchError(() => of(null)) // Ignore if intern not found
          )
        );
      }
    }

    const companySettingsUpdate$ = this.apiService.updateCompanySettings(payload);

    forkJoin([companySettingsUpdate$, ...updates]).pipe(
      finalize(() => this.isSaving.set(false))
    ).subscribe({
      next: (res: any) => {
        this.alertService.show('All settings updated successfully');
        this.fetchSettings(); // Refresh to reflect changes immediately
      },
      error: (err) => {
        this.alertService.show('Failed to update settings: ' + (err.error?.message || err.message));
      }
    });
  }

  calculatePF(basic: number, type: 'employee' | 'intern'): number {
    if (type === 'intern' || !this.pfCalculateEmployee()) return 0;
    return (basic * this.pfPercentage()) / 100;
  }

  calculateTax(gross: number, pf: number): number {
    const taxable = gross - pf;
    if (taxable <= this.taxLimitThreshold()) return 0;
    return (taxable * this.taxPercentage()) / 100;
  }

  calculateNetSalary(basic: number, hra: number, allowances: number, deductions: number, type: 'employee' | 'intern'): number {
    const gross = basic + hra + allowances - deductions;
    const pf = this.calculatePF(basic, type);
    const tax = this.calculateTax(gross, pf);
    return gross - pf - tax;
  }
  
  // ==================== Unified Roles Management ====================
  addUnifiedRole() {
    const current = [...this.roles()];
    current.push({
      name: 'New Role',
      isEmployee: true,
      isIntern: false
    });
    this.roles.set(current);
  }

  removeUnifiedRole(target: number | any) {
    let roles = [...this.roles()];
    let index = typeof target === 'number' ? target : roles.indexOf(target);
    if (index < 0 && target && target.name) {
      index = roles.findIndex(r => (r.name || '').trim().toLowerCase() === (target.name || '').trim().toLowerCase());
    }
    if (index >= 0 && roles[index]) {
      const roleToDelete = roles[index];
      const roleName = (roleToDelete.name || '').trim();
      if (roleName.toLowerCase() === 'other') {
        this.alertService.show('The "Other" role cannot be deleted as it is required by the system.');
        return;
      }
      
      roles.splice(index, 1);
      this.roles.set(roles);

      // Also remove matching career posting if it exists
      const cleanName = roleName.toLowerCase();
      const updatedPostings = (this.careerPostings() || []).filter(
        p => (p.title || '').trim().toLowerCase() !== cleanName
      );
      this.careerPostings.set(updatedPostings);

      const empRoles = roles.filter(r => r.isEmployee && r.name !== 'Other').map(r => r.name);
      const intRoles = roles.filter(r => r.isIntern && r.name !== 'Other').map(r => r.name);

      // Persist directly to MongoDB
      this.apiService.updateCompanySettings({
        roles: roles,
        employeeRoles: empRoles,
        internRoles: intRoles,
        careerPostings: updatedPostings
      }).subscribe({
        next: () => {
          this.alertService.show(`Role "${roleName}" deleted successfully.`);
        },
        error: (err) => {
          console.error('Failed to delete role:', err);
          this.alertService.show(`Failed to delete role: ${err.error?.message || err.message}`);
        }
      });
    }
  }

  updateUnifiedRoleName(target: number | any, name: string) {
    const roles = [...this.roles()];
    let index = typeof target === 'number' ? target : roles.indexOf(target);
    if (index >= 0 && roles[index]) {
      roles[index] = { ...roles[index], name };
      this.roles.set(roles);
    }
  }

  toggleUnifiedRoleFlag(target: number | any, flag: 'isEmployee' | 'isIntern') {
    const roles = [...this.roles()];
    let index = typeof target === 'number' ? target : roles.indexOf(target);
    if (index >= 0 && roles[index]) {
      const updated = { ...roles[index], [flag]: !roles[index][flag] };
      // Keep at least one flag active
      if (!updated.isEmployee && !updated.isIntern) {
        updated[flag] = true;
      }
      roles[index] = updated;
      this.roles.set(roles);
    }
  }

  addRole(type: 'employee' | 'intern') {
    this.addUnifiedRole();
  }

  removeRole(type: 'employee' | 'intern', index: number) {
    this.removeUnifiedRole(index);
  }

  updateRole(type: 'employee' | 'intern', index: number, value: string) {
    this.updateUnifiedRoleName(index, value);
  }

  onSignatureUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Str = e.target?.result as string;
        this.communication.set({
          ...this.communication(),
          emailSignatureUrl: base64Str
        });
      };
      reader.readAsDataURL(file);
    }
  }

  onLogoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Str = e.target?.result as string;
        this.communication.set({
          ...this.communication(),
          emailLogoUrl: base64Str
        });
      };
      reader.readAsDataURL(file);
    }
  }

  insertVariable(selectElem: HTMLSelectElement, textareaElem: HTMLTextAreaElement, field: string) {
    const variable = selectElem.value;
    if (!variable) return;

    const currentVal = this.communication()[field] || '';
    const startPos = textareaElem.selectionStart || currentVal.length;
    const endPos = textareaElem.selectionEnd || currentVal.length;

    const newVal = currentVal.substring(0, startPos) + variable + currentVal.substring(endPos);
    
    this.communication.set({
      ...this.communication(),
      [field]: newVal
    });

    // Reset dropdown
    selectElem.value = "";

    // Set cursor position back inside textarea after angular updates
    setTimeout(() => {
      textareaElem.focus();
      textareaElem.setSelectionRange(startPos + variable.length, startPos + variable.length);
    }, 0);
  }

  addLeavePolicy() {
    this.leavePolicies.update(policies => [
      ...policies,
      { name: '', allowance: 12, frequency: 'annual', appliesTo: 'both' }
    ]);
  }

  removeLeavePolicy(index: number) {
    this.leavePolicies.update(policies => policies.filter((_, i) => i !== index));
  }

  // ==================== Career Postings Management ====================
  categoryOptions = [
    { key: 'engineering', name: 'Engineering' },
    { key: 'sales', name: 'Sales' },
    { key: 'marketing', name: 'Marketing' },
    { key: 'media', name: 'Creative Media' },
    { key: 'design', name: 'Design & UI/UX' },
    { key: 'hr', name: 'Human Resources' },
    { key: 'operations', name: 'Operations' }
  ];

  getCareerPostingForRole(roleName: string): any | null {
    if (!roleName) return null;
    const clean = roleName.trim().toLowerCase();
    return this.careerPostings().find(p => p.title?.trim().toLowerCase() === clean) || null;
  }

  isRoleListedInCareers(roleName: string): boolean {
    const job = this.getCareerPostingForRole(roleName);
    return !!(job && job.isListed !== false);
  }

  toggleRoleCareerListing(roleName: string, event: Event) {
    event.stopPropagation();
    const existing = this.getCareerPostingForRole(roleName);
    if (existing) {
      existing.isListed = !existing.isListed;
      const updated = [...this.careerPostings()];
      this.careerPostings.set(updated);
      this.apiService.updateCompanySettings({ careerPostings: updated }).subscribe({
        next: () => {
          this.alertService.show(`"${roleName}" ${existing.isListed ? 'listed on' : 'unlisted from'} careers portal.`);
        },
        error: (err) => {
          console.error(err);
          this.alertService.show(`Failed to update listing: ${err.error?.message || err.message}`);
        }
      });
    } else {
      this.openCareerEditor(roleName);
    }
  }

  inferCategoryFromRole(roleName: string): string {
    const clean = (roleName || '').toLowerCase();
    if (clean.includes('sales') || clean.includes('business development') || clean.includes('bde')) return 'sales';
    if (clean.includes('market') || clean.includes('growth') || clean.includes('seo')) return 'marketing';
    if (clean.includes('video') || clean.includes('media') || clean.includes('graph') || clean.includes('content') || clean.includes('editor')) return 'media';
    if (clean.includes('design') || clean.includes('ui') || clean.includes('ux') || clean.includes('figma')) return 'design';
    if (clean.includes('hr') || clean.includes('talent') || clean.includes('recruit')) return 'hr';
    if (clean.includes('operation') || clean.includes('admin')) return 'operations';
    return 'engineering';
  }

  openCareerEditor(roleName: string, defaultRoleType: 'Employee' | 'Internship' = 'Employee') {
    const existing = this.getCareerPostingForRole(roleName);
    if (existing) {
      const cloned = JSON.parse(JSON.stringify(existing));
      this.currentEditingJob.set(cloned);
    } else {
      // Find role in unified roles list to see if it's intern-focused
      const rObj = this.roles().find(r => r.name?.toLowerCase() === roleName.toLowerCase());
      const roleType = rObj ? (rObj.isEmployee ? 'Employee' : 'Internship') : defaultRoleType;

      const defaultCategory = this.inferCategoryFromRole(roleName);
      const categoryObj = this.categoryOptions.find(c => c.key === defaultCategory) || this.categoryOptions[0];
      
      const newJob = {
        job_id: '193779' + Math.floor(100000000000 + Math.random() * 900000000000),
        title: roleName,
        category: categoryObj.key,
        categoryName: categoryObj.name,
        department: '',
        location: '',
        workType: roleType === 'Employee' ? 'Full-Time' : 'Internship',
        is_important: false,
        shortSummary: '',
        about: '',
        responsibilities: [],
        requirements: [],
        assessment: null,
        note: '',
        applyEmail: '',
        tags: [],
        roleType: roleType,
        isListed: true
      };
      this.currentEditingJob.set(newJob);
    }
    this.tempResponsibility.set('');
    this.tempRequirement.set('');
    this.tempTag.set('');
    this.isCareerModalOpen.set(true);
  }

  // ==================== Assessment Builder Helpers ====================

  getRoleAssessment(roleName: string): any {
    if (!roleName) return null;
    const clean = roleName.trim().toLowerCase();
    const posting = this.careerPostings().find(p => p.title?.trim().toLowerCase() === clean);
    if (posting && posting.assessment) {
      return posting.assessment;
    }
    return null;
  }

  openAssessmentEditor(roleName: string) {
    this.currentAssessmentRoleName.set(roleName);
    const clean = roleName.trim().toLowerCase();
    const posting = this.careerPostings().find(p => p.title?.trim().toLowerCase() === clean);

    if (posting && posting.assessment) {
      this.currentEditingAssessment.set(JSON.parse(JSON.stringify(posting.assessment)));
    } else {
      // Start with a blank assessment for the admin to fill in
      this.currentEditingAssessment.set({
        enabled: true,
        title: `${roleName} Assessment`,
        description: '',
        questions: []
      });
    }
    this.isAssessmentModalOpen.set(true);
  }

  closeAssessmentModal() {
    this.isAssessmentModalOpen.set(false);
    this.currentEditingAssessment.set(null);
    this.currentAssessmentRoleName.set('');
  }

  saveAssessmentModal() {
    const roleName = this.currentAssessmentRoleName();
    const assessmentData = this.currentEditingAssessment();
    if (!roleName || !assessmentData) return;

    const currentList = [...this.careerPostings()];
    const cleanRole = roleName.trim().toLowerCase();
    const existingIndex = currentList.findIndex(p => p.title?.trim().toLowerCase() === cleanRole);

    if (existingIndex >= 0) {
      currentList[existingIndex] = {
        ...currentList[existingIndex],
        assessment: assessmentData,
        updatedAt: new Date()
      };
    } else {
      const roleObj = this.roles().find(r => r.name?.trim().toLowerCase() === cleanRole);
      const roleType = roleObj?.isIntern && !roleObj?.isEmployee ? 'Internship' : 'Employee';
      const defaultCategory = this.inferCategoryFromRole(roleName);
      const categoryObj = this.categoryOptions.find(c => c.key === defaultCategory) || this.categoryOptions[0];

      const newJob = {
        job_id: '193779' + Math.floor(100000000000 + Math.random() * 900000000000),
        title: roleName,
        category: categoryObj.key,
        categoryName: categoryObj.name,
        roleType: roleType,
        assessment: assessmentData,
        isListed: false
      };
      currentList.push(newJob);
    }

    this.isSavingAssessment.set(true);

    // Save directly to MongoDB via API
    this.apiService.updateCompanySettings({ careerPostings: currentList }).pipe(
      finalize(() => this.isSavingAssessment.set(false))
    ).subscribe({
      next: () => {
        this.careerPostings.set(currentList);
        this.isAssessmentModalOpen.set(false);
        this.currentEditingAssessment.set(null);
        this.alertService.show(`Assessment for "${roleName}" saved successfully!`);
      },
      error: (err) => {
        this.alertService.show(`Failed to save assessment: ${err.error?.message || err.message}`);
      }
    });
  }

  addAssessmentModalQuestion() {
    const ass = this.currentEditingAssessment();
    if (!ass) return;
    if (!ass.questions) ass.questions = [];
    ass.questions.push({
      id: 'q_' + Date.now(),
      label: 'New Question',
      type: 'text',
      options: ['Option 1', 'Option 2'],
      required: true,
      placeholder: 'Enter response here...',
      minLinks: 1,
      maxLinks: 5
    });
    this.currentEditingAssessment.set({ ...ass });
  }

  removeAssessmentModalQuestion(index: number) {
    const ass = this.currentEditingAssessment();
    if (!ass || !ass.questions) return;
    ass.questions.splice(index, 1);
    this.currentEditingAssessment.set({ ...ass });
  }

  addOptionToAssessmentModalQuestion(question: any, inputElem: HTMLInputElement) {
    const optText = inputElem.value.trim();
    if (!optText) return;
    if (!question.options) question.options = [];
    if (!question.options.includes(optText)) {
      question.options.push(optText);
    }
    inputElem.value = '';
    const ass = this.currentEditingAssessment();
    if (ass) this.currentEditingAssessment.set({ ...ass });
  }

  removeOptionFromAssessmentModalQuestion(question: any, optIndex: number) {
    if (!question.options) return;
    question.options.splice(optIndex, 1);
    const ass = this.currentEditingAssessment();
    if (ass) this.currentEditingAssessment.set({ ...ass });
  }

  onCategoryChange(catKey: string) {
    const job = this.currentEditingJob();
    if (!job) return;
    const cat = this.categoryOptions.find(c => c.key === catKey);
    if (cat) {
      job.category = cat.key;
      job.categoryName = cat.name;
      this.currentEditingJob.set({ ...job });
    }
  }

  addResponsibility() {
    const text = this.tempResponsibility().trim();
    if (!text) return;
    const job = this.currentEditingJob();
    if (!job) return;
    if (!job.responsibilities) job.responsibilities = [];
    job.responsibilities.push(text);
    this.currentEditingJob.set({ ...job });
    this.tempResponsibility.set('');
  }

  removeResponsibility(index: number) {
    const job = this.currentEditingJob();
    if (!job || !job.responsibilities) return;
    job.responsibilities.splice(index, 1);
    this.currentEditingJob.set({ ...job });
  }

  addRequirement() {
    const text = this.tempRequirement().trim();
    if (!text) return;
    const job = this.currentEditingJob();
    if (!job) return;
    if (!job.requirements) job.requirements = [];
    job.requirements.push(text);
    this.currentEditingJob.set({ ...job });
    this.tempRequirement.set('');
  }

  removeRequirement(index: number) {
    const job = this.currentEditingJob();
    if (!job || !job.requirements) return;
    job.requirements.splice(index, 1);
    this.currentEditingJob.set({ ...job });
  }

  addTag() {
    const text = this.tempTag().trim();
    if (!text) return;
    const job = this.currentEditingJob();
    if (!job) return;
    if (!job.tags) job.tags = [];
    if (!job.tags.includes(text)) {
      job.tags.push(text);
    }
    this.currentEditingJob.set({ ...job });
    this.tempTag.set('');
  }

  removeTag(index: number) {
    const job = this.currentEditingJob();
    if (!job || !job.tags) return;
    job.tags.splice(index, 1);
    this.currentEditingJob.set({ ...job });
  }

  saveCareerPostingModal() {
    const job = this.currentEditingJob();
    if (!job || !job.title) {
      this.alertService.show('Job title is required.');
      return;
    }


    const currentList = [...this.careerPostings()];
    const cleanTitle = job.title.trim().toLowerCase();
    const existingIndex = currentList.findIndex(p => p.job_id === job.job_id || (p.title?.trim().toLowerCase() === cleanTitle && p.roleType === job.roleType));

    if (existingIndex >= 0) {
      currentList[existingIndex] = { ...job, isListed: true, updatedAt: new Date() };
    } else {
      currentList.push({ ...job, isListed: true, createdAt: new Date(), updatedAt: new Date() });
    }

    this.isSavingCareerPosting.set(true);

    // Also ensure role exists in unified roles list
    const currentRoles = [...this.roles()];
    const hasRole = currentRoles.some(r => r.name?.trim().toLowerCase() === cleanTitle);
    if (!hasRole) {
      const isIntern = job.roleType === 'Internship' || job.workType === 'Internship';
      currentRoles.push({
        name: job.title.trim(),
        isEmployee: !isIntern || job.roleType === 'Employee',
        isIntern: isIntern
      });
      this.roles.set(currentRoles);
    }

    // Save directly to MongoDB via API
    this.apiService.updateCompanySettings({ 
      careerPostings: currentList,
      roles: currentRoles 
    }).pipe(
      finalize(() => this.isSavingCareerPosting.set(false))
    ).subscribe({
      next: () => {
        this.careerPostings.set(currentList);
        this.isCareerModalOpen.set(false);
        this.currentEditingJob.set(null);
        this.alertService.show(`Career posting for "${job.title}" saved successfully!`);
      },
      error: (err) => {
        this.alertService.show(`Failed to save career posting: ${err.error?.message || err.message}`);
      }
    });
  }

  closeCareerModal() {
    this.isCareerModalOpen.set(false);
    this.currentEditingJob.set(null);
  }

  trackByIndex(index: number, item: any): any {
    return index;
  }
}
