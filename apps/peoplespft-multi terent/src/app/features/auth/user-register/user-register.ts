import { Component, signal, computed, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../services/api.service';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { WorkIcon } from '@hugeicons/core-free-icons';

@Component({
  selector: 'app-user-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HugeiconsIconComponent],
  templateUrl: './user-register.html',
  styleUrl: './user-register.css'
})
export class UserRegister implements OnInit {
  readonly WorkIcon = WorkIcon;

  private apiService = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // Deep linking parameters
  targetRole = '';
  targetType = ''; // 'Internship' | 'Employee' | 'both'
  jobId: string | null = null;
  isDeepLinked = signal(false);
  deepLinkedRole = signal('');

  // Flow steps:
  // 2: Role & Track Selection, 25: Job Description Preview, 3: Profile & Experience, 4: Role Assessment
  currentStep = 2;
  isVerifying = signal(false);
  isVerified = signal(true);
  verifiedCompanyName = signal('Softrate Technologies Private Limited – India');
  companyCode = 'SOFTRATE';
  companySettings: any = null;
  matchingPosting = signal<any>(null);

  allPublicCompanies = signal<any[]>([]);
  showCompanyDropdown = signal(false);

  filteredCompanies = computed(() => {
    const list = this.allPublicCompanies();
    const query = (this.companyCode || '').toLowerCase().trim();
    if (!query) return list;
    return list.filter(c =>
      (c.name || '').toLowerCase().includes(query) ||
      (c.companyCode || '').toLowerCase().includes(query)
    );
  });

  // Track Type
  isCampusStudent = false;
  campusStudentId: string | null = null;
  campusStudentData: any = null;
  isDriveTimelineExpired = false;
  driveTimelineExpiredMessage = '';
  applicationType = 'Internship'; // Internship | Employee | Walkin | Seasonal
  selectedWalkinDriveId: string | null = null;
  selectedSeasonalDrive: any = null;
  isLoadingDrives = signal(false);
  walkinDrives = signal<any[]>([]);
  walkinDrivesOnly = computed(() => this.walkinDrives().filter(d => !d.driveType || d.driveType === 'walkin'));
  seasonalDrivesOnly = computed(() => this.walkinDrives().filter(d => d.driveType === 'seasonal'));
  selectedRoleCardKey = signal<string | null>(null);
  displayRoles = computed(() => {
    const postings: any[] = this.companySettings?.careerPostings || [];
    const listed = postings.filter(p => p.isListed === true || p.is_important === true);
    if (listed.length > 0) return listed;
    if (postings.length > 0) return postings;
    const internList: string[] = this.companySettings?.internRoles || [];
    const empList: string[] = this.companySettings?.employeeRoles || [];
    const unique = Array.from(new Set([...internList, ...empList])).filter(r => r && r.toLowerCase() !== 'other');
    return unique.map(title => ({ title, isListed: true }));
  });
  showRoleTypeSelection = signal(false);

  // ==========================================
  // STAGE 1 (STEP 3): PROFILE & PERSONAL INFO
  // ==========================================
  fullName = '';
  countryCode = '+91';
  countryCodes = ['+91', '+1', '+44', '+971', '+65', '+61', '+49', '+33', '+81'];
  phone = '';
  email = '';
  dob = '';
  minDobDate: string = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 100);
    return d.toISOString().split('T')[0];
  })();
  maxDobDate: string = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split('T')[0];
  })();
  gender = 'Male';
  genders = ['Male', 'Female', 'Other'];
  location = '';
  maritalStatus = 'Single';
  maritalOptions = ['Single', 'Married', 'Widowed'];
  degree = '';
  degrees = [
    'B.E / B.Tech (Computer Science / IT)',
    'B.E / B.Tech (Other Branches)',
    'B.Sc / BCA (Computer Science / IT)',
    'MCA / M.Sc',
    'M.E / M.Tech',
    'B.Com / BBA / BBM',
    'MBA',
    'Diploma in Engineering',
    'Other'
  ];
  college = '';
  department = '';
  year = '3rd Year';
  years = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Passed Out'];
  role = '';
  otherRole = '';
  roles: string[] = ['Other'];
  linkedin = '';
  resumeBase64: string | null = null;
  resumeFileName: string | null = null;

  // Employee-Specific Status (Fresher vs Experienced)
  isFresher = true; // true: Fresher, false: Experienced
  experienceStatus = 'fresher';
  graduationYear = '2024';
  cgpaOrPercentage = '';
  currentCompany = '';
  currentDesignation = '';
  yearsOfExperience: any = '';
  currentCtc: any = '';
  expectedCtc: any = '';
  noticePeriodDays: any = '';
  availableJoiningDate = '';

  // ==========================================
  // STAGE 2 (STEP 4): DYNAMIC ROLE ASSESSMENT
  // ==========================================
  dynamicAssessment: any = null;
  dynamicAnswers: Record<string, any> = {};
  dynamicTags: Record<string, string[]> = {};
  dynamicOtherText: Record<string, string> = {};
  dynamicLinks: Record<string, string[]> = {};

  get hasAssessment(): boolean {
    if (!this.dynamicAssessment) return false;
    if (this.dynamicAssessment.enabled === false) return false;
    return Array.isArray(this.dynamicAssessment.questions) && this.dynamicAssessment.questions.length > 0;
  }

  // Declarations
  declareAccuracy = false;
  bgConsent = false;
  whatsappConsent = false;
  showDeclarationModal = false;

  // Project Links for Campus Students
  campusProjectLinks: string[] = [''];

  addCampusProjectLink() {
    if (this.campusProjectLinks.length < 5) {
      this.campusProjectLinks.push('');
    }
  }

  removeCampusProjectLink(index: number) {
    if (this.campusProjectLinks.length > 1) {
      this.campusProjectLinks.splice(index, 1);
    }
  }

  onProjectLinkInput(index: number) {
    delete this.fieldErrors['campusProjectLinks'];
  }

  ngOnInit() {
    this.fetchPublicCompanies();

    // Check if arriving from Campus Hiring onboarding login
    const rawCampus = sessionStorage.getItem('campus_onboarding_student');
    if (rawCampus) {
      try {
        const student = JSON.parse(rawCampus);
        this.campusStudentData = student;
        this.isCampusStudent = true;
        this.campusStudentId = student.id;
        this.currentStep = 3; // Go directly to form as like mobile

        const cachedComp = sessionStorage.getItem('campus_onboarding_company');
        if (cachedComp) this.companyCode = cachedComp;

        // Pre-fill student info
        this.fullName = student.fullName || '';
        this.email = student.email || '';
        if (student.phone) {
          let rawPhone = (student.phone || '').trim();
          if (rawPhone.startsWith('+91')) {
            this.countryCode = '+91';
            rawPhone = rawPhone.replace(/^\+91\s*/, '');
          }
          const digits = rawPhone.replace(/\D/g, '');
          if (digits.length === 12 && digits.startsWith('91')) {
            this.phone = digits.slice(2);
          } else if (digits.length === 10) {
            this.phone = digits;
          } else {
            this.phone = rawPhone;
          }
        } else {
          this.phone = '';
        }
        this.college = student.collegeName || '';
        this.degree = student.degree || '';
        this.department = student.department || '';
        this.cgpaOrPercentage = student.cgpa || '';
        if (student.dob) {
          const d = new Date(student.dob);
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            this.dob = `${day}/${month}/${year}`;
          } else {
            this.dob = student.dob;
          }
        }

        const candidateRoles: string[] = student.appliedRoles || [];
        if (candidateRoles.length > 0) {
          this.roles = candidateRoles;
          this.role = candidateRoles[0];
          this.targetRole = candidateRoles[0];
        }

        // Check if student has already submitted
        if (student.isFormSubmitted || student.isOnboarded) {
          this.isDriveTimelineExpired = true;
          this.driveTimelineExpiredMessage = 'You have already submitted your application for this campus drive. Multiple submissions are not allowed.';
        }

        // Verify Campus Drive timeline
        if (student.driveEndDate) {
          const end = new Date(student.driveEndDate);
          if (!isNaN(end.getTime())) {
            if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0) {
              end.setUTCHours(23, 59, 59, 999);
            }
            if (new Date() > end) {
              this.isDriveTimelineExpired = true;
              const formatted = new Date(student.driveEndDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              });
              this.driveTimelineExpiredMessage = `The registration timeline for this campus drive ended on ${formatted}. Onboarding login and form submission are now closed.`;
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse campus onboarding student:', e);
      }
    }

    this.route.queryParams.subscribe(params => {
      const companyParam = params['company'] || params['companyCode'];
      const roleParam = params['role'] || params['job_title'] || params['jobTitle'];
      const typeParam = params['type'] || params['roleType'];
      const jobIdParam = params['job_id'] || params['jobId'];

      if (jobIdParam) {
        this.jobId = jobIdParam;
      }

      if (roleParam) {
        this.targetRole = roleParam.trim();
        this.deepLinkedRole.set(this.targetRole);
      }

      if (typeParam) {
        const normalizedType = typeParam.toString().toLowerCase().trim();
        if (normalizedType === 'internship' || normalizedType === 'intern') {
          this.targetType = 'Internship';
          this.applicationType = 'Internship';
        } else if (normalizedType === 'employee' || normalizedType === 'full-time' || normalizedType === 'fulltime' || normalizedType === 'job') {
          this.targetType = 'Employee';
          this.applicationType = 'Employee';
        } else if (normalizedType === 'walkin' || normalizedType === 'walk-in') {
          this.targetType = 'Walkin';
          this.applicationType = 'Walkin';
        } else {
          this.targetType = 'both';
        }
      }

      // Hardcode SOFTRATE by default, while supporting query override if passed
      this.companyCode = companyParam ? companyParam.toString().toUpperCase().trim() : 'SOFTRATE';
      this.verifyCompany(true);
    });
  }

  fetchPublicCompanies() {
    this.apiService.getPublicCompanies().subscribe({
      next: (res: any) => {
        if (res && res.companies) {
          this.allPublicCompanies.set(res.companies);
        }
      },
      error: (err) => console.error('Failed to load public companies:', err)
    });
  }

  selectCompanyFromDropdown(comp: any) {
    this.companyCode = comp.companyCode;
    this.showCompanyDropdown.set(false);
    this.verifyCompany();
  }

  onCompanyInputFocus() {
    this.showCompanyDropdown.set(true);
  }

  onCompanyInputChange() {
    this.showCompanyDropdown.set(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.verification-group')) {
      this.showCompanyDropdown.set(false);
    }
  }

  isRoleBothEnabled(roleName?: string): boolean {
    const target = roleName || this.role;
    if (!target) return false;
    return this.checkRoleIsEmployee(target) && this.checkRoleIsIntern(target);
  }

  checkRoleIsEmployee(roleName: string): boolean {
    if (!this.companySettings) return true;
    const clean = roleName.trim().toLowerCase();
    const roles: any[] = this.companySettings.roles || [];
    const r = roles.find(item => (item.name || '').trim().toLowerCase() === clean);
    if (r) return !!r.isEmployee;
    const empRoles: string[] = this.companySettings.employeeRoles || [];
    if (empRoles.some(name => name.trim().toLowerCase() === clean)) return true;
    const intRoles: string[] = this.companySettings.internRoles || [];
    return !intRoles.some(name => name.trim().toLowerCase() === clean);
  }

  checkRoleIsIntern(roleName: string): boolean {
    if (!this.companySettings) return false;
    const clean = roleName.trim().toLowerCase();
    const roles: any[] = this.companySettings.roles || [];
    const r = roles.find(item => (item.name || '').trim().toLowerCase() === clean);
    if (r) return !!r.isIntern;
    const intRoles: string[] = this.companySettings.internRoles || [];
    return intRoles.some(name => name.trim().toLowerCase() === clean);
  }

  selectRoleCard(posting: any) {
    const title = posting.title;
    this.selectedRoleCardKey.set('role_' + title);
    this.role = title;
    this.otherRole = '';
    this.selectedWalkinDriveId = null;
    this.selectedSeasonalDrive = null;
    this.applicationType = this.checkRoleIsEmployee(title) ? 'Employee' : 'Internship';
    this.matchingPosting.set(posting);
    this.setupRoleAssessment();
    delete this.fieldErrors['role'];
  }

  selectRoleType(type: string) {
    this.applicationType = type;
    this.selectedWalkinDriveId = null;
    this.selectedSeasonalDrive = null;
    this.onApplicationTypeChange();
  }

  selectWalkinDrive(drive: any) {
    const driveId = drive._id || drive.id || 'walkin';
    this.selectedRoleCardKey.set('walkin_' + driveId);
    this.role = 'Walk-in Drive';
    this.applicationType = 'Walkin';
    this.selectedWalkinDriveId = driveId;
    this.selectedSeasonalDrive = null;
    this.matchingPosting.set(null);
    delete this.fieldErrors['role'];
    this.onApplicationTypeChange();
  }

  selectSeasonalDrive(drive: any) {
    const driveId = drive._id || drive.id;
    this.selectedRoleCardKey.set('seasonal_' + driveId);
    this.applicationType = 'Seasonal';
    this.selectedWalkinDriveId = driveId;
    this.selectedSeasonalDrive = drive;
    this.matchingPosting.set(null);
    delete this.fieldErrors['role'];
    this.targetRole = '';
    this.onApplicationTypeChange();
    const driveName = (drive.title || '').trim().toLowerCase();
    this.roles = this.roles.filter(r => {
      const lower = r.trim().toLowerCase();
      return lower !== driveName && lower !== 'test';
    });
    if (!this.roles.includes(this.role) || this.role.toLowerCase() === driveName || this.role.toLowerCase() === 'test') {
      this.role = this.roles.find(r => r !== 'Other') || this.roles[0] || '';
    }
  }

  formatWalkinEndDate(endDate: any): string {
    if (!endDate) return '';
    return endDate.toString().substring(0, 10);
  }

  fetchWalkinDrives(code: string) {
    this.isLoadingDrives.set(true);
    this.walkinDrives.set([]);
    this.apiService.getPublicWalkinDrives(code).subscribe({
      next: (res: any) => {
        if (Array.isArray(res)) {
          this.walkinDrives.set(res);
        }
        this.isLoadingDrives.set(false);
      },
      error: () => {
        this.isLoadingDrives.set(false);
      }
    });
  }

  setupAvailableRoles() {
    if (this.isCampusStudent && this.campusStudentData) {
      const candidateRoles: string[] = this.campusStudentData.appliedRoles || [];
      if (candidateRoles.length > 0) {
        this.roles = candidateRoles;
        if (!this.role || !this.roles.includes(this.role)) {
          this.role = this.roles[0];
          this.targetRole = this.roles[0];
        }
        this.onRoleChange();
        return;
      }
    }

    const internList: string[] = this.companySettings?.internRoles || [];
    const empList: string[] = this.companySettings?.employeeRoles || [];
    const careerPostings: any[] = this.companySettings?.careerPostings || [];
    const postingsList: string[] = careerPostings.map((p: any) => p.title).filter(Boolean);

    const set = new Set<string>();
    const seasonalTitle = (this.selectedSeasonalDrive?.title || '').trim().toLowerCase();

    // For Seasonal Internship, list real functional intern roles / tracks
    const rolePool = this.applicationType === 'Seasonal'
      ? (internList.length > 0 ? internList : [...internList, ...empList, ...postingsList])
      : [...internList, ...empList, ...postingsList];

    rolePool.forEach((r) => {
      const val = (r || '').toString().trim();
      const valLower = val.toLowerCase();
      if (val && valLower !== 'other' && valLower !== 'test' && (seasonalTitle.length === 0 || valLower !== seasonalTitle)) {
        set.add(val);
      }
    });

    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    sorted.push('Other');
    this.roles = sorted;

    if (this.targetRole && this.applicationType !== 'Seasonal') {
      const match = this.roles.find(r => r.toLowerCase() === this.targetRole.toLowerCase());
      if (match) {
        this.role = match;
      } else {
        const otherIdx = this.roles.indexOf('Other');
        if (otherIdx !== -1) {
          this.roles.splice(otherIdx, 0, this.targetRole);
        } else {
          this.roles.unshift(this.targetRole);
        }
        this.role = this.targetRole;
      }
    } else if (this.applicationType === 'Seasonal') {
      if (!this.roles.includes(this.role) || this.role.toLowerCase() === 'test' || this.role.toLowerCase() === seasonalTitle) {
        this.role = this.roles.find(r => r !== 'Other') || this.roles[0] || '';
      }
    }

    if (this.role) {
      this.onRoleChange();
    }
  }

  onApplicationTypeChange() {
    this.setupAvailableRoles();
  }

  checkMatchingJd() {
    const rawRole = this.role === 'Other' ? this.otherRole : (this.role || this.targetRole || '');
    const cleanRole = (rawRole || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const postings: any[] = this.companySettings?.careerPostings || [];

    const matched = postings.find(p => {
      const pTitle = (p.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const isIdMatch = this.jobId && p.job_id && String(p.job_id).trim() === String(this.jobId).trim();
      return isIdMatch || (cleanRole && pTitle === cleanRole);
    });

    this.matchingPosting.set(matched || null);
  }

  onRoleChange() {
    if (this.role !== 'Other') {
      this.otherRole = '';
      delete this.fieldErrors['otherRole'];
    }
    // Reset assessment state so previous role's answers don't carry over
    this.dynamicAssessment = null;
    this.dynamicAnswers = {};
    this.dynamicTags = {};
    this.dynamicOtherText = {};
    this.dynamicLinks = {};

    if (this.isCampusStudent) {
      this.applicationType = 'Internship';
      this.showRoleTypeSelection.set(false);
      this.checkMatchingJd();
      this.setupRoleAssessment();
      return;
    }

    const rawRole = this.role === 'Other' ? this.otherRole : (this.role || this.targetRole || '');
    const cleanRole = (rawRole || '').trim().toLowerCase();

    const internRoles: string[] = (this.companySettings?.internRoles || []).map((r: any) => r.toString().toLowerCase().trim());
    const employeeRoles: string[] = (this.companySettings?.employeeRoles || []).map((r: any) => r.toString().toLowerCase().trim());

    const isInIntern = internRoles.includes(cleanRole);
    const isInEmployee = employeeRoles.includes(cleanRole);

    if (this.targetType && this.targetType !== 'both') {
      this.applicationType = this.targetType;
      this.showRoleTypeSelection.set(false);
    } else if (this.role === 'Other' || !cleanRole) {
      this.showRoleTypeSelection.set(true);
    } else if (isInIntern && !isInEmployee) {
      // Role is configured ONLY to intern -> map to Internship automatically
      this.applicationType = 'Internship';
      this.showRoleTypeSelection.set(false);
    } else if (isInEmployee && !isInIntern) {
      // Role is configured ONLY to employee -> map to Employee automatically
      this.applicationType = 'Employee';
      this.showRoleTypeSelection.set(false);
    } else if (isInIntern && isInEmployee) {
      // Role is configured to BOTH -> ask role type
      this.showRoleTypeSelection.set(true);
    } else {
      // Check careerPostings fallback
      const postings: any[] = this.companySettings?.careerPostings || [];
      const matchedPosting = postings.find(p => (p.title || '').trim().toLowerCase() === cleanRole);
      if (matchedPosting && matchedPosting.roleType) {
        this.applicationType = matchedPosting.roleType;
        this.showRoleTypeSelection.set(false);
      } else {
        this.showRoleTypeSelection.set(true);
      }
    }

    this.checkMatchingJd();
    this.setupRoleAssessment();
  }

  verifyCompany(autoMode = false) {
    if (!this.companyCode) {
      this.errorMessage.set('Please enter a company code');
      return;
    }

    this.isVerifying.set(true);
    this.errorMessage.set('');

    this.apiService.verifyCompany(this.companyCode).subscribe({
      next: (res: any) => {
        if (res && res.company) {
          this.isVerified.set(true);
          this.verifiedCompanyName.set(res.company.name);
          localStorage.setItem('cached_company_code', this.companyCode);
          this.companySettings = res.company.settings || null;

          if (this.targetType && this.targetType !== 'both') {
            this.applicationType = this.targetType;
          }

          this.setupAvailableRoles();
          this.setupRoleAssessment();
          this.fetchWalkinDrives(this.companyCode);

          if (this.isCampusStudent && this.campusStudentData) {
            const candidateRoles: string[] = this.campusStudentData.appliedRoles || [];
            if (candidateRoles.length > 0) {
              this.roles = candidateRoles;
              if (!this.role || !this.roles.includes(this.role)) {
                this.role = candidateRoles[0];
                this.targetRole = candidateRoles[0];
              }
              this.onRoleChange();
            }
            this.currentStep = 3; // Direct to form as like mobile
          } else if (autoMode && this.targetType && this.targetType !== 'both') {
            // Direct to Step 3 (Profile Form)
            this.currentStep = 3;
          } else {
            // Show Step 2 (Role Track)
            this.currentStep = 2;
          }
        }
        this.isVerifying.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.msg || 'Invalid Company Code');
        this.isVerifying.set(false);
      }
    });
  }

  // Helper to determine active questionnaire category
  get roleCategory(): 'frontend' | 'fullstack' | 'testing' | 'sales' | 'marketing' | 'media' | 'general' {
    const roleName = (this.role || this.targetRole || '').toLowerCase();
    if (roleName.includes('tester') || roleName.includes('testing') || roleName.includes('qa') || roleName.includes('quality assurance') || roleName.includes('automation test') || roleName.includes('manual test')) {
      return 'testing';
    }
    if (roleName.includes('sales') || roleName.includes('business development') || roleName.includes('bd') || roleName.includes('telecalling')) {
      return 'sales';
    }
    if (roleName.includes('marketing') || roleName.includes('marketer') || roleName.includes('seo') || roleName.includes('growth')) {
      return 'marketing';
    }
    if (roleName.includes('video') || roleName.includes('editor') || roleName.includes('media') || roleName.includes('creative') || roleName.includes('animat')) {
      return 'media';
    }
    if (roleName.includes('front') || roleName.includes('react') || roleName.includes('ui') || roleName.includes('web design') || roleName.includes('html')) {
      return 'frontend';
    }
    if (roleName.includes('developer') || roleName.includes('full') || roleName.includes('stack') || roleName.includes('mern') || roleName.includes('node') || roleName.includes('backend') || roleName.includes('software') || roleName.includes('engineering') || roleName.includes('programmer')) {
      return 'fullstack';
    }
    return 'frontend';
  }

  setIsFresher(val: boolean) {
    this.isFresher = val;
    this.experienceStatus = val ? 'fresher' : 'experienced';
  }

  onExperienceStatusChange() {
    this.isFresher = (this.experienceStatus === 'fresher');
  }

  selectGender(g: string) {
    this.gender = g;
  }

  selectMaritalStatus(m: string) {
    this.maritalStatus = m;
  }

  // Real-time Field Validation State
  touchedFields: { [key: string]: boolean } = {};
  fieldErrors: { [key: string]: string } = {};

  validateField(field: string): boolean {
    this.touchedFields[field] = true;
    let error = '';

    switch (field) {
      case 'companyCode':
        if (!this.companyCode || !this.companyCode.trim()) {
          error = 'Company code is required.';
        }
        break;

      case 'fullName':
        if (!this.fullName || !this.fullName.trim()) {
          error = 'Full Name is required.';
        } else if (/\d/.test(this.fullName)) {
          error = 'Full Name cannot contain numbers.';
        } else if (this.fullName.trim().length < 2) {
          error = 'Please enter a valid full name.';
        }
        break;

      case 'phone':
        let cleanPhone = (this.phone || '').replace(/\D/g, '');
        if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
          cleanPhone = cleanPhone.slice(2);
        }
        if (!this.phone || !this.phone.trim()) {
          error = 'Phone number is required.';
        } else if (cleanPhone.length !== 10) {
          error = 'Please enter a valid 10-digit phone number.';
        }
        break;

      case 'email':
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!this.email || !this.email.trim()) {
          error = 'Email address is required.';
        } else if (!emailRegex.test(this.email.trim())) {
          error = 'Please enter a valid email address.';
        }
        break;

      case 'dob':
        if (!this.dob || !this.dob.trim()) {
          error = 'Date of birth is required.';
        } else {
          let selectedDate: Date | null = null;
          const dobStr = this.dob.trim();
          if (dobStr.includes('/')) {
            const parts = dobStr.split('/');
            if (parts.length === 3) {
              const d = parseInt(parts[0], 10);
              const m = parseInt(parts[1], 10) - 1;
              const y = parseInt(parts[2], 10);
              if (d >= 1 && d <= 31 && m >= 0 && m <= 11 && y >= 1900 && y <= new Date().getFullYear()) {
                const testDate = new Date(y, m, d);
                if (testDate.getDate() === d && testDate.getMonth() === m && testDate.getFullYear() === y) {
                  selectedDate = testDate;
                }
              }
            }
          } else {
            const parsed = new Date(dobStr);
            if (!isNaN(parsed.getTime())) {
              selectedDate = parsed;
            }
          }

          if (!selectedDate) {
            error = 'Please enter a valid date in DD/MM/YYYY format.';
          } else {
            const today = new Date();
            if (selectedDate > today) {
              error = 'Date of birth cannot be a future date.';
            } else {
              let age = today.getFullYear() - selectedDate.getFullYear();
              const m = today.getMonth() - selectedDate.getMonth();
              if (m < 0 || (m === 0 && today.getDate() < selectedDate.getDate())) {
                age--;
              }
              if (age < 18) {
                error = 'You must be at least 18 years old to register.';
              } else if (age > 100) {
                error = 'Please enter a valid date of birth (Age cannot exceed 100 years).';
              }
            }
          }
        }
        break;

      case 'gender':
        if (!this.gender || !this.gender.trim()) {
          error = 'Please select your gender.';
        }
        break;

      case 'location':
        if (!this.location || !this.location.trim()) {
          error = 'Place / District is required.';
        }
        break;

      case 'maritalStatus':
        if (this.applicationType === 'Seasonal' || this.isCampusStudent) {
          break;
        }
        if (!this.maritalStatus || !this.maritalStatus.trim()) {
          error = 'Please select your marital status.';
        }
        break;

      case 'role':
        const currentRole = this.role === 'Other' ? this.otherRole : (this.role || this.targetRole);
        if (!currentRole || !currentRole.trim()) {
          error = 'Please select a role.';
        }
        break;

      case 'otherRole':
        if (this.role === 'Other' && (!this.otherRole || !this.otherRole.trim())) {
          error = 'Please specify your role name.';
        }
        break;

      case 'degree':
        if (!this.degree || !this.degree.trim()) {
          error = 'Please enter your highest degree / qualification.';
        }
        break;

      case 'department':
        if (!this.department || !this.department.trim()) {
          error = 'Department / Specialization is required.';
        }
        break;

      case 'college':
        if (!this.college || !this.college.trim()) {
          error = 'College / University name is required.';
        }
        break;

      case 'resume':
        if (this.applicationType !== 'Seasonal' && !this.resumeBase64) {
          error = 'Please upload your resume (PDF or DOC < 1MB).';
        }
        break;

      case 'linkedin':
        if (!this.linkedin || !this.linkedin.trim()) {
          error = 'LinkedIn profile URL is required.';
        } else if (!this.linkedin.includes('linkedin.com')) {
          error = 'Please enter a valid LinkedIn URL (e.g. https://linkedin.com/in/username).';
        }
        break;

      case 'graduationYear':
          if ((this.applicationType === 'Employee' || this.isCampusStudent) && this.isFresher) {
            const yr = parseInt(this.graduationYear, 10);
            if (!this.graduationYear || isNaN(yr) || yr < 1990 || yr > 2035) {
              error = 'Please enter a valid graduation year.';
            }
          }
          break;

      case 'currentCompany':
          if ((this.applicationType === 'Employee' || this.isCampusStudent) && !this.isFresher && (!this.currentCompany || !this.currentCompany.trim())) {
            error = 'Current company name is required.';
          }
          break;

      case 'currentDesignation':
          if ((this.applicationType === 'Employee' || this.isCampusStudent) && !this.isFresher && (!this.currentDesignation || !this.currentDesignation.trim())) {
            error = 'Current designation is required.';
          }
          break;

      case 'yearsOfExperience':
          if ((this.applicationType === 'Employee' || this.isCampusStudent) && !this.isFresher) {
            if (this.yearsOfExperience === null || this.yearsOfExperience === undefined || this.yearsOfExperience === '' || isNaN(Number(this.yearsOfExperience)) || Number(this.yearsOfExperience) < 0) {
              error = 'Please enter valid total experience in years.';
            }
          }
          break;

      case 'noticePeriodDays':
          if ((this.applicationType === 'Employee' || this.isCampusStudent) && !this.isFresher) {
            if (this.noticePeriodDays === null || this.noticePeriodDays === undefined || this.noticePeriodDays === '' || isNaN(Number(this.noticePeriodDays)) || Number(this.noticePeriodDays) < 0) {
              error = 'Please enter notice period in days (0 for immediate).';
            }
          }
          break;

      case 'currentCtc':
          if ((this.applicationType === 'Employee' || this.isCampusStudent) && !this.isFresher) {
            if (this.currentCtc === null || this.currentCtc === undefined || this.currentCtc === '' || isNaN(Number(this.currentCtc)) || Number(this.currentCtc) < 0) {
              error = 'Please enter current CTC in LPA.';
            }
          }
          break;

      case 'expectedCtc':
          if ((this.applicationType === 'Employee' || this.isCampusStudent) && !this.isFresher) {
            if (this.expectedCtc === null || this.expectedCtc === undefined || this.expectedCtc === '' || isNaN(Number(this.expectedCtc)) || Number(this.expectedCtc) < 0) {
              error = 'Please enter expected CTC in LPA.';
            }
          }
          break;
        }

        if (error) {
          this.fieldErrors[field] = error;
          return false;
        } else {
          delete this.fieldErrors[field];
          return true;
        }
    }

    toTitleCase(str: string): string {
      if (!str) return '';
      return str
        .split(' ')
        .map(word => {
          if (!word) return '';
          const hasTrailingComma = word.endsWith(',');
          const cleanWord = hasTrailingComma ? word.slice(0, -1) : word;
          if (!cleanWord) return word;
          // If word is already a known all-caps acronym like IT, B.E, B.Tech, CSE, MBA, MCA, preserve it
          let formattedWord = cleanWord;
          if (!(cleanWord.length <= 4 && cleanWord === cleanWord.toUpperCase() && !/[a-z]/.test(cleanWord))) {
            formattedWord = cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase();
          }
          return formattedWord + (hasTrailingComma ? ',' : '');
        })
        .join(' ');
    }

    formatFieldToTitleCase(fieldName: string) {
      switch (fieldName) {
        case 'fullName':
          this.fullName = (this.fullName || '').replace(/[0-9]/g, '');
          this.fullName = this.toTitleCase(this.fullName);
          break;
        case 'location':
          if (this.location) {
            const normalized = this.location.replace(/,\s*/g, ', ');
            this.location = this.toTitleCase(normalized);
          }
          break;
        case 'degree':
          this.degree = this.toTitleCase(this.degree);
          break;
        case 'department':
          this.department = this.toTitleCase(this.department);
          break;
        case 'college':
          this.college = this.toTitleCase(this.college);
          break;
        case 'currentCompany':
          this.currentCompany = this.toTitleCase(this.currentCompany);
          break;
        case 'currentDesignation':
          this.currentDesignation = this.toTitleCase(this.currentDesignation);
          break;
        case 'otherRole':
          this.otherRole = this.toTitleCase(this.otherRole);
          break;
      }
    }

    onNameKeyDown(event: KeyboardEvent) {
      // Prevent typing of any numbers (0-9) from number row, numpad, etc.
      if (event.key && (/[0-9]/.test(event.key) || (event.code && event.code.startsWith('Numpad') && /[0-9]/.test(event.key)))) {
        event.preventDefault();
      }
    }

    onNameKeyPress(event: KeyboardEvent) {
      if (event.key && /[0-9]/.test(event.key)) {
        event.preventDefault();
      }
    }

    onNameBeforeInput(event: any) {
      // For mobile virtual keyboards / IME input
      if (event && event.data && /[0-9]/.test(event.data)) {
        event.preventDefault();
      }
    }

    onNamePaste(event: ClipboardEvent) {
      const pasteText = event.clipboardData?.getData('text') || '';
      if (/[0-9]/.test(pasteText)) {
        event.preventDefault();
        const cleanText = pasteText.replace(/[0-9]/g, '');
        const input = event.target as HTMLInputElement;
        if (input) {
          const start = input.selectionStart || 0;
          const end = input.selectionEnd || 0;
          const currentVal = input.value || '';
          const newVal = currentVal.substring(0, start) + cleanText + currentVal.substring(end);
          input.value = newVal;
          this.fullName = newVal;
          input.setSelectionRange(start + cleanText.length, start + cleanText.length);
          this.onFieldInput('fullName');
        }
      }
    }

    onFullNameInput(event ?: any) {
      const inputEl = event?.target as HTMLInputElement;
      if (inputEl && typeof inputEl.value === 'string') {
        const cleanVal = inputEl.value.replace(/[0-9]/g, '');
        if (inputEl.value !== cleanVal) {
          inputEl.value = cleanVal;
        }
        this.fullName = cleanVal;
      } else if (this.fullName) {
        this.fullName = this.fullName.replace(/[0-9]/g, '');
      }
      this.onFieldInput('fullName');
    }

    onDobInput(event: any): void {
      const inputEl = event?.target as HTMLInputElement;
      let value = (inputEl?.value || '').replace(/\D/g, '');
      if (value.length > 8) value = value.substring(0, 8);
      let formatted = '';
      if (value.length > 4) {
        formatted = `${value.substring(0, 2)}/${value.substring(2, 4)}/${value.substring(4)}`;
      } else if (value.length > 2) {
        formatted = `${value.substring(0, 2)}/${value.substring(2)}`;
      } else {
        formatted = value;
      }
      this.dob = formatted;
      if (inputEl) inputEl.value = formatted;
      this.onFieldInput('dob');
    }

    onDatePickerChange(event: any): void {
      const val = event?.target?.value;
      if (val) {
        const parts = val.split('-');
        if (parts.length === 3) {
          this.dob = `${parts[2]}/${parts[1]}/${parts[0]}`;
          this.validateField('dob');
        }
      }
    }

    getFormattedDobForPayload(): string {
      if (!this.dob) return '';
      const parts = this.dob.trim().split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return this.dob.trim();
    }

    onFieldBlur(field: string) {
      this.formatFieldToTitleCase(field);
      this.validateField(field);
    }

    onFieldInput(field: string) {
      if (this.touchedFields[field]) {
        this.validateField(field);
      }
    }

    hasError(field: string): boolean {
      return !!this.touchedFields[field] && !!this.fieldErrors[field];
    }

    getError(field: string): string {
      return this.fieldErrors[field] || '';
    }

    // File Upload Handlers
    onFileChange(event: any) {
      const file = event.target.files[0];
      if (file) {
        if (file.size > 1024 * 1024) {
          this.fieldErrors['resume'] = 'Resume size must be less than 1MB.';
          this.touchedFields['resume'] = true;
          this.errorMessage.set('Resume size must be less than 1MB');
          return;
        }
        this.resumeFileName = file.name;
        const reader = new FileReader();
        reader.onload = (e: any) => {
          const base64Str = e.target.result.split(',')[1];
          this.resumeBase64 = base64Str;
          delete this.fieldErrors['resume'];
          this.touchedFields['resume'] = true;
        };
        reader.readAsDataURL(file);
      }
    }

    // Project Links for Tech Questionnaire

    isGithubUrl(url: string): boolean {
      if (!url) return false;
      return /github/i.test(url.trim());
    }

    isValidUrl(url: string): boolean {
      if (!url || !url.trim()) return false;
      const pattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?$/i;
      return pattern.test(url.trim());
    }

    // ==================== Dynamic Assessment Engine ====================

    setupRoleAssessment() {
      if (this.isCampusStudent) {
        this.dynamicAssessment = null;
        return;
      }
      const rawRole = this.role === 'Other' ? this.otherRole : (this.role || this.targetRole || '');
      const cleanRole = (rawRole || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const postings: any[] = this.companySettings?.careerPostings || [];

      const matched = postings.find(p => {
        const pTitle = (p.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const isIdMatch = this.jobId && p.job_id && String(p.job_id).trim() === String(this.jobId).trim();
        return isIdMatch || (cleanRole && pTitle === cleanRole);
      });

      // Only use assessment saved in DB — no hardcoded defaults
      if (matched && matched.assessment && matched.assessment.enabled !== false
        && Array.isArray(matched.assessment.questions) && matched.assessment.questions.length > 0) {
        this.dynamicAssessment = matched.assessment;
      } else {
        this.dynamicAssessment = null;
      }

      if (this.dynamicAssessment && Array.isArray(this.dynamicAssessment.questions)) {
        for (const q of this.dynamicAssessment.questions) {
          if (this.dynamicAnswers[q.id] === undefined) {
            this.dynamicAnswers[q.id] = '';
          }
          if (q.type === 'multiselect' && !this.dynamicTags[q.id]) {
            this.dynamicTags[q.id] = [];
          }
          if (q.type === 'links' && !this.dynamicLinks[q.id]) {
            const minRequired = q.minLinks || 1;
            const initialLinks = [];
            for (let i = 0; i < Math.max(minRequired, 3); i++) {
              initialLinks.push('');
            }
            this.dynamicLinks[q.id] = initialLinks;
          }
        }
      }
    }

    addDynamicTag(qId: string, event: Event) {
      const selectEl = event.target as HTMLSelectElement;
      const val = selectEl.value;
      if (!this.dynamicTags[qId]) this.dynamicTags[qId] = [];
      if (val && !this.dynamicTags[qId].includes(val)) {
        this.dynamicTags[qId].push(val);
      }
      selectEl.value = '';
    }

    removeDynamicTag(qId: string, tag: string) {
      if (!this.dynamicTags[qId]) return;
      const idx = this.dynamicTags[qId].indexOf(tag);
      if (idx > -1) {
        this.dynamicTags[qId].splice(idx, 1);
        if (tag === 'Other') {
          this.dynamicOtherText[qId] = '';
        }
      }
    }

    addDynamicLink(qId: string) {
      if (!this.dynamicLinks[qId]) this.dynamicLinks[qId] = [];
      if (this.dynamicLinks[qId].length < 5) {
        this.dynamicLinks[qId].push('');
      }
    }

    removeDynamicLink(qId: string, index: number) {
      if (!this.dynamicLinks[qId]) return;
      this.dynamicLinks[qId].splice(index, 1);
    }

    isGitLink(url: string): boolean {
      if (!url) return false;
      const lower = url.toLowerCase().trim();
      return lower.includes('github.com') || lower.includes('gitlab.com') || lower.includes('bitbucket.org') || lower.endsWith('.git');
    }

    isTechnicalRole(): boolean {
      const r = (this.role === 'Other' ? this.otherRole : this.role || '').toLowerCase();
      const nonTechKeywords = ['sales', 'marketing', 'hr', 'human resource', 'operations', 'business development', 'bde', 'bda', 'recruiter'];
      if (nonTechKeywords.some(kw => r.includes(kw))) {
        return false;
      }
      return true;
    }

    trackByIndex(index: number): number {
      return index;
    }

    // Step Validation & Navigation
    validateStep3(): boolean {
      this.errorMessage.set('');

      // Auto-fallback prefilled campus values if not provided in college batch
      if (this.isCampusStudent) {
        if (!this.college || !this.college.trim()) {
          this.college = this.campusStudentData?.collegeName || 'Kings Engineering';
        }
        if (!this.degree || !this.degree.trim()) {
          this.degree = this.campusStudentData?.degree || 'B.Tech';
        }
        if (!this.department || !this.department.trim()) {
          this.department = this.campusStudentData?.department || 'Information Technology';
        }
        if (!this.dob || !this.dob.trim()) {
          this.dob = '01/01/2002';
        }
        let pDigits = (this.phone || '').replace(/\D/g, '');
        if (pDigits.length === 12 && pDigits.startsWith('91')) {
          this.phone = pDigits.slice(2);
        }
      }

      const fieldsToValidate = [
        'fullName', 'phone', 'email', 'dob', 'gender', 'location', 'role',
        'degree', 'department', 'college', 'linkedin'
      ];
      if (this.applicationType !== 'Seasonal') {
        fieldsToValidate.push('resume');
      }
      if (this.role === 'Other') {
        fieldsToValidate.push('otherRole');
      }
        if (this.applicationType === 'Employee' && !this.isCampusStudent) {
          if (this.isFresher) {
            fieldsToValidate.push('graduationYear');
          } else {
            fieldsToValidate.push('currentCompany', 'currentDesignation', 'yearsOfExperience', 'noticePeriodDays', 'currentCtc', 'expectedCtc');
          }
        }

        let isValid = true;
        for (const field of fieldsToValidate) {
          const valid = this.validateField(field);
          if (!valid) {
            isValid = false;
          }
        }

        if (this.isCampusStudent && !this.isTechnicalRole()) {
          delete this.fieldErrors['campusProjectLinks'];
        } else if (this.isCampusStudent && this.isTechnicalRole()) {
          this.touchedFields['campusProjectLinks'] = true;
          const links = this.campusProjectLinks.map(l => l.trim()).filter(Boolean);
          if (links.length === 0) {
            this.fieldErrors['campusProjectLinks'] = 'Please provide at least one live deployed project URL (e.g. Vercel, Netlify).';
            isValid = false;
          } else {
            for (let i = 0; i < links.length; i++) {
              const link = links[i];
              if (this.isGitLink(link)) {
                this.fieldErrors['campusProjectLinks'] = `Project link #${i + 1} cannot be a GitHub/Git repository. Please provide a live deployed project URL.`;
                isValid = false;
                break;
              }
              if (!this.isValidUrl(link)) {
                this.fieldErrors['campusProjectLinks'] = `Project link #${i + 1} is not a valid URL (e.g. https://myproject.vercel.app).`;
                isValid = false;
                break;
              }
            }
          }
        }

        if (!isValid) {
          const missingLabels: string[] = [];
          if (this.fieldErrors['phone']) missingLabels.push('Phone Number');
          if (this.fieldErrors['email']) missingLabels.push('Email');
          if (this.fieldErrors['dob']) missingLabels.push('Date of Birth');
          if (this.fieldErrors['gender']) missingLabels.push('Gender');
          if (this.fieldErrors['location']) missingLabels.push('Place, District');
          if (this.fieldErrors['role']) missingLabels.push('Role');
          if (this.fieldErrors['resume']) missingLabels.push('Resume');
          if (this.fieldErrors['linkedin']) missingLabels.push('LinkedIn Profile URL');
          if (this.fieldErrors['campusProjectLinks']) missingLabels.push('Live Project Link');
          if (this.fieldErrors['degree']) missingLabels.push('Degree');
          if (this.fieldErrors['college']) missingLabels.push('College');
          if (this.fieldErrors['department']) missingLabels.push('Department');

          if (missingLabels.length > 0) {
            this.errorMessage.set(`Please fill in required fields: ${missingLabels.join(', ')}.`);
          } else {
            this.errorMessage.set('Please fill in all required fields accurately.');
          }

          setTimeout(() => {
            const firstError = document.querySelector('.has-error, .field-error-msg');
            if (firstError) {
              firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);

          return false;
        }
        return true;
      }

      validateStep4(): boolean {
        this.errorMessage.set('');

        // If assessment is disabled for this role, pass directly
        if (this.dynamicAssessment && this.dynamicAssessment.enabled === false) {
          return true;
        }

        if (this.dynamicAssessment && Array.isArray(this.dynamicAssessment.questions) && this.dynamicAssessment.questions.length > 0) {
          for (const q of this.dynamicAssessment.questions) {
            if (!q.required) continue;

            if (q.type === 'multiselect') {
              const tags = this.dynamicTags[q.id] || [];
              if (tags.length === 0) {
                this.errorMessage.set(`Please answer: "${q.label}"`);
                return false;
              }
              if (tags.includes('Other') && !this.dynamicOtherText[q.id]?.trim()) {
                this.errorMessage.set(`Please specify the "Other" option for: "${q.label}"`);
                return false;
              }
            } else if (q.type === 'links') {
              const links = (this.dynamicLinks[q.id] || []).map(l => l.trim()).filter(Boolean);
              const minRequired = q.minLinks || 1;
              if (links.length < minRequired) {
                this.errorMessage.set(`Please provide at least ${minRequired} live project link(s) for "${q.label}".`);
                return false;
              }
              for (let i = 0; i < links.length; i++) {
                const link = links[i];
                if (this.isGitLink(link)) {
                  this.errorMessage.set(`Project link #${i + 1} cannot be a GitHub/Git repository. Please provide a live deployed project URL.`);
                  return false;
                }
                if (!this.isValidUrl(link)) {
                  this.errorMessage.set(`Project link #${i + 1} is not a valid URL (e.g. https://myproject.vercel.app).`);
                  return false;
                }
              }
            } else {
              const ans = (this.dynamicAnswers[q.id] || '').toString().trim();
              if (!ans) {
                this.errorMessage.set(`Please answer: "${q.label}"`);
                return false;
              }
            }
          }
          return true;
        }

        return true;
      }

      nextStep() {
        this.errorMessage.set('');
        if (this.currentStep === 2) {
          const currentRole = this.role;
          if (!currentRole || !currentRole.trim() || !this.selectedRoleCardKey()) {
            this.errorMessage.set('Please select an opportunity or role before continuing.');
            return;
          }
          this.checkMatchingJd();
          if (this.matchingPosting() && this.applicationType !== 'Seasonal') {
            this.currentStep = 25;
          } else {
            this.currentStep = 3;
          }
        } else if (this.currentStep === 25) {
          if (this.isRoleBothEnabled()) {
            this.currentStep = 26;
          } else {
            this.applicationType = this.checkRoleIsEmployee(this.role) ? 'Employee' : 'Internship';
            this.currentStep = 3;
          }
        } else if (this.currentStep === 26) {
          if (!this.applicationType || (this.applicationType !== 'Employee' && this.applicationType !== 'Internship')) {
            this.errorMessage.set('Please select whether you are applying for Full-Time or Internship.');
            return;
          }
          this.currentStep = 3;
        } else if (this.currentStep === 3) {
          if (this.validateStep3()) {
            if (this.applicationType === 'Seasonal' || this.isCampusStudent) {
              this.openDeclaration();
            } else {
              this.setupRoleAssessment();
              if (this.hasAssessment) {
                this.currentStep = 4;
              } else {
                this.openDeclaration();
              }
            }
          }
        } else if (this.currentStep === 4) {
          if (this.validateStep4()) {
            this.openDeclaration();
          }
        }
      }

      prevStep() {
        this.errorMessage.set('');
        if (this.currentStep > 1) {
          if (this.currentStep === 4) {
            this.currentStep = 3;
          } else if (this.currentStep === 3) {
            if (this.isCampusStudent) {
              this.router.navigate(['/login']);
            } else if (this.isRoleBothEnabled()) {
              this.currentStep = 26;
            } else if (this.matchingPosting()) {
              this.currentStep = 25;
            } else {
              this.currentStep = 2;
            }
          } else if (this.currentStep === 26) {
            this.currentStep = 25;
          } else if (this.currentStep === 25) {
            this.currentStep = 2;
          } else if (this.currentStep === 2) {
            this.router.navigate(['/login']);
          } else {
            this.currentStep--;
          }
        }
      }

      openDeclaration() {
        this.errorMessage.set('');

        if (this.isDriveTimelineExpired) {
          this.errorMessage.set(this.driveTimelineExpiredMessage || 'Registration timeline for this campus drive has ended.');
          return;
        }

        if (!this.validateStep3()) {
          this.currentStep = 3;
          return;
        }

        if (this.hasAssessment && !this.validateStep4()) {
          this.currentStep = 4;
          return;
        }

        this.declareAccuracy = false;
        this.bgConsent = false;
        this.whatsappConsent = false;
        this.showDeclarationModal = true;
      }

      closeDeclaration() {
        this.showDeclarationModal = false;
      }

      submitForm() {
        if (this.isDriveTimelineExpired) {
          this.errorMessage.set(this.driveTimelineExpiredMessage || 'Registration timeline for this campus drive has ended.');
          return;
        }
        this.isLoading.set(true);
        this.errorMessage.set('');
        this.successMessage.set('');

        const finalRole = this.role === 'Other' ? this.otherRole : (this.role || this.targetRole);
        const fullPhoneNumber = `${this.countryCode} ${this.phone.trim()}`;

        // Compile Dynamic Assessment Answers
        let assessmentData: any = {};
        if (this.dynamicAssessment && Array.isArray(this.dynamicAssessment.questions) && this.dynamicAssessment.questions.length > 0) {
          for (const q of this.dynamicAssessment.questions) {
            if (q.type === 'multiselect') {
              const tags = [...(this.dynamicTags[q.id] || [])];
              if (tags.includes('Other') && this.dynamicOtherText[q.id]?.trim()) {
                const oIdx = tags.indexOf('Other');
                tags[oIdx] = `Other: ${this.dynamicOtherText[q.id].trim()}`;
              }
              assessmentData[q.label] = tags.join(', ');
            } else if (q.type === 'links') {
              const validLinks = (this.dynamicLinks[q.id] || []).map(l => l.trim()).filter(Boolean);
              assessmentData[q.label] = validLinks;
            } else {
              assessmentData[q.label] = this.dynamicAnswers[q.id] || '';
            }
          }
        }

        const basePayload: any = {
          companyCode: this.companyCode.toUpperCase(),
          fullName: this.toTitleCase(this.fullName.trim()),
          email: this.email.trim().toLowerCase(),
          phone: fullPhoneNumber,
          contact: fullPhoneNumber,
          countryCode: this.countryCode,
          dob: this.getFormattedDobForPayload() || this.dob,
          gender: this.gender,
          location: this.toTitleCase(this.location.trim()),
          maritalStatus: this.maritalStatus,
          degree: this.toTitleCase(this.degree.trim()),
          qualification: this.toTitleCase(this.degree.trim()),
          department: this.toTitleCase(this.department.trim()),
          college: this.toTitleCase(this.college.trim()),
          role: finalRole,
          linkedin: this.linkedin.trim(),
          resume: this.resumeBase64,
          assessmentAnswers: JSON.stringify(assessmentData),
          declaration: this.declareAccuracy.toString(),
          bgConsent: this.bgConsent.toString(),
          whatsappConsent: this.whatsappConsent.toString()
        };

        if (this.jobId) {
          basePayload.jobId = this.jobId;
        }

        if (this.campusStudentId) {
          basePayload.campusStudentId = this.campusStudentId;
        }

        if (this.applicationType === 'Internship' || this.applicationType === 'Walkin' || this.applicationType === 'Seasonal') {
          basePayload.year = this.year;
          basePayload.department = this.toTitleCase((this.department || this.degree).trim());
          basePayload.applicationType = this.applicationType === 'Seasonal' ? 'Internship' : this.applicationType;
          basePayload.emergencyContact = '';
          basePayload.emergencyPhone = '';
          if ((this.applicationType === 'Walkin' || this.applicationType === 'Seasonal') && this.selectedWalkinDriveId) {
            basePayload.walkinDriveId = this.selectedWalkinDriveId;
          }
        }

          if (this.applicationType === 'Employee' && !this.isCampusStudent) {
            basePayload.isExperienced = !this.isFresher;
            basePayload.experienceStatus = this.isFresher ? 'fresher' : 'experienced';
            basePayload.passingYear = this.graduationYear;
            basePayload.cgpaOrPercentage = this.cgpaOrPercentage;

            if (!this.isFresher) {
              basePayload.previousOrg = this.toTitleCase(this.currentCompany.trim());
              basePayload.designation = this.toTitleCase(this.currentDesignation.trim());
              basePayload.experienceYears = `${this.yearsOfExperience} Years`;
              basePayload.currentCtc = this.currentCtc;
              basePayload.expectedCtc = this.expectedCtc;
              basePayload.noticePeriod = this.noticePeriodDays;
              basePayload.joiningDate = this.availableJoiningDate;
            }
          }

          let apiCall;
          if (this.isCampusStudent && this.campusStudentId) {
            basePayload.campusStudentId = this.campusStudentId;
            basePayload.projectLinks = this.campusProjectLinks.map(l => l.trim()).filter(Boolean);
            apiCall = this.apiService.submitCampusStudentProfile(basePayload);
          } else if (this.applicationType === 'Walkin' || this.applicationType === 'Seasonal') {
            apiCall = this.apiService.walkinApply(basePayload);
          } else if (this.applicationType === 'Employee') {
            apiCall = this.apiService.addEmployee(basePayload);
          } else {
            apiCall = this.apiService.addIntern(basePayload);
          }

          apiCall.subscribe({
            next: (res: any) => {
              this.isLoading.set(false);
              this.showDeclarationModal = false;
              if (this.isCampusStudent) {
                this.successMessage.set('Campus registration details submitted successfully. Your profile has been updated for this campus hiring drive.');
              } else {
                this.successMessage.set('Application submitted successfully.');
              }
              sessionStorage.removeItem('campus_onboarding_student');
              sessionStorage.removeItem('campus_onboarding_company');
              setTimeout(() => {
                this.router.navigate(['/login']);
              }, 4000);
            },
            error: (err) => {
              this.isLoading.set(false);
              let errorMsg = 'Submission failed. Please verify your details.';
              if (err.error) {
                if (typeof err.error === 'string') {
                  try {
                    const parsed = JSON.parse(err.error);
                    errorMsg = parsed.message || parsed.msg || parsed.error || err.error;
                  } catch {
                    errorMsg = err.error;
                  }
                } else if (typeof err.error === 'object') {
                  errorMsg = err.error.message || err.error.msg || err.error.error || errorMsg;
                }
              } else if (err.message) {
                errorMsg = err.message;
              }
              this.errorMessage.set(errorMsg);
              if (errorMsg.toLowerCase().includes('email')) {
                this.fieldErrors['email'] = errorMsg;
                this.touchedFields['email'] = true;
              }
            }
          });
        }
      }
