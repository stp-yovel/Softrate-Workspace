import { useMemo } from 'react';
import {
  Play,
  CheckCircle2,
  ArrowRight,
  GraduationCap,
  Flame,
} from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { RacingFlagIcon, PlayIcon } from '@hugeicons/core-free-icons';

function generateActivityHeatmap() {
  const weeks = 12;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Align to Sunday of (weeks - 1) weeks ago so rows map consistently (0=Sun, 1=M, 3=W, 5=F)
  const currentDayOfWeek = today.getDay();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - currentDayOfWeek - ((weeks - 1) * 7));

  const columns = [];
  for (let w = 0; w < weeks; w++) {
    const weekDays = [];
    for (let d = 0; d < 7; d++) {
      const curDate = new Date(startDate);
      curDate.setDate(startDate.getDate() + (w * 7 + d));
      const isFuture = curDate > today;
      const dateStr = curDate.toISOString().split('T')[0];
      const dayOfWeek = curDate.getDay();

      if (isFuture) {
        weekDays.push({
          date: dateStr,
          dayOfWeek,
          level: 0,
          count: 0,
          isFuture: true,
        });
        continue;
      }

      const diffDays = Math.floor((today - curDate) / (1000 * 60 * 60 * 24));
      const isRecentStreak = diffDays <= 4;
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const pseudoHash = (curDate.getDate() * 7 + (curDate.getMonth() + 1) * 13) % 10;

      let level = 0;
      if (isRecentStreak) {
        level = (diffDays % 3) + 2;
      } else if (isWeekday && pseudoHash > 3) {
        level = (pseudoHash % 3) + 1;
      } else if (!isWeekday && pseudoHash > 7) {
        level = 1;
      }

      weekDays.push({
        date: dateStr,
        dayOfWeek,
        level,
        count: level > 0 ? level * 2 : 0,
        isFuture: false,
      });
    }
    columns.push(weekDays);
  }

  return { columns, currentStreak: 5 };
}

const DEFAULT_BANNERS = [
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&auto=format&fit=crop&q=80', // Coding / Tech
  'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=800&auto=format&fit=crop&q=80', // UI & UX Design
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80', // Web Development
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=80', // Team Collaboration
];

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return '';
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : '';
}

function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  // If it is a relative upload path, resolve to backend server port 5001
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const backendBase = import.meta.env.VITE_BACKEND_URL || `http://${host}:5001`;
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

function getCourseBanner(course, index = 0) {
  const customBanner = course.bannerUrl || course.thumbnailUrl;
  if (customBanner && typeof customBanner === 'string' && customBanner.trim()) {
    return resolveMediaUrl(customBanner);
  }

  // Fallback to YouTube thumbnail if lesson videos exist
  const firstVideo = course.videos?.[0];
  const ytId = firstVideo?.youtubeVideoId || extractYouTubeId(firstVideo?.youtubeUrl);
  if (ytId) {
    return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  }

  return DEFAULT_BANNERS[index % DEFAULT_BANNERS.length];
}

function formatDuration(totalSec) {
  const s = Math.max(0, Math.round(Number(totalSec) || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getCourseTiming(course) {
  const totalSec = Number(course.totalDurationSeconds) || 0;
  const watchedSec = Number(course.watchedSeconds) || 0;

  if (totalSec > 0) {
    const pct = Math.min(100, Math.max(0, Math.round((watchedSec / totalSec) * 100)));
    return {
      elapsed: formatDuration(watchedSec),
      total: formatDuration(totalSec),
      progressPct: pct,
    };
  }

  // Fallback if course duration is not yet populated
  const fallbackTotalSec = Math.max(300, (course.totalVideos || 1) * 312);
  const pct = Number(course.progressPercentage || 0);
  const fallbackWatchedSec = Math.round((pct / 100) * fallbackTotalSec);

  return {
    elapsed: formatDuration(fallbackWatchedSec),
    total: formatDuration(fallbackTotalSec),
    progressPct: pct,
  };
}

export default function DashboardView({
  user,
  courses: rawCourses = [],
  inProgressCourses: rawInProgress = [],
  completedCourses: rawCompleted = [],
  onOpenCourse,
  onNavigate,
}) {
  const courses = Array.isArray(rawCourses) ? rawCourses : [];
  const inProgressCourses = Array.isArray(rawInProgress) ? rawInProgress : [];
  const completedCourses = Array.isArray(rawCompleted) ? rawCompleted : [];

  const displayName = typeof user?.name === 'string'
    ? user.name
    : (user?.fullName || user?.identifier || user?.email || 'Learner');
  const firstName = displayName.split(' ')[0] || displayName;

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const getGreeting = () => {
    const hour = today.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const primaryActiveCourse = inProgressCourses[0] || courses[0];
  const activityData = useMemo(() => generateActivityHeatmap(), []);

  return (
    <div className="dashboard-container">
      {/* 1. Top Row: 3/4 Personalized Greeting Card + 1/4 GitHub Activity Heatmap */}
      <div className="dashboard-top-grid">
        <section className="dashboard-greeting-card" aria-label="Welcome banner">
          <div className="greeting-card-content">
            <h1 className="greeting-title">
              {getGreeting()}, {firstName}
            </h1>

            <p className="greeting-desc">
              {inProgressCourses.length > 0
                ? `You have ${inProgressCourses.length} active course${inProgressCourses.length === 1 ? '' : 's'} in progress. Keep up the momentum on your training modules today.`
                : 'You are all caught up on your assigned modules. Explore the course library to continue expanding your skills.'}
            </p>

            <div className="greeting-actions">
              {primaryActiveCourse && (
                <button
                  type="button"
                  className="btn-primary greeting-primary-btn"
                  onClick={() => onOpenCourse(primaryActiveCourse.courseId)}
                >
                  <Play size={14} fill="currentColor" />
                  <span>Resume lesson</span>
                </button>
              )}

              <button
                type="button"
                className="btn-secondary greeting-secondary-btn"
                onClick={() => onNavigate('my-courses')}
              >
                <span>View all courses</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="greeting-card-figure" aria-hidden="true">
            <img
              src="/images/cheerful-student.png"
              alt="Cheerful student"
              className="greeting-student-image"
              loading="lazy"
            />
          </div>
        </section>

        <section className="dashboard-activity-card" aria-label="Learning activity heatmap">
          <div className="activity-card-header">
            <div className="activity-header-left">
              <span className="activity-title">Activity</span>
              <span className="activity-streak-tag">
                <Flame size={12} className="streak-icon" />
                {activityData.currentStreak}d streak
              </span>
            </div>
            <span className="activity-caption">12 wks</span>
          </div>

          <div className="activity-heatmap-wrap">
            <div className="heatmap-day-labels" aria-hidden="true">
              <span className="day-label-empty" />
              <span>M</span>
              <span className="day-label-empty" />
              <span>W</span>
              <span className="day-label-empty" />
              <span>F</span>
              <span className="day-label-empty" />
            </div>
            <div className="activity-heatmap-grid" role="grid" aria-label="Contribution squares">
              {activityData.columns.map((week, wIdx) => (
                <div key={wIdx} className="heatmap-column">
                  {week.map((day, dIdx) => (
                    <div
                      key={dIdx}
                      className={`heatmap-cell level-${day.level}${day.isFuture ? ' is-future' : ''}`}
                      title={day.isFuture ? '' : `${day.count} activities on ${day.date}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="activity-card-footer">
            <span className="activity-footer-stat">Consistent</span>
            <div className="activity-legend" aria-hidden="true">
              <span className="legend-label">Less</span>
              <div className="heatmap-cell level-0" />
              <div className="heatmap-cell level-1" />
              <div className="heatmap-cell level-2" />
              <div className="heatmap-cell level-3" />
              <span className="legend-label">More</span>
            </div>
          </div>
        </section>
      </div>

      {/* 2. Course Listing ("Continue Watching") */}
      <section className="courses-section" aria-label="Assigned courses">
        <div className="section-header">
          <h2 className="section-heading">Assigned Courses</h2>
          <button
            type="button"
            className="btn-text"
            onClick={() => onNavigate('my-courses')}
          >
            <span>View all</span>
          </button>
        </div>

        {courses.length === 0 ? (
          <div className="empty-state">
            <GraduationCap size={32} className="empty-icon" />
            <h3 className="empty-title">No courses assigned yet</h3>
            <p className="empty-desc">
              Your onboarding or training courses will appear here once assigned by your manager.
            </p>
          </div>
        ) : (
          <div className="course-grid">
            {(inProgressCourses.length > 0 ? inProgressCourses : courses).map((course, idx) => {
              const timing = getCourseTiming(course);
              const bannerSrc = getCourseBanner(course, idx);
              const isDone = course.status === 'completed' || Number(course.progressPercentage) === 100;

              return (
                <button
                  key={course.courseId || idx}
                  type="button"
                  className="course-card"
                  onClick={() => onOpenCourse(course.courseId)}
                  aria-label={`${course.title}, ${course.category || 'Training'}`}
                >
                  <div className="card-media">
                    <img
                      src={bannerSrc}
                      alt={course.title}
                      className="card-media-img"
                      loading="lazy"
                      onError={(e) => {
                        const firstVideo = course.videos?.[0];
                        const ytId = firstVideo?.youtubeVideoId || extractYouTubeId(firstVideo?.youtubeUrl);
                        const ytFallback = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
                        const defaultFallback = DEFAULT_BANNERS[idx % DEFAULT_BANNERS.length];

                        if (ytFallback && e.currentTarget.src !== ytFallback) {
                          e.currentTarget.src = ytFallback;
                        } else if (e.currentTarget.src !== defaultFallback) {
                          e.currentTarget.src = defaultFallback;
                        }
                      }}
                    />
                  </div>

                  <div className="card-body">
                    {/* Playback timeline bar placed at the top of curved white content sheet */}
                    <div
                      className="card-timeline-bar"
                      aria-label={`Playback timeline: ${timing.elapsed} of ${timing.total}`}
                    >
                      <Play size={11} fill="currentColor" stroke="none" className="card-timeline-icon" />
                      <span className="card-timeline-time">{timing.elapsed}</span>
                      <div className="card-timeline-track">
                        <div
                          className="card-timeline-fill"
                          style={{ width: `${timing.progressPct}%` }}
                        />
                      </div>
                      <span className="card-timeline-time">{timing.total}</span>
                    </div>

                    <div className="card-meta-row">
                      <span className="card-category-text">{course.category || 'Onboarding'}</span>
                      <span className="card-lessons-text">
                        {isDone
                          ? 'Completed'
                          : `${course.completedVideos || 0}/${course.totalVideos || 0} lessons`}
                      </span>
                    </div>

                    <h3 className="card-title">{course.title}</h3>
                    <p className="card-desc">{course.description}</p>

                    <div className="card-footer">
                      <span className="card-progress-label">
                        {course.progressPercentage || 0}% complete
                      </span>
                      <span className="card-action-link">
                        {isDone ? (
                          'Review'
                        ) : Number(course.progressPercentage || 0) > 0 ? (
                          <>
                            <HugeiconsIcon icon={PlayIcon} size={14} />
                            <span>Resume</span>
                          </>
                        ) : (
                          <>
                            <HugeiconsIcon icon={RacingFlagIcon} size={14} />
                            <span>Start</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Aesthetic Dashboard Bottom Section (iSkill Brand Footer) */}
      <footer className="dashboard-bottom-banner" aria-label="Dashboard branding footer">
        {/* Bottom Brand Logo Graphic */}
        <div className="dashboard-watermark-wrap" aria-hidden="true">
          <img
            src="/logo/iSkill-logo-image.png"
            alt="iSkill"
            className="dashboard-watermark-image"
          />
        </div>
      </footer>
    </div>
  );
}
