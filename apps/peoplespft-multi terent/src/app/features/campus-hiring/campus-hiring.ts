import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AlertService } from '../../shared/services/alert';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Mortarboard02Icon,
  Building01Icon,
  Calendar01Icon,
  Calendar03Icon,
  UserGroupIcon,
  UserIcon,
  Mail01Icon,
  CallIcon,
  ArrowRight01Icon,
  ArrowLeft01Icon,
  Upload01Icon,
  Download01Icon,
  Search01Icon,
  PlusSignIcon,
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  File01Icon,
  Link01Icon,
  Delete01Icon,
  FilterIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  RefreshIcon,
  PencilEdit02Icon
} from '@hugeicons/core-free-icons';
import * as XLSX from 'xlsx';

export interface IRoundExamMapping {
  role: string;
  examId: string;
  examTitle: string;
}

export interface IRoundConfig {
  roundId: string;
  name: string;
  order: number;
  isActive: boolean;
  description?: string;
  isHireProLinked?: boolean;
  hireProExamMapping?: IRoundExamMapping[];
}

export interface IExcelMapping {
  rollNumber: string;
  fullName: string;
  dob: string;
  email: string;
  phone: string;
  department: string;
  degree: string;
  cgpa: string;
}

@Component({
  selector: 'app-campus-hiring',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HugeiconsIconComponent],
  templateUrl: './campus-hiring.html',
  styleUrls: ['./campus-hiring.css']
})
export class CampusHiringComponent implements OnInit {
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);

  // Hugeicons
  readonly Mortarboard02Icon = Mortarboard02Icon;
  readonly Building01Icon = Building01Icon;
  readonly Calendar01Icon = Calendar01Icon;
  readonly Calendar03Icon = Calendar03Icon;
  readonly UserGroupIcon = UserGroupIcon;
  readonly UserIcon = UserIcon;
  readonly Mail01Icon = Mail01Icon;
  readonly CallIcon = CallIcon;
  readonly ArrowRight01Icon = ArrowRight01Icon;
  readonly ArrowLeft01Icon = ArrowLeft01Icon;
  readonly Upload01Icon = Upload01Icon;
  readonly Download01Icon = Download01Icon;
  readonly Search01Icon = Search01Icon;
  readonly PlusSignIcon = PlusSignIcon;
  readonly CheckmarkCircle02Icon = CheckmarkCircle02Icon;
  readonly CancelCircleIcon = CancelCircleIcon;
  readonly File01Icon = File01Icon;
  readonly Link01Icon = Link01Icon;
  readonly Delete01Icon = Delete01Icon;
  readonly FilterIcon = FilterIcon;
  readonly ArrowUp01Icon = ArrowUp01Icon;
  readonly ArrowDown01Icon = ArrowDown01Icon;
  readonly RefreshIcon = RefreshIcon;
  readonly PencilEdit02Icon = PencilEdit02Icon;

  // View state
  currentLevel = signal<'colleges' | 'college-detail' | 'drives-list' | 'drive-detail'>('colleges');
  isLoading = signal<boolean>(false);

  // Data signals
  colleges = signal<any[]>([]);
  selectedCollege = signal<any | null>(null);
  selectedAcademicYear = signal<string | null>(null);
  selectedDrive = signal<any | null>(null);
  students = signal<any[]>([]);
  availableCompanyRoles = signal<string[]>([]);

  // Search & Filter signals
  searchDirectory = signal<string>('');
  studentSearch = signal<string>('');
  selectedRoundTab = signal<string | number>('all');
  selectedStatusTab = signal<string>('all');
  selectedStudentIds = signal<string[]>([]);

  // Modals
  showAddCollegeModal = signal<boolean>(false);
  showEditCollegeModal = signal<boolean>(false);
  isUpdatingCollege = signal<boolean>(false);
  showAddYearModal = signal<boolean>(false);
  showCreateDriveModal = signal<boolean>(false);
  showEditDriveModal = signal<boolean>(false);
  isUpdatingDrive = signal<boolean>(false);
  editingDriveId = signal<string | null>(null);
  showExcelImportModal = signal<boolean>(false);
  showStudentDetailsModal = signal<boolean>(false);
  selectedStudent = signal<any | null>(null);

  // College Edit Form
  editCollegeForm = {
    id: '',
    name: '',
    address: '',
    university: '',
    status: 'Active',
    officerName: '',
    officerDesignation: 'Placement Officer',
    officerEmail: '',
    officerPhone: '',
    officerAlternatePhone: '',
    officerLinkedin: '',
    mouDriveLink: ''
  };
  editLogoFile: File | null = null;
  editBannerFile: File | null = null;
  editMouFile: File | null = null;
  editLogoPreview = signal<string>('');
  editBannerPreview = signal<string>('');

  // College Onboarding Form
  collegeForm = {
    name: '',
    address: '',
    university: '',
    officerName: '',
    officerDesignation: 'Placement Officer',
    officerEmail: '',
    officerPhone: '',
    officerAlternatePhone: '',
    officerLinkedin: '',
    mouDriveLink: '',
    initialAcademicYear: '2025-2026',
    initialYearNotes: ''
  };
  logoFile: File | null = null;
  bannerFile: File | null = null;
  mouFile: File | null = null;
  logoPreview = signal<string>('');
  bannerPreview = signal<string>('');

  // Academic Year Form
  yearForm = {
    year: '',
    startDate: '',
    endDate: '',
    notes: ''
  };

  // Create Drive Form
  driveForm = {
    title: '',
    academicYear: '',
    roles: [] as string[],
    startDate: '',
    endDate: '',
    description: '',
    rounds: [] as IRoundConfig[]
  };
  customRoundName = signal<string>('');

  // Excel Parser & Mapper State
  excelFile: File | null = null;
  excelHeaders = signal<string[]>([]);
  excelRawRows = signal<any[]>([]);
  excelConflictResolution = signal<'skip' | 'update'>('skip');
  excelMapping = signal<IExcelMapping>({
    rollNumber: '',
    fullName: '',
    dob: '',
    email: '',
    phone: '',
    department: '',
    degree: '',
    cgpa: ''
  });
  isParsingExcel = signal<boolean>(false);
  isImportingStudents = signal<boolean>(false);

  // Computed: Filtered Colleges
  filteredColleges = computed(() => {
    const query = (this.searchDirectory() || '').toLowerCase().trim();
    const list = this.colleges() || [];
    if (!query) return list;
    return list.filter(c =>
      (c.name || '').toLowerCase().includes(query) ||
      (c.university || '').toLowerCase().includes(query) ||
      (c.address || '').toLowerCase().includes(query) ||
      (c.placementOfficer?.name || '').toLowerCase().includes(query)
    );
  });

  // Computed: Academic Year Drives
  currentYearDrives = computed(() => {
    const college = this.selectedCollege();
    const year = this.selectedAcademicYear();
    if (!college || !college.drives) return [];
    if (!year) return college.drives || [];
    return (college.drives || []).filter((d: any) => d.academicYear === year);
  });

  // HirePro Integration Signals
  hireProExams = signal<any[]>([]);
  isLoadingHireProExams = signal<boolean>(false);

  // Computed: Filtered Students
  filteredStudents = computed(() => {
    const list = this.students() || [];
    const roundTab = this.selectedRoundTab();
    const statusTab = this.selectedStatusTab();
    const query = (this.studentSearch() || '').toLowerCase().trim();

    return list.filter(s => {
      // Round filter
      if (roundTab !== 'all' && s.currentRoundOrder !== Number(roundTab)) {
        return false;
      }
      // Status filter
      if (statusTab !== 'all' && s.overallStatus !== statusTab) {
        return false;
      }
      // Text search
      if (query) {
        const matchName = (s.fullName || '').toLowerCase().includes(query);
        const matchRoll = (s.rollNumber || '').toLowerCase().includes(query);
        const matchEmail = (s.email || '').toLowerCase().includes(query);
        const matchPhone = (s.phone || '').toLowerCase().includes(query);
        const matchDept = (s.department || '').toLowerCase().includes(query);
        return matchName || matchRoll || matchEmail || matchPhone || matchDept;
      }
      return true;
    });
  });

  // Computed: Live Excel Preview Rows (up to 3 rows)
  mappedPreviewRows = computed(() => {
    const raw = this.excelRawRows().slice(0, 3);
    const map = this.excelMapping();

    return raw.map(row => ({
      rollNumber: row[map.rollNumber] || '—',
      fullName: row[map.fullName] || '—',
      dob: row[map.dob] || '—',
      email: row[map.email] || '—',
      phone: row[map.phone] || '—',
      department: row[map.department] || '—',
      cgpa: row[map.cgpa] || '—'
    }));
  });

  ngOnInit(): void {
    this.loadColleges();
    this.loadCompanyRoles();
    this.loadHireProExams();
  }

  loadHireProExams(): void {
    this.isLoadingHireProExams.set(true);
    this.apiService.getHireProExams().subscribe({
      next: (res) => {
        this.hireProExams.set(res?.exams || []);
        this.isLoadingHireProExams.set(false);
      },
      error: (err) => {
        console.warn('Could not load HirePro exams:', err);
        this.isLoadingHireProExams.set(false);
      }
    });
  }

  getCollegeInitials(name: string): string {
    if (!name) return 'CO';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  getShortRoundName(name: string): string {
    if (!name) return '';
    const lower = name.toLowerCase();
    if (lower.includes('resume')) return 'Resume';
    if (lower.includes('aptitude')) return 'Aptitude';
    if (lower.includes('group discussion') || lower.includes('gd')) return 'GD';
    if (lower.includes('one-to-one') || lower.includes('1:1') || lower.includes('interview')) return 'Interview';
    if (lower.includes('task') || lower.includes('test')) return 'Task';
    return name.length > 14 ? name.substring(0, 12) + '...' : name;
  }

  resolveMediaUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    const base = this.apiService.getBaseUrl();
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${base}${cleanUrl}`;
  }

  // Load Colleges Directory
  loadColleges(): void {
    this.isLoading.set(true);
    this.apiService.getColleges().subscribe({
      next: (data) => {
        this.colleges.set(data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Failed to load colleges');
      }
    });
  }

  // Load selectable roles from Company Settings in Database
  loadCompanyRoles(): void {
    this.apiService.getCompanySettings().subscribe({
      next: (res: any) => {
        const rolesList: string[] = [];
        const settings = res?.settings || res?.data?.settings || res || {};

        // 1. Defined Roles from Settings (Company Model in DB)
        if (settings.roles && Array.isArray(settings.roles)) {
          settings.roles.forEach((r: any) => {
            const name = typeof r === 'string' ? r : r.name;
            if (name && name !== 'Other' && !rolesList.includes(name)) rolesList.push(name);
          });
        }

        // 2. Employee Roles
        if (settings.employeeRoles && Array.isArray(settings.employeeRoles)) {
          settings.employeeRoles.forEach((r: any) => {
            if (r && r !== 'Other' && !rolesList.includes(r)) rolesList.push(r);
          });
        }

        // 3. Intern Roles
        if (settings.internRoles && Array.isArray(settings.internRoles)) {
          settings.internRoles.forEach((r: any) => {
            if (r && r !== 'Other' && !rolesList.includes(r)) rolesList.push(r);
          });
        }

        // 4. Career Postings from Company Settings
        const postings = settings.careerPostings || res?.careerPostings;
        if (postings && Array.isArray(postings)) {
          postings.forEach((p: any) => {
            if (p.title && !rolesList.includes(p.title)) rolesList.push(p.title);
          });
        }

        if (rolesList.length === 0) {
          rolesList.push('Software Developer', 'Frontend Developer', 'Backend Developer', 'QA Engineer', 'Product Designer');
        }
        this.availableCompanyRoles.set(rolesList);
      },
      error: () => {
        this.availableCompanyRoles.set(['Software Developer', 'Full Stack Developer', 'Data Analyst', 'QA Engineer']);
      }
    });
  }

  // ==========================================
  // LEVEL 1 -> LEVEL 2: Select College
  // ==========================================
  selectCollege(college: any): void {
    this.isLoading.set(true);
    this.apiService.getCollegeById(college._id).subscribe({
      next: (res) => {
        this.selectedCollege.set(res);
        // Default select latest academic year
        if (res.academicYearsWithStats && res.academicYearsWithStats.length > 0) {
          this.selectedAcademicYear.set(res.academicYearsWithStats[0].year);
        } else {
          this.selectedAcademicYear.set(null);
        }
        this.currentLevel.set('college-detail');
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Error loading college details');
      }
    });
  }

  selectAcademicYear(year: string): void {
    this.selectedAcademicYear.set(year);
  }

  openDrivesForYear(year: string): void {
    this.selectedAcademicYear.set(year);
    this.currentLevel.set('drives-list');
  }

  backToAcademicYears(): void {
    this.currentLevel.set('college-detail');
  }

  backToColleges(): void {
    this.selectedCollege.set(null);
    this.selectedAcademicYear.set(null);
    this.currentLevel.set('colleges');
    this.loadColleges();
  }

  // ==========================================
  // LEVEL 2/3 -> LEVEL 4: Select Drive
  // ==========================================
  selectDrive(drive: any): void {
    this.isLoading.set(true);
    this.apiService.getCampusDriveById(drive._id).subscribe({
      next: (res) => {
        this.selectedDrive.set(res);
        this.selectedRoundTab.set('all');
        this.selectedStatusTab.set('all');
        this.selectedStudentIds.set([]);
        this.currentLevel.set('drive-detail');
        this.loadStudentsForDrive(res._id);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Error loading drive details');
      }
    });
  }

  backToCollegeDetail(): void {
    if (this.selectedAcademicYear()) {
      this.currentLevel.set('drives-list');
    } else {
      this.currentLevel.set('college-detail');
    }
  }

  getRoundCandidateCount(roundOrder: number): number {
    return (this.students() || []).filter(s => s.currentRoundOrder === roundOrder).length;
  }

  loadStudentsForDrive(driveId: string): void {
    this.isLoading.set(true);
    this.apiService.getCampusStudents(driveId).subscribe({
      next: (data) => {
        this.students.set(data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Error loading student list');
      }
    });

    // Also refresh drive details in background to sync backend stats
    this.apiService.getCampusDriveById(driveId).subscribe({
      next: (res) => this.selectedDrive.set(res),
      error: () => {}
    });
  }

  // ==========================================
  // COLLEGE ONBOARDING MODAL
  // ==========================================
  openAddCollegeModal(): void {
    this.collegeForm = {
      name: '',
      address: '',
      university: '',
      officerName: '',
      officerDesignation: 'Placement Officer',
      officerEmail: '',
      officerPhone: '',
      officerAlternatePhone: '',
      officerLinkedin: '',
      mouDriveLink: '',
      initialAcademicYear: '2025-2026',
      initialYearNotes: ''
    };
    this.logoFile = null;
    this.bannerFile = null;
    this.mouFile = null;
    this.logoPreview.set('');
    this.bannerPreview.set('');
    this.showAddCollegeModal.set(true);
  }

  closeAddCollegeModal(): void {
    this.showAddCollegeModal.set(false);
  }

  onLogoSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.logoFile = file;
      const reader = new FileReader();
      reader.onload = () => this.logoPreview.set(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  onBannerSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.bannerFile = file;
      const reader = new FileReader();
      reader.onload = () => this.bannerPreview.set(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  onMouFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.mouFile = file;
    }
  }

  submitAddCollege(): void {
    if (!this.collegeForm.name || !this.collegeForm.address) {
      this.alertService.show('College Name and Address are required.');
      return;
    }
    if (!this.collegeForm.officerName || !this.collegeForm.officerEmail || !this.collegeForm.officerPhone) {
      this.alertService.show('Placement Officer Name, Email, and Phone are required.');
      return;
    }

    const formData = new FormData();
    formData.append('name', this.collegeForm.name);
    formData.append('address', this.collegeForm.address);
    formData.append('university', this.collegeForm.university);
    formData.append('officerName', this.collegeForm.officerName);
    formData.append('officerDesignation', this.collegeForm.officerDesignation);
    formData.append('officerEmail', this.collegeForm.officerEmail);
    formData.append('officerPhone', this.collegeForm.officerPhone);
    formData.append('officerAlternatePhone', this.collegeForm.officerAlternatePhone);
    formData.append('officerLinkedin', this.collegeForm.officerLinkedin);
    formData.append('mouDriveLink', this.collegeForm.mouDriveLink);
    formData.append('academicYear', this.collegeForm.initialAcademicYear);
    formData.append('academicYearNotes', this.collegeForm.initialYearNotes);

    if (this.logoFile) formData.append('logo', this.logoFile);
    if (this.bannerFile) formData.append('banner', this.bannerFile);
    if (this.mouFile) formData.append('mouDocument', this.mouFile);

    this.isLoading.set(true);
    this.apiService.createCollege(formData).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.closeAddCollegeModal();
        this.alertService.show('College onboarded successfully!');
        this.loadColleges();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Error creating college');
      }
    });
  }

  // ==========================================
  // EDIT COLLEGE MODAL
  // ==========================================
  openEditCollegeModal(college?: any): void {
    const col = college || this.selectedCollege();
    if (!col) return;

    this.editCollegeForm = {
      id: col._id,
      name: col.name || '',
      address: col.address || '',
      university: col.university || '',
      status: col.status || 'Active',
      officerName: col.placementOfficer?.name || '',
      officerDesignation: col.placementOfficer?.designation || 'Placement Officer',
      officerEmail: col.placementOfficer?.email || '',
      officerPhone: col.placementOfficer?.phone || '',
      officerAlternatePhone: col.placementOfficer?.alternatePhone || '',
      officerLinkedin: col.placementOfficer?.linkedin || '',
      mouDriveLink: col.mouDriveLink || ''
    };
    this.editLogoPreview.set(col.logoUrl ? this.resolveMediaUrl(col.logoUrl) : '');
    this.editBannerPreview.set(col.bannerUrl ? this.resolveMediaUrl(col.bannerUrl) : '');
    this.editLogoFile = null;
    this.editBannerFile = null;
    this.editMouFile = null;
    this.showEditCollegeModal.set(true);
  }

  closeEditCollegeModal(): void {
    this.showEditCollegeModal.set(false);
  }

  onEditLogoSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.editLogoFile = file;
      const reader = new FileReader();
      reader.onload = () => this.editLogoPreview.set(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  onEditBannerSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.editBannerFile = file;
      const reader = new FileReader();
      reader.onload = () => this.editBannerPreview.set(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  onEditMouFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.editMouFile = file;
    }
  }

  submitUpdateCollege(): void {
    if (!this.editCollegeForm.name || !this.editCollegeForm.address) {
      this.alertService.show('College Name and Address are required.');
      return;
    }
    if (!this.editCollegeForm.officerName || !this.editCollegeForm.officerEmail || !this.editCollegeForm.officerPhone) {
      this.alertService.show('Placement Officer Name, Email, and Phone are required.');
      return;
    }

    const formData = new FormData();
    formData.append('name', this.editCollegeForm.name.trim());
    formData.append('address', this.editCollegeForm.address.trim());
    formData.append('university', this.editCollegeForm.university.trim());
    formData.append('status', this.editCollegeForm.status);
    formData.append('officerName', this.editCollegeForm.officerName.trim());
    formData.append('officerDesignation', this.editCollegeForm.officerDesignation.trim());
    formData.append('officerEmail', this.editCollegeForm.officerEmail.trim());
    formData.append('officerPhone', this.editCollegeForm.officerPhone.trim());
    formData.append('officerAlternatePhone', this.editCollegeForm.officerAlternatePhone.trim());
    formData.append('officerLinkedin', this.editCollegeForm.officerLinkedin.trim());
    formData.append('mouDriveLink', this.editCollegeForm.mouDriveLink.trim());

    if (this.editLogoFile) formData.append('logo', this.editLogoFile);
    if (this.editBannerFile) formData.append('banner', this.editBannerFile);
    if (this.editMouFile) formData.append('mouDocument', this.editMouFile);

    this.isUpdatingCollege.set(true);
    this.apiService.updateCollege(this.editCollegeForm.id, formData).subscribe({
      next: (res) => {
        this.isUpdatingCollege.set(false);
        this.closeEditCollegeModal();
        this.alertService.show('College details updated successfully!');

        // Update currently viewed college if matching
        if (this.selectedCollege()?._id === this.editCollegeForm.id) {
          this.apiService.getCollegeById(this.editCollegeForm.id).subscribe({
            next: (updatedCol) => this.selectedCollege.set(updatedCol),
            error: () => {}
          });
        }
        this.loadColleges();
      },
      error: (err) => {
        this.isUpdatingCollege.set(false);
        this.alertService.show(err.error?.message || 'Error updating college');
      }
    });
  }

  downloadCollegeMou(collegeId: string): void {
    this.isLoading.set(true);
    this.apiService.downloadCollegeMou(collegeId).subscribe({
      next: (blob) => {
        this.isLoading.set(false);
        const college = this.selectedCollege();
        const fileName = college?.mouDocument?.fileName || 'Signed_MOU.pdf';
        const blobUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(blobUrl);
      },
      error: () => {
        this.isLoading.set(false);
        const url = this.apiService.downloadCollegeMouUrl(collegeId);
        window.open(url, '_blank');
      }
    });
  }

  // ==========================================
  // ACADEMIC YEAR MODAL
  // ==========================================
  openAddYearModal(): void {
    this.yearForm = {
      year: '',
      startDate: '',
      endDate: '',
      notes: ''
    };
    this.showAddYearModal.set(true);
  }

  closeAddYearModal(): void {
    this.showAddYearModal.set(false);
  }

  submitAddYear(): void {
    if (!this.yearForm.year || !this.yearForm.year.trim()) {
      this.alertService.show('Academic Year string (e.g. 2025-2026) is required.');
      return;
    }
    const college = this.selectedCollege();
    if (!college) return;

    this.isLoading.set(true);
    this.apiService.addAcademicYear(college._id, this.yearForm).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.closeAddYearModal();
        this.alertService.show('Academic year added successfully!');
        this.selectCollege(college);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Error adding academic year');
      }
    });
  }

  // ==========================================
  // CREATE CAMPUS DRIVE MODAL
  // ==========================================
  openCreateDriveModal(): void {
    const year = this.selectedAcademicYear() || '2025-2026';
    this.driveForm = {
      title: '',
      academicYear: year,
      roles: [],
      startDate: '',
      endDate: '',
      description: '',
      rounds: [
        { roundId: 'r_resume', name: 'Project Shortlisting from Resume', order: 1, isActive: true },
        { roundId: 'r_aptitude', name: 'Aptitude Test', order: 2, isActive: true },
        { roundId: 'r_gd', name: 'Group Discussion', order: 3, isActive: true },
        { roundId: 'r_interview', name: 'One-to-One Interview', order: 4, isActive: true },
        { roundId: 'r_task', name: 'Technical Task / Test', order: 5, isActive: true }
      ]
    };
    this.customRoundName.set('');
    this.loadHireProExams();
    this.showCreateDriveModal.set(true);
  }

  closeCreateDriveModal(): void {
    this.showCreateDriveModal.set(false);
  }

  toggleRoleSelection(role: string): void {
    const idx = this.driveForm.roles.indexOf(role);
    if (idx >= 0) {
      this.driveForm.roles.splice(idx, 1);
    } else {
      this.driveForm.roles.push(role);
    }
  }

  isRoleSelected(role: string): boolean {
    return this.driveForm.roles.includes(role);
  }

  moveRoundUp(index: number): void {
    if (index <= 0) return;
    const rounds = [...this.driveForm.rounds];
    const temp = rounds[index];
    rounds[index] = rounds[index - 1];
    rounds[index - 1] = temp;
    // Re-index orders
    rounds.forEach((r, i) => r.order = i + 1);
    this.driveForm.rounds = rounds;
  }

  moveRoundDown(index: number): void {
    if (index >= this.driveForm.rounds.length - 1) return;
    const rounds = [...this.driveForm.rounds];
    const temp = rounds[index];
    rounds[index] = rounds[index + 1];
    rounds[index + 1] = temp;
    // Re-index orders
    rounds.forEach((r, i) => r.order = i + 1);
    this.driveForm.rounds = rounds;
  }

  addCustomRound(): void {
    const name = this.customRoundName().trim();
    if (!name) return;
    const nextOrder = this.driveForm.rounds.length + 1;
    this.driveForm.rounds.push({
      roundId: `r_${Date.now()}`,
      name,
      order: nextOrder,
      isActive: true
    });
    this.customRoundName.set('');
  }

  removeRound(index: number): void {
    this.driveForm.rounds.splice(index, 1);
    this.driveForm.rounds.forEach((r, i) => r.order = i + 1);
  }

  toggleHireProLink(index: number): void {
    const round = this.driveForm.rounds[index];
    if (!round) return;

    if (round.order === 1 || (round.name || '').toLowerCase().includes('resume')) {
      this.alertService.show('Round 1 (Resume Shortlisting) is a document screening stage and cannot be linked with HirePro. Link HirePro on assessment rounds (Round 2 onwards).');
      return;
    }

    round.isHireProLinked = !round.isHireProLinked;
    if (round.isHireProLinked) {
      if (!round.hireProExamMapping) {
        round.hireProExamMapping = [];
      }
      if (this.hireProExams().length === 0) {
        this.loadHireProExams();
      }
    }
  }

  getExamMappingForRole(round: IRoundConfig, role: string): string {
    if (!round.hireProExamMapping || !Array.isArray(round.hireProExamMapping)) return '';
    const cleanRole = (role || '').trim().toLowerCase();
    const mapping = round.hireProExamMapping.find(m => (m.role || '').trim().toLowerCase() === cleanRole);
    return mapping ? mapping.examId : '';
  }

  setExamMappingForRole(round: IRoundConfig, role: string, examId: string): void {
    if (!round.hireProExamMapping || !Array.isArray(round.hireProExamMapping)) {
      round.hireProExamMapping = [];
    }
    const cleanRole = (role || '').trim().toLowerCase();
    const idx = round.hireProExamMapping.findIndex(m => (m.role || '').trim().toLowerCase() === cleanRole);
    const selectedExam = this.hireProExams().find(e => e._id === examId);
    const examTitle = selectedExam ? selectedExam.title : '';

    if (idx >= 0) {
      if (!examId) {
        round.hireProExamMapping.splice(idx, 1);
      } else {
        round.hireProExamMapping[idx].examId = examId;
        round.hireProExamMapping[idx].examTitle = examTitle;
        round.hireProExamMapping[idx].role = role;
      }
    } else if (examId) {
      round.hireProExamMapping.push({ role, examId, examTitle });
    }
  }

  getStudentMappedExams(student: any): { role: string; examTitle: string; examId: string; roundName: string; isCurrent: boolean }[] {
    const drive = this.selectedDrive();
    if (!drive || !drive.rounds) return [];

    // Check candidate's current round first if order > 1
    const currentRound = (drive.rounds || []).find((r: any) => r.order === student.currentRoundOrder && r.isActive && r.isHireProLinked && r.order > 1);
    // Or find any active round in this drive linked with HirePro (order > 1)
    const targetRound = currentRound || (drive.rounds || []).find((r: any) => r.isHireProLinked && r.isActive && r.order > 1);
    if (!targetRound || !Array.isArray(targetRound.hireProExamMapping) || targetRound.hireProExamMapping.length === 0) {
      return [];
    }

    // Determine the student's single chosen/applied role
    const primaryRole = (student.selectedRole || (student.appliedRoles && student.appliedRoles[0]) || '').trim();

    let matchedMapping = null;
    if (primaryRole) {
      matchedMapping = targetRound.hireProExamMapping.find((m: any) => 
        (m.role || '').trim().toLowerCase() === primaryRole.toLowerCase()
      );
    }

    if (!matchedMapping) {
      matchedMapping = targetRound.hireProExamMapping[0];
    }

    if (matchedMapping && matchedMapping.examTitle) {
      return [{
        role: matchedMapping.role,
        examTitle: matchedMapping.examTitle,
        examId: matchedMapping.examId,
        roundName: `Round ${targetRound.order}: ${targetRound.name}`,
        isCurrent: targetRound.order === student.currentRoundOrder
      }];
    }

    return [];
  }

  getStudentDisplayRole(student: any): string {
    if (!student) return '';
    if (student.selectedRole && student.selectedRole.trim()) {
      return student.selectedRole.trim();
    }
    if (Array.isArray(student.appliedRoles) && student.appliedRoles.length > 0) {
      const filtered = student.appliedRoles.filter((r: any) => typeof r === 'string' && r.trim());
      if (filtered.length > 0) {
        return filtered.join(', ');
      }
    }
    if (student.role && typeof student.role === 'string' && student.role.trim()) {
      return student.role.trim();
    }
    if (student.appliedRole && typeof student.appliedRole === 'string' && student.appliedRole.trim()) {
      return student.appliedRole.trim();
    }
    if (typeof student.appliedRoles === 'string' && student.appliedRoles.trim()) {
      return student.appliedRoles.trim();
    }
    return '';
  }

  getSelectedRoundHireProInfo(): { roundName: string; mappings: any[] } | null {
    const drive = this.selectedDrive();
    if (!drive || !drive.rounds) return null;

    const roundTab = this.selectedRoundTab();
    let targetRound = null;

    if (roundTab !== 'all') {
      targetRound = (drive.rounds || []).find((r: any) => r.order === Number(roundTab) && r.isHireProLinked && r.isActive);
    } else {
      // If "all" tab, find first round with HirePro linked
      targetRound = (drive.rounds || []).find((r: any) => r.isHireProLinked && r.isActive);
    }

    if (!targetRound || !Array.isArray(targetRound.hireProExamMapping) || targetRound.hireProExamMapping.length === 0) {
      return null;
    }

    return {
      roundName: targetRound.name,
      mappings: targetRound.hireProExamMapping
    };
  }

  submitCreateDrive(): void {
    const college = this.selectedCollege();
    if (!college) return;
    if (!this.driveForm.title || !this.driveForm.startDate || !this.driveForm.endDate) {
      this.alertService.show('Drive Title, Start Date, and End Date are required.');
      return;
    }
    if (this.driveForm.roles.length === 0) {
      this.alertService.show('Please select at least one role for this campus drive.');
      return;
    }

    const payload = {
      collegeId: college._id,
      academicYear: this.driveForm.academicYear,
      title: this.driveForm.title,
      roles: this.driveForm.roles,
      startDate: this.driveForm.startDate,
      endDate: this.driveForm.endDate,
      description: this.driveForm.description,
      rounds: this.driveForm.rounds
    };

    this.isLoading.set(true);
    this.apiService.createCampusDrive(payload).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.closeCreateDriveModal();
        this.alertService.show('Campus Drive created successfully!');
        const keepLevel = this.currentLevel();
        const activeYear = this.driveForm.academicYear || this.selectedAcademicYear();
        this.apiService.getCollegeById(college._id).subscribe({
          next: (c) => {
            this.selectedCollege.set(c);
            if (activeYear) {
              this.selectedAcademicYear.set(activeYear);
            }
            if (keepLevel === 'drives-list') {
              this.currentLevel.set('drives-list');
            }
          }
        });
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Error creating campus drive');
      }
    });
  }

  // ==========================================
  // EDIT CAMPUS DRIVE MODAL
  // ==========================================
  openEditDriveModal(drive: any, event?: Event): void {
    if (event) event.stopPropagation();
    this.editingDriveId.set(drive._id);

    const formatToDateInput = (val: any) => {
      if (!val) return '';
      const d = new Date(val);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    };

    this.driveForm = {
      title: drive.title || '',
      academicYear: drive.academicYear || this.selectedAcademicYear() || '',
      roles: Array.isArray(drive.roles) ? [...drive.roles] : [],
      startDate: formatToDateInput(drive.startDate),
      endDate: formatToDateInput(drive.endDate),
      description: drive.description || '',
      rounds: Array.isArray(drive.rounds) && drive.rounds.length > 0 
        ? JSON.parse(JSON.stringify(drive.rounds))
        : [
            { roundId: 'r_resume', name: 'Project Shortlisting from Resume', order: 1, isActive: true },
            { roundId: 'r_aptitude', name: 'Aptitude Test', order: 2, isActive: true },
            { roundId: 'r_gd', name: 'Group Discussion', order: 3, isActive: true },
            { roundId: 'r_interview', name: 'One-to-One Interview', order: 4, isActive: true },
            { roundId: 'r_task', name: 'Technical Task / Test', order: 5, isActive: true }
          ]
    };
    this.customRoundName.set('');
    this.loadHireProExams();
    this.showEditDriveModal.set(true);
  }

  closeEditDriveModal(): void {
    this.showEditDriveModal.set(false);
    this.editingDriveId.set(null);
  }

  submitUpdateDrive(): void {
    const driveId = this.editingDriveId();
    if (!driveId) return;

    if (!this.driveForm.title || !this.driveForm.startDate || !this.driveForm.endDate) {
      this.alertService.show('Drive Title, Start Date, and End Date are required.');
      return;
    }
    if (this.driveForm.roles.length === 0) {
      this.alertService.show('Please select at least one role for this campus drive.');
      return;
    }

    const payload = {
      academicYear: this.driveForm.academicYear,
      title: this.driveForm.title,
      roles: this.driveForm.roles,
      startDate: this.driveForm.startDate,
      endDate: this.driveForm.endDate,
      description: this.driveForm.description,
      rounds: this.driveForm.rounds
    };

    this.isUpdatingDrive.set(true);
    this.apiService.updateCampusDrive(driveId, payload).subscribe({
      next: (res) => {
        this.isUpdatingDrive.set(false);
        this.closeEditDriveModal();
        this.alertService.show('Campus Drive updated successfully!');

        // Update selectedDrive if currently viewing details
        if (this.selectedDrive() && this.selectedDrive()._id === driveId) {
          this.selectedDrive.update(d => ({ ...d, ...res.drive }));
        }

        // Refresh current college to update drive lists
        const college = this.selectedCollege();
        if (college) {
          const keepLevel = this.currentLevel();
          const activeYear = this.driveForm.academicYear || this.selectedAcademicYear();
          this.apiService.getCollegeById(college._id).subscribe({
            next: (c) => {
              this.selectedCollege.set(c);
              if (activeYear) {
                this.selectedAcademicYear.set(activeYear);
              }
              if (keepLevel === 'drives-list' || keepLevel === 'drive-detail') {
                this.currentLevel.set(keepLevel);
              }
            }
          });
        }
      },
      error: (err) => {
        this.isUpdatingDrive.set(false);
        this.alertService.show(err.error?.message || 'Error updating campus drive');
      }
    });
  }

  // ==========================================
  // EXCEL IMPORT & ATTRIBUTE MAPPING
  // ==========================================
  openExcelImportModal(): void {
    this.excelFile = null;
    this.excelHeaders.set([]);
    this.excelRawRows.set([]);
    this.excelConflictResolution.set('skip');
    this.excelMapping.set({
      rollNumber: '',
      fullName: '',
      dob: '',
      email: '',
      phone: '',
      department: '',
      degree: '',
      cgpa: ''
    });
    this.showExcelImportModal.set(true);
  }

  closeExcelImportModal(): void {
    this.showExcelImportModal.set(false);
  }

  onExcelFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;

    this.excelFile = file;
    this.isParsingExcel.set(true);

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const buffer = e.target.result;
        const workbook = XLSX.read(buffer, { type: 'binary', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        if (rawJson.length === 0) {
          this.alertService.show('The selected Excel sheet appears to be empty.');
          this.isParsingExcel.set(false);
          return;
        }

        const headers = Object.keys(rawJson[0]);
        this.excelHeaders.set(headers);
        this.excelRawRows.set(rawJson);

        // Auto-detect mappings based on header names
        this.autoMapHeaders(headers);
        this.isParsingExcel.set(false);
      } catch (err) {
        console.error('Error reading excel:', err);
        this.alertService.show('Failed to parse Excel file. Please ensure it is a valid .xlsx or .csv.');
        this.isParsingExcel.set(false);
      }
    };
    reader.readAsBinaryString(file);
  }

  autoMapHeaders(headers: string[]): void {
    const mapping: IExcelMapping = {
      rollNumber: '',
      fullName: '',
      dob: '',
      email: '',
      phone: '',
      department: '',
      degree: '',
      cgpa: ''
    };

    const findMatch = (regexList: RegExp[]) => {
      for (const h of headers) {
        const clean = h.trim().toLowerCase();
        for (const r of regexList) {
          if (r.test(clean)) return h;
        }
      }
      return '';
    };

    mapping.rollNumber = findMatch([/roll/i, /reg/i, /id/i]);
    mapping.fullName = findMatch([/name/i, /student/i, /candidate/i]);
    mapping.dob = findMatch([/dob/i, /birth/i, /date.*birth/i]);
    mapping.email = findMatch([/email/i, /mail/i]);
    mapping.phone = findMatch([/phone/i, /mobile/i, /contact/i]);
    mapping.department = findMatch([/dept/i, /department/i, /branch/i]);
    mapping.degree = findMatch([/degree/i, /course/i, /batch/i]);
    mapping.cgpa = findMatch([/cgpa/i, /percentage/i, /gpa/i, /score/i]);

    this.excelMapping.set(mapping);
  }

  updateMapping(field: keyof IExcelMapping, headerName: string): void {
    const current = { ...this.excelMapping() };
    current[field] = headerName;
    this.excelMapping.set(current);
  }

  downloadSampleExcelTemplate(): void {
    const sampleData = [
      {
        'Roll Number': 'CS2025001',
        'Student Name': 'Aarav Sharma',
        'Date of Birth': '2003-05-14',
        'Email Address': 'aarav.sharma@example.edu',
        'Phone Number': '+91 9876543210',
        'Department': 'Computer Science',
        'Degree': 'B.Tech',
        'CGPA': '8.8'
      },
      {
        'Roll Number': 'CS2025002',
        'Student Name': 'Priya Patel',
        'Date of Birth': '2003-09-22',
        'Email Address': 'priya.patel@example.edu',
        'Phone Number': '+91 9876543211',
        'Department': 'Information Technology',
        'Degree': 'B.Tech',
        'CGPA': '9.1'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'Campus_Students_Template.xlsx');
  }

  confirmImportStudents(): void {
    const drive = this.selectedDrive();
    if (!drive) return;

    const map = this.excelMapping();
    if (!map.rollNumber || !map.fullName || !map.email) {
      this.alertService.show('Please map at least Roll Number, Full Name, and Email.');
      return;
    }

    const raw = this.excelRawRows();
    const studentsToImport = raw.map(row => ({
      rollNumber: row[map.rollNumber],
      fullName: row[map.fullName],
      dob: map.dob ? row[map.dob] : undefined,
      email: row[map.email],
      phone: map.phone ? row[map.phone] : '',
      department: map.department ? row[map.department] : '',
      degree: map.degree ? row[map.degree] : '',
      cgpa: map.cgpa ? row[map.cgpa] : ''
    }));

    this.isImportingStudents.set(true);
    this.apiService.importCampusStudents(drive._id, studentsToImport, this.excelConflictResolution()).subscribe({
      next: (res) => {
        this.isImportingStudents.set(false);
        this.closeExcelImportModal();
        this.alertService.show(res.message || 'Students imported successfully!');
        this.loadStudentsForDrive(drive._id);
      },
      error: (err) => {
        this.isImportingStudents.set(false);
        this.alertService.show(err.error?.message || 'Error importing students');
      }
    });
  }

  // ==========================================
  // CANDIDATE PIPELINE ACTIONS
  // ==========================================
  promoteStudent(student: any): void {
    if (!student.isFormSubmitted) {
      this.alertService.show(`Cannot promote ${student.fullName}: Candidate has not submitted the application form yet.`);
      return;
    }

    this.isLoading.set(true);
    this.apiService.updateStudentRoundStatus(student._id, { action: 'clear_and_promote' }).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.alertService.show(`${student.fullName} promoted to next round!`);
        this.loadStudentsForDrive(this.selectedDrive()._id);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Failed to update student');
      }
    });
  }

  rejectStudent(student: any): void {
    this.isLoading.set(true);
    this.apiService.updateStudentRoundStatus(student._id, { action: 'reject' }).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.alertService.show(`${student.fullName} marked as rejected.`);
        this.loadStudentsForDrive(this.selectedDrive()._id);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Failed to update student');
      }
    });
  }

  toggleSelectAllStudents(event: any): void {
    if (event.target.checked) {
      // Skip candidates who have not filled the form
      const eligible = this.filteredStudents().filter((s: any) => s.isFormSubmitted && s.overallStatus === 'Active');
      if (eligible.length === 0) {
        this.alertService.show('No active candidates on this list have submitted the application form yet.');
        this.selectedStudentIds.set([]);
        return;
      }
      const skippedCount = this.filteredStudents().length - eligible.length;
      if (skippedCount > 0) {
        this.alertService.show(`Selected ${eligible.length} candidate(s). Skipped ${skippedCount} candidate(s) whose form is pending.`);
      }
      this.selectedStudentIds.set(eligible.map((s: any) => s._id));
    } else {
      this.selectedStudentIds.set([]);
    }
  }

  isAllEligibleSelected(): boolean {
    const eligible = this.filteredStudents().filter((s: any) => s.isFormSubmitted && s.overallStatus === 'Active');
    if (eligible.length === 0) return false;
    const selected = this.selectedStudentIds();
    return eligible.every((s: any) => selected.includes(s._id));
  }

  toggleStudentSelection(student: any): void {
    if (!student.isFormSubmitted) {
      this.alertService.show(`Cannot select ${student.fullName}: Application form has not been submitted yet.`);
      return;
    }
    const studentId = student._id;
    const ids = [...this.selectedStudentIds()];
    const idx = ids.indexOf(studentId);
    if (idx >= 0) {
      ids.splice(idx, 1);
    } else {
      ids.push(studentId);
    }
    this.selectedStudentIds.set(ids);
  }

  isStudentSelected(studentId: string): boolean {
    return this.selectedStudentIds().includes(studentId);
  }

  bulkPromoteSelected(): void {
    const ids = this.selectedStudentIds();
    if (ids.length === 0) return;

    // Guard: Prevent promotion if any selected candidate has not filled the form
    const selectedStudentsList = this.students().filter((s: any) => ids.includes(s._id));
    const unsubmitted = selectedStudentsList.filter((s: any) => !s.isFormSubmitted);
    if (unsubmitted.length > 0) {
      const names = unsubmitted.map((s: any) => s.fullName).slice(0, 3).join(', ');
      const more = unsubmitted.length > 3 ? ` and ${unsubmitted.length - 3} others` : '';
      this.alertService.show(`Cannot promote: ${names}${more} have not submitted the application form yet.`);
      return;
    }

    this.isLoading.set(true);
    this.apiService.bulkUpdateCampusStudents({ studentIds: ids, action: 'clear_and_promote' }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.alertService.show(res.message || 'Selected candidates promoted.');
        this.selectedStudentIds.set([]);
        this.loadStudentsForDrive(this.selectedDrive()._id);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Bulk promotion failed');
      }
    });
  }

  bulkRejectSelected(): void {
    const ids = this.selectedStudentIds();
    if (ids.length === 0) return;

    this.isLoading.set(true);
    this.apiService.bulkUpdateCampusStudents({ studentIds: ids, action: 'reject' }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.alertService.show(res.message || 'Selected candidates rejected.');
        this.selectedStudentIds.set([]);
        this.loadStudentsForDrive(this.selectedDrive()._id);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Bulk rejection failed');
      }
    });
  }

  onboardStudentAsIntern(student: any): void {
    if (!student || student.isOnboarded) return;

    if (student.overallStatus !== 'Selected') {
      this.alertService.show(`Only candidates who have cleared all interview rounds and are marked as 'Selected' can be onboarded as Interns. ${student.fullName} is currently in ${student.currentRoundName || 'Round ' + student.currentRoundOrder}.`);
      return;
    }

    if (!confirm(`Are you sure you want to onboard ${student.fullName} as an Intern? This will create their Intern profile and system account.`)) {
      return;
    }

    this.isLoading.set(true);
    this.apiService.onboardCampusStudentAsIntern(student._id).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.alertService.show(res.message || `${student.fullName} onboarded as an Intern successfully.`);
        if (this.showStudentDetailsModal()) {
          this.closeStudentDetailsModal();
        }
        if (this.selectedDrive()?._id) {
          this.loadStudentsForDrive(this.selectedDrive()._id);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Failed to onboard candidate.');
      }
    });
  }

  bulkOnboardSelected(): void {
    const ids = this.selectedStudentIds();
    if (ids.length === 0) return;

    const selectedStudents = this.students().filter(s => ids.includes(s._id));
    const notSelected = selectedStudents.filter(s => s.overallStatus !== 'Selected');

    if (notSelected.length > 0) {
      this.alertService.show(`Cannot onboard: ${notSelected.length} candidate(s) are not marked as 'Selected'. Only candidates who have cleared all interview rounds can be onboarded as Interns.`);
      return;
    }

    if (!confirm(`Are you sure you want to onboard ${ids.length} selected candidate(s) as Interns?`)) {
      return;
    }

    this.isLoading.set(true);
    this.apiService.bulkOnboardCampusStudentsAsIntern(ids).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.alertService.show(res.message || 'Selected candidates onboarded as Interns.');
        this.selectedStudentIds.set([]);
        if (this.selectedDrive()?._id) {
          this.loadStudentsForDrive(this.selectedDrive()._id);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.show(err.error?.message || 'Failed to bulk onboard candidates.');
      }
    });
  }

  exportCurrentStudentList(): void {
    const list = this.filteredStudents();
    if (list.length === 0) {
      this.alertService.show('No students to export.');
      return;
    }

    const exportRows = list.map(s => ({
      'Roll Number': s.rollNumber,
      'Full Name': s.fullName,
      'Email': s.email,
      'Phone': s.phone,
      'Department': s.department,
      'Degree': s.degree,
      'CGPA': s.cgpa,
      'Current Round': s.currentRoundName,
      'Overall Status': s.overallStatus
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    const driveTitle = (this.selectedDrive()?.title || 'Drive').replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    XLSX.writeFile(wb, `${driveTitle}_Candidates.xlsx`);
  }

  viewStudentDetails(student: any): void {
    this.selectedStudent.set(student);
    this.showStudentDetailsModal.set(true);
  }

  closeStudentDetailsModal(): void {
    this.showStudentDetailsModal.set(false);
    this.selectedStudent.set(null);
  }

  downloadResume(student: any): void {
    const base64Data = student?.resumeBase64 || student?.resume;
    if (!base64Data) return;

    let cleanBase64 = base64Data;
    let mimeType = 'application/pdf';
    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(',');
      const match = parts[0].match(/:(.*?);/);
      if (match) mimeType = match[1];
      cleanBase64 = parts[1] || '';
    }

    try {
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      console.error('Error opening resume PDF:', e);
      window.open(base64Data, '_blank');
    }
  }

  hasAssessmentAnswers(student: any): boolean {
    if (!student?.assessmentAnswers) return false;
    const a = student.assessmentAnswers;
    if (typeof a === 'object' && Object.keys(a).length > 0) return true;
    if (typeof a === 'string' && a.trim() && a !== '{}' && a !== '[]') return true;
    return false;
  }

  getParsedProjectLinks(student: any): string[] {
    if (!student) return [];
    let links = student.projectLinks || student.candidateDetails?.projectLinks;
    if (typeof links === 'string') {
      try {
        links = JSON.parse(links);
      } catch (_) {
        links = links.trim() ? [links] : [];
      }
    }
    if (Array.isArray(links)) {
      return links
        .map((l: any) => (typeof l === 'string' ? l.trim() : ''))
        .filter((l: string) => l.length > 0);
    }
    return [];
  }

  getParsedAssessmentAnswers(student: any): any[] {
    if (!student?.assessmentAnswers) return [];
    let answers = student.assessmentAnswers;
    if (typeof answers === 'string') {
      try {
        answers = JSON.parse(answers);
      } catch (_) {
        return [];
      }
    }
    if (Array.isArray(answers)) return answers;
    if (typeof answers === 'object') {
      return Object.keys(answers).map(key => ({
        question: key,
        answer: answers[key]
      }));
    }
    return [];
  }
}

