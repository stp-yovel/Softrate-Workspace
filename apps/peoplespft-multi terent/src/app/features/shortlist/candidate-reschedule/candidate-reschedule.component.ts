import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../../services/api.service';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Calendar01Icon,
  Clock01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  InformationCircleIcon,
  Building02Icon
} from '@hugeicons/core-free-icons';

@Component({
  selector: 'app-candidate-reschedule',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HugeiconsIconComponent],
  templateUrl: './candidate-reschedule.component.html',
  styleUrls: ['./candidate-reschedule.component.css']
})
export class CandidateRescheduleComponent implements OnInit {
  readonly CalendarIcon = Calendar01Icon;
  readonly ClockIcon = Clock01Icon;
  readonly CheckIcon = CheckmarkCircle02Icon;
  readonly AlertIcon = AlertCircleIcon;
  readonly InfoIcon = InformationCircleIcon;
  readonly BuildingIcon = Building02Icon;

  token = '';
  isLoading = signal<boolean>(true);
  isSubmitting = signal<boolean>(false);
  error = signal<string | null>(null);
  submitSuccess = signal<string | null>(null);

  candidate = signal<any>(null);
  reschedule = signal<any>(null);

  preferredDate = '';
  preferredTime = '11:00 AM';
  reason = '';

  minDate = '';
  timeSlots: string[] = [
    '09:30 AM',
    '10:00 AM',
    '10:30 AM',
    '11:00 AM',
    '11:30 AM',
    '12:00 PM',
    '02:00 PM',
    '02:30 PM',
    '03:00 PM',
    '03:30 PM',
    '04:00 PM',
    '04:30 PM',
    '05:00 PM',
    '05:30 PM'
  ];

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private apiService: ApiService
  ) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.minDate = tomorrow.toISOString().split('T')[0];
    this.preferredDate = this.minDate;
  }

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.token = params.get('token') || '';
      if (!this.token) {
        this.error.set('No reschedule token provided in the link. Please check your invitation email.');
        this.isLoading.set(false);
        return;
      }
      this.loadDetails();
    });
  }

  loadDetails() {
    this.isLoading.set(true);
    this.error.set(null);
    const url = `${this.apiService.getBaseUrl()}/api/shortlist/public/reschedule/${encodeURIComponent(this.token)}`;

    this.http.get<any>(url).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res && res.success) {
          this.candidate.set(res.candidate);
          this.reschedule.set(res.reschedule);

          if (res.reschedule?.requestedDate) {
            const d = new Date(res.reschedule.requestedDate);
            if (!isNaN(d.getTime())) {
              this.preferredDate = d.toISOString().split('T')[0];
            }
          }
          if (res.reschedule?.requestedTime) {
            this.preferredTime = res.reschedule.requestedTime;
          }
          if (res.reschedule?.reason) {
            this.reason = res.reschedule.reason;
          }
        } else {
          this.error.set(res?.message || 'Unable to retrieve interview details.');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.error.set(
          err.error?.message || 'The reschedule link is invalid, expired, or has already been used.'
        );
      }
    });
  }

  submitReschedule() {
    if (!this.preferredDate) {
      alert('Please select your preferred date.');
      return;
    }
    if (!this.preferredTime) {
      alert('Please select your preferred time slot.');
      return;
    }

    const selDate = new Date(this.preferredDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selDate <= today) {
      alert('Preferred date must be in the future.');
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);

    const url = `${this.apiService.getBaseUrl()}/api/shortlist/public/reschedule/${encodeURIComponent(this.token)}`;
    const payload = {
      preferredDate: this.preferredDate,
      preferredTime: this.preferredTime,
      reason: this.reason.trim()
    };

    this.http.post<any>(url, payload).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        if (res && res.success) {
          this.submitSuccess.set(res.message || 'Reschedule request submitted successfully!');
          // Refresh details
          this.loadDetails();
        } else {
          this.error.set(res?.message || 'Failed to submit reschedule request.');
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.error.set(err.error?.message || 'Failed to submit request. Please try again.');
      }
    });
  }
}

