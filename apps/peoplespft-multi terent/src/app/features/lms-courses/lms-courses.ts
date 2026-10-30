import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  LicenseDraftIcon,
  PlusSignIcon,
  PlayIcon,
  Clock01Icon,
  UserGroupIcon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';

@Component({
  selector: 'app-lms-courses',
  standalone: true,
  imports: [CommonModule, FormsModule, HugeiconsIconComponent],
  templateUrl: './lms-courses.html',
  styleUrls: ['./lms-courses.css'],
})
export class LMSCourses implements OnInit {
  private apiService = inject(ApiService);

  // Icons
  LicenseDraftIcon = LicenseDraftIcon;
  PlusSignIcon = PlusSignIcon;
  PlayIcon = PlayIcon;
  Clock01Icon = Clock01Icon;
  UserGroupIcon = UserGroupIcon;
  CheckmarkCircle02Icon = CheckmarkCircle02Icon;
  Cancel01Icon = Cancel01Icon;
  Search01Icon = Search01Icon;

  courses = signal<any[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  successMsg = signal('');
  errorMsg = signal('');

  // Search & Filtering
  searchQuery = signal<string>('');
  selectedCategory = signal<string>('All');
  categories = ['All', 'Onboarding', 'Engineering', 'Product', 'Compliance'];

  // Computed summary metrics
  totalCourses = computed(() => this.courses().length);
  totalLessons = computed(() =>
    this.courses().reduce((sum, c) => sum + (c.videos?.length || 0), 0)
  );

  getCourseBannerUrl(course: any): string {
    const raw = course?.bannerUrl || course?.thumbnailUrl;
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
      return raw;
    }
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const backendOrigin = hostname === 'peoplesoft.softrateglobal.com'
      ? 'https://peoplesoft.softrateglobal.com/hrms-api'
      : `http://${hostname}:5001`;
    return `${backendOrigin}${raw.startsWith('/') ? '' : '/'}${raw}`;
  }

  filteredCourses = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const cat = this.selectedCategory();
    return this.courses().filter((c) => {
      const matchesQuery =
        !q ||
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q));
      const matchesCat = cat === 'All' || c.category === cat;
      return matchesQuery && matchesCat;
    });
  });

  // Course Modal
  showCourseModal = signal(false);
  selectedBannerFile = signal<File | null>(null);
  bannerPreview = signal<string>('');
  newCourse = {
    title: '',
    code: '',
    category: 'Onboarding',
    description: '',
    videos: [
      {
        title: '',
        youtubeUrl: '',
        deadlineDays: 3,
        unlockType: 'sequential',
      },
    ],
  };

  // Assign Modal
  showAssignModal = signal(false);
  selectedCourseForAssign = signal<any>(null);
  learners = signal<any[]>([]);
  learnerSearchQuery = signal<string>('');
  assignData = {
    userType: 'employee',
    userId: '',
  };

  filteredLearners = computed(() => {
    const q = this.learnerSearchQuery().toLowerCase().trim();
    if (!q) return this.learners();
    return this.learners().filter((l) => {
      const name = (l.fullName || l.name || '').toLowerCase();
      const email = (l.email || '').toLowerCase();
      const dept = (l.department || l.designation || l.role || '').toLowerCase();
      return name.includes(q) || email.includes(q) || dept.includes(q);
    });
  });

  ngOnInit() {
    this.fetchCourses();
  }

  fetchCourses() {
    this.isLoading.set(true);
    this.apiService.getLMSCourses().subscribe({
      next: (res: any) => {
        this.courses.set(res?.data || []);
        this.isLoading.set(false);
      },
      error: (err: any) => {
        console.error('Error fetching LMS courses:', err);
        this.isLoading.set(false);
      },
    });
  }

  openAddCourseModal() {
    this.selectedBannerFile.set(null);
    this.bannerPreview.set('');
    this.newCourse = {
      title: '',
      code: `CRS-${Math.floor(1000 + Math.random() * 9000)}`,
      category: 'Onboarding',
      description: '',
      videos: [
        {
          title: '',
          youtubeUrl: '',
          deadlineDays: 3,
          unlockType: 'sequential',
        },
      ],
    };
    this.errorMsg.set('');
    this.successMsg.set('');
    this.showCourseModal.set(true);
  }

  onBannerFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      this.selectedBannerFile.set(file);
      const reader = new FileReader();
      reader.onload = () => {
        this.bannerPreview.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  closeCourseModal() {
    this.selectedBannerFile.set(null);
    this.bannerPreview.set('');
    this.showCourseModal.set(false);
  }

  addVideoRow() {
    this.newCourse.videos.push({
      title: '',
      youtubeUrl: '',
      deadlineDays: 3,
      unlockType: 'sequential',
    });
  }

  removeVideoRow(idx: number) {
    if (this.newCourse.videos.length > 1) {
      this.newCourse.videos.splice(idx, 1);
    }
  }

  saveCourse() {
    if (!this.newCourse.title.trim()) {
      this.errorMsg.set('Please provide a course title.');
      return;
    }

    this.isSaving.set(true);
    this.errorMsg.set('');

    const formattedVideos = this.newCourse.videos.map((v, i) => ({
      order: i + 1,
      title: v.title || `Lesson ${i + 1}`,
      youtubeUrl: v.youtubeUrl,
      rules: {
        deadlineDays: Number(v.deadlineDays) || 3,
        unlockType: v.unlockType || 'sequential',
        minWatchPercentage: 90,
        preventSeekForward: true,
      },
    }));

    const onComplete = {
      next: () => {
        this.isSaving.set(false);
        this.showCourseModal.set(false);
        this.selectedBannerFile.set(null);
        this.bannerPreview.set('');
        this.successMsg.set('Course created successfully with banner!');
        this.fetchCourses();
      },
      error: (err: any) => {
        this.isSaving.set(false);
        this.errorMsg.set(err?.error?.message || 'Failed to save course.');
      },
    };

    if (this.selectedBannerFile()) {
      const formData = new FormData();
      formData.append('title', this.newCourse.title.trim());
      formData.append('code', this.newCourse.code.trim());
      formData.append('category', this.newCourse.category);
      formData.append('description', this.newCourse.description);
      formData.append('banner', this.selectedBannerFile()!);
      formData.append('videos', JSON.stringify(formattedVideos));
      this.apiService.createLMSCourse(formData).subscribe(onComplete);
    } else {
      const payload = {
        ...this.newCourse,
        videos: formattedVideos,
      };
      this.apiService.createLMSCourse(payload).subscribe(onComplete);
    }
  }

  openAssignModal(course: any) {
    this.selectedCourseForAssign.set(course);
    this.assignData.userId = '';
    this.learnerSearchQuery.set('');
    this.errorMsg.set('');
    this.successMsg.set('');
    this.loadLearners();
    this.showAssignModal.set(true);
  }

  closeAssignModal() {
    this.showAssignModal.set(false);
    this.learnerSearchQuery.set('');
  }

  dismissAlerts() {
    this.successMsg.set('');
    this.errorMsg.set('');
  }

  clearFilters() {
    this.searchQuery.set('');
    this.selectedCategory.set('All');
  }

  setCategory(cat: string) {
    this.selectedCategory.set(cat);
  }

  onUserTypeChange() {
    this.assignData.userId = '';
    this.loadLearners();
  }

  loadLearners() {
    if (this.assignData.userType === 'employee') {
      this.apiService.getAllEmployees().subscribe({
        next: (res: any) => {
          this.learners.set(res || []);
        },
      });
    } else {
      this.apiService.getAllActiveInterns().subscribe({
        next: (res: any) => {
          this.learners.set(res || []);
        },
      });
    }
  }

  assignCourse() {
    const course = this.selectedCourseForAssign();
    if (!course || !this.assignData.userId) {
      this.errorMsg.set('Please select a learner.');
      return;
    }

    const selectedLearner = this.learners().find(
      (l) => (l._id || l.id) === this.assignData.userId
    );

    this.isSaving.set(true);
    this.apiService
      .assignLMSCourse({
        courseId: course._id,
        userId: this.assignData.userId,
        userType: this.assignData.userType,
        userEmail: selectedLearner?.email || '',
        userName: selectedLearner?.fullName || '',
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.showAssignModal.set(false);
          this.successMsg.set(
            `Successfully assigned "${course.title}" to ${
              selectedLearner?.fullName || 'user'
            }!`
          );
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMsg.set(err?.error?.message || 'Failed to assign course.');
        },
      });
  }
}

