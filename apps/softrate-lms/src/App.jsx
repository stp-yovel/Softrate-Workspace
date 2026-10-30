import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import VideoPlayer from './components/VideoPlayer';
import CourseTimeline from './components/CourseTimeline';
import CourseNotes from './components/CourseNotes';
import Sidebar from './components/Sidebar';
import CertificateModal from './components/CertificateModal';
import DashboardView from './components/DashboardView';
import { fetchMyCourses, fetchCourseTimeline, updateVideoProgress } from './services/courseApi';
import {
  LogOut,
  ArrowLeft,
  GraduationCap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Award,
  BookOpen,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { RacingFlagIcon, PlayIcon } from '@hugeicons/core-free-icons';

function MainLmsApp() {
  const { user, token, logout } = useAuth();

  // Navigation & Tabs: 'dashboard' | 'my-courses' | 'completed' | 'certifications'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCertificate, setSelectedCertificate] = useState(null);

  // Courses & Active Course State
  const [courses, setCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [courseData, setCourseData] = useState(null);
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);

  // Playback state & seeking for Slices
  const [playbackState, setPlaybackState] = useState({ currentTime: 0, maxSeenSeconds: 0, duration: 0 });
  const [seekRequest, setSeekRequest] = useState(null);

  const handleSeekSlice = (seconds) => {
    setSeekRequest({ time: seconds, timestamp: Date.now() });
  };

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const profileMenuRef = useRef(null);
  const mainContentRef = useRef(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showProfileMenu]);

  const displayName = user?.name || user?.fullName || user?.identifier || user?.email || 'User';
  const roleName = user?.role || user?.roleName || 'Member';
  const userPhone = user?.phone || user?.mobile || user?.contactNumber;
  const userCode = user?.employeeId || user?.internId || user?.code;
  const initial = displayName.charAt(0).toUpperCase();

  const rawPhoto =
    user?.profilePhotoUrl ||
    user?.profilePhoto?.url ||
    user?.profile?.avatar ||
    user?.profile?.photo ||
    user?.profile?.photoUrl ||
    user?.avatar ||
    user?.avatarUrl ||
    user?.photo ||
    user?.photoUrl ||
    user?.image ||
    '/images/app_logo.png';

  const profilePhoto = !imgFailed ? rawPhoto : null;
  const isLogo = profilePhoto === '/images/app_logo.png';

  // Load user's mapped courses
  const loadCourses = async () => {
    setIsLoadingCourses(true);
    try {
      const res = await fetchMyCourses(token);
      if (res && Array.isArray(res.data)) {
        setCourses(res.data);
      } else if (res && Array.isArray(res.courses)) {
        setCourses(res.courses);
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error('Error loading courses:', err);
      setCourses([]);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, [token]);

  // Load specific course timeline when a course is opened
  const loadTimeline = async (courseId) => {
    setIsLoadingTimeline(true);
    try {
      const res = await fetchCourseTimeline(courseId, token);
      if (res && res.data) {
        setCourseData(res.data);
        const timeline = res.data.timeline || [];
        // Set first unlocked incomplete video or first video
        const firstActive = timeline.find((v) => v.isUnlocked && !v.isCompleted) || timeline[0];
        if (firstActive) {
          setActiveVideoId(firstActive.videoId);
        }
      }
    } catch (err) {
      console.error('Error loading timeline:', err);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  const handleOpenCourse = (courseId) => {
    // Immediately clear previous course data and active video to prevent showing mismatched old video
    setCourseData(null);
    setActiveVideoId(null);
    setSelectedCourseId(courseId);
    loadTimeline(courseId);
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToCourses = () => {
    setSelectedCourseId(null);
    setCourseData(null);
    setActiveVideoId(null);
    loadCourses();
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Timeline & Video Data
  const timeline = courseData?.timeline || [];
  const activeVideo = timeline.find((v) => v.videoId === activeVideoId) || timeline[0];
  const currentVideoIdx = timeline.findIndex((v) => v.videoId === activeVideoId);
  const hasNext = currentVideoIdx >= 0 && currentVideoIdx < timeline.length - 1;
  const hasPrev = currentVideoIdx > 0;

  // Complete video handler
  const handleCompleteVideo = async (videoId, watchPercentage, markComplete = false) => {
    if (!selectedCourseId) return;
    setIsSubmitting(true);
    try {
      await updateVideoProgress(
        selectedCourseId,
        {
          videoId,
          watchPercentage,
          markComplete: Boolean(markComplete),
          isCompleted: Boolean(markComplete),
        },
        token
      );

      // Reload timeline to get newly unlocked lessons and updated deadlines
      const res = await fetchCourseTimeline(selectedCourseId, token);
      if (res && res.data) {
        setCourseData(res.data);
        const updatedTimeline = res.data.timeline || [];

        // Auto-navigate to next unlocked lesson if marked complete
        if (markComplete) {
          const nextUnlocked = updatedTimeline.find(
            (v, idx) => idx > currentVideoIdx && v.isUnlocked && !v.isCompleted
          );
          if (nextUnlocked) {
            setActiveVideoId(nextUnlocked.videoId);
          }
        }
      }
      loadCourses();
    } catch (err) {
      console.error('Error updating progress:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextVideo = () => {
    if (hasNext) {
      setActiveVideoId(timeline[currentVideoIdx + 1].videoId);
    }
  };

  const handlePrevVideo = () => {
    if (hasPrev) {
      setActiveVideoId(timeline[currentVideoIdx - 1].videoId);
    }
  };

  // Course segmentation for navigation
  const safeCourses = Array.isArray(courses) ? courses : [];
  const completedCourses = safeCourses.filter(
    (c) => c && (c.status === 'completed' || Number(c.progressPercentage) === 100)
  );
  const inProgressCourses = safeCourses.filter(
    (c) => c && c.status !== 'completed' && Number(c.progressPercentage || 0) < 100
  );

  const handleOpenCertificate = (course) => {
    const credId = `SR-CERT-${(course.code || 'ENG').replace(/[^A-Za-z0-9]/g, '')}-${(course.courseId || '2026').slice(-4).toUpperCase()}`;
    const issueDate = course.completedAt
      ? new Date(course.completedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

    setSelectedCertificate({
      recipientName: displayName,
      courseTitle: course.title,
      courseCode: course.code,
      category: course.category || 'Engineering',
      issueDate,
      credentialId: credId,
    });
  };

  return (
    <div className="app-container">
      {/* Top Header / Navigation Bar */}
      <header className="top-navbar">
        <div className="top-nav-left">
          <button
            type="button"
            className="brand-header-btn"
            onClick={handleBackToCourses}
            aria-label="iSkill Home"
          >
            <div className="brand-logo-pill">
              <img
                src="/logo/iSkill-logo.png"
                alt="iSkill"
                className="brand-full-logo"
              />
            </div>
            <div className="brand-header-meta">
              <div className="brand-subtitle">Learning Workspace</div>
            </div>
          </button>

          {selectedCourseId && (
            <>
              <div className="nav-divider" />
              <button
                type="button"
                className="btn-back-nav"
                onClick={handleBackToCourses}
              >
                <ArrowLeft size={16} />
                <span>Back to Courses</span>
              </button>
            </>
          )}
        </div>

        <div className="navbar-actions">
          <div className="peoplesoft-profile-wrapper" ref={profileMenuRef}>
            <button
              type="button"
              className={`peoplesoft-profile-trigger ${showProfileMenu ? 'open' : ''}`}
              onClick={() => setShowProfileMenu((prev) => !prev)}
              aria-label="User profile menu"
            >
              <span className="peoplesoft-avatar-circle">
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt={displayName}
                    className={`peoplesoft-avatar-img ${isLogo ? 'is-logo' : 'is-photo'}`}
                    onError={() => setImgFailed(true)}
                  />
                ) : (
                  <span>{initial}</span>
                )}
              </span>
              <span className="peoplesoft-profile-name">{displayName}</span>
              <ChevronDown
                size={16}
                className={`peoplesoft-chevron ${showProfileMenu ? 'rotated' : ''}`}
              />
            </button>

            {showProfileMenu && (
              <div className="peoplesoft-profile-dropdown">
                <div className="dropdown-profile-summary">
                  <div className="dropdown-avatar-large">
                    {profilePhoto ? (
                      <img
                        src={profilePhoto}
                        alt={displayName}
                        className={`peoplesoft-avatar-img ${isLogo ? 'is-logo' : 'is-photo'}`}
                      />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>
                  <div className="dropdown-summary-details">
                    <h4 className="dropdown-user-name">{displayName}</h4>
                    {userPhone && <p className="dropdown-user-phone">{userPhone}</p>}
                    <p className="dropdown-user-code">{userCode || roleName}</p>
                  </div>
                </div>

                <div className="dropdown-divider" />

                <button
                  type="button"
                  className="dropdown-action-signout"
                  onClick={logout}
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout: Sidebar Navigation + Content Area */}
      <div className="lms-body-layout">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setSelectedCourseId(null);
            if (mainContentRef.current) {
              mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          selectedCourse={selectedCourseId ? courseData?.course : null}
          onResumeCourse={() => {
            // Already viewing course
          }}
        />

        <main className="lms-main-content" ref={mainContentRef}>
          {/* Active Course View (Player + Timeline + Notes) */}
          {selectedCourseId ? (
            isLoadingTimeline || !courseData ? (
              <div className="course-loading-card">
                <div className="loading-spinner" />
                <p>Loading course content...</p>
              </div>
            ) : (
              <div className="course-view-layout">
                {/* Course Header Banner */}
                <div className="course-detail-header">
                  <div>
                    <div className="course-tag-row">
                      <span className="course-category-tag">
                        {courseData.course?.category || 'Onboarding'}
                      </span>
                    </div>
                    <h2 className="course-detail-title">
                      {courseData.course?.title}
                    </h2>
                    <p className="course-detail-desc">
                      {courseData.course?.description}
                    </p>
                  </div>
                </div>

                {/* Split Grid: Video Player + Timeline Stepper */}
                <div className="player-timeline-grid">
                  <div className="player-column">
                    <VideoPlayer
                      key={`player_${selectedCourseId}_${activeVideo?.videoId || 'empty'}`}
                      video={activeVideo}
                      onComplete={handleCompleteVideo}
                      hasNext={hasNext}
                      onNext={handleNextVideo}
                      hasPrev={hasPrev}
                      onPrev={handlePrevVideo}
                      isSubmitting={isSubmitting}
                      seekRequest={seekRequest}
                      onPlaybackProgress={setPlaybackState}
                    />
                  </div>

                  <div className="timeline-column">
                    <CourseTimeline
                      key={`timeline_${selectedCourseId}`}
                      timeline={timeline}
                      activeVideoId={activeVideoId}
                      onSelectVideo={(id) => setActiveVideoId(id)}
                      progressPercentage={courseData.enrollment?.progressPercentage || 0}
                    />

                    {/* Notes & Slices card placed after Course Timeline */}
                    <CourseNotes
                      key={`notes_${selectedCourseId}`}
                      courseId={selectedCourseId}
                      activeVideo={activeVideo}
                      playbackState={playbackState}
                      onSeek={handleSeekSlice}
                      token={token}
                    />
                  </div>
                </div>
              </div>
            )
          ) : activeTab === 'dashboard' ? (
            /* Tab 0: Main Dashboard */
            <DashboardView
              user={user}
              courses={courses}
              inProgressCourses={inProgressCourses}
              completedCourses={completedCourses}
              onOpenCourse={handleOpenCourse}
              onNavigate={(tab) => {
                setActiveTab(tab);
                setSelectedCourseId(null);
              }}
            />
          ) : activeTab === 'my-courses' ? (
            /* Tab 1: My Courses (In Progress / Active) */
            <div className="courses-list-view">
              <div className="section-header-row">
                <div>
                  <h2 className="section-title">My Courses</h2>
                  <p className="section-subtitle">
                    Active assigned training and engineering curriculums mapped to your profile.
                  </p>
                </div>
              </div>

              {isLoadingCourses ? (
                <div className="loading-card">
                  <div className="spinner-loader" />
                  <p>Loading assigned courses...</p>
                </div>
              ) : inProgressCourses.length === 0 && courses.length > 0 ? (
                <div className="placeholder-card">
                  <CheckCircle2 size={40} className="placeholder-icon success-icon" />
                  <h3 className="placeholder-title">All Courses Completed!</h3>
                  <p className="placeholder-desc">
                    You have finished all currently assigned courses. Check out your achievements in Completed Courses and Certifications.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('completed')}
                  >
                    View Completed Courses
                  </button>
                </div>
              ) : courses.length === 0 ? (
                <div className="placeholder-card">
                  <GraduationCap size={36} className="placeholder-icon" />
                  <h3 className="placeholder-title">No Courses Mapped Yet</h3>
                  <p className="placeholder-desc">
                    You currently have no active course assignments. HR will map courses to your profile.
                  </p>
                </div>
              ) : (
                <div className="course-grid">
                  {(inProgressCourses.length > 0 ? inProgressCourses : courses).map((course, idx) => {
                    const totalSec = Number(course.totalDurationSeconds) || 0;
                    const watchedSec = Number(course.watchedSeconds) || 0;
                    const pct = totalSec > 0
                      ? Math.min(100, Math.max(0, Math.round((watchedSec / totalSec) * 100)))
                      : Number(course.progressPercentage || 0);

                    const formatSecs = (sec) => {
                      const s = Math.max(0, Math.round(Number(sec) || 0));
                      const m = Math.floor(s / 60);
                      const r = s % 60;
                      return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
                    };

                    const elapsedStr = totalSec > 0
                      ? formatSecs(watchedSec)
                      : formatSecs(((Number(course.progressPercentage) || 0) / 100) * Math.max(300, (course.totalVideos || 1) * 312));
                    const totalStr = totalSec > 0
                      ? formatSecs(totalSec)
                      : formatSecs(Math.max(300, (course.totalVideos || 1) * 312));

                    const defaultBanners = [
                      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&auto=format&fit=crop&q=80',
                      'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=800&auto=format&fit=crop&q=80',
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
                      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=80',
                    ];

                    const customBanner = course.bannerUrl || course.thumbnailUrl;
                    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
                    const backendBase = import.meta.env.VITE_BACKEND_URL || `http://${host}:5001`;
                    const resolvedCustomBanner = customBanner
                      ? (customBanner.startsWith('http://') || customBanner.startsWith('https://') || customBanner.startsWith('data:')
                        ? customBanner
                        : `${backendBase}${customBanner.startsWith('/') ? '' : '/'}${customBanner}`)
                      : '';

                    const firstVideo = course.videos?.[0];
                    const ytId = firstVideo?.youtubeVideoId || (firstVideo?.youtubeUrl ? firstVideo.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)?.[1] : '');
                    const ytBanner = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '';

                    const bannerSrc = resolvedCustomBanner || ytBanner || defaultBanners[idx % defaultBanners.length];
                    const isDone = course.status === 'completed' || Number(course.progressPercentage) === 100;

                    return (
                      <button
                        key={course.courseId || idx}
                        type="button"
                        className="course-card"
                        onClick={() => handleOpenCourse(course.courseId)}
                        aria-label={`${course.title}, ${course.category || 'Training'}`}
                      >
                        <div className="card-media">
                          <img
                            src={bannerSrc}
                            alt={course.title}
                            className="card-media-img"
                            loading="lazy"
                            onError={(e) => {
                              const ytFallback = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
                              const defaultFallback = defaultBanners[idx % defaultBanners.length];
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
                            aria-label={`Playback timeline: ${elapsedStr} of ${totalStr}`}
                          >
                            <Play size={11} fill="currentColor" stroke="none" className="card-timeline-icon" />
                            <span className="card-timeline-time">{elapsedStr}</span>
                            <div className="card-timeline-track">
                              <div
                                className="card-timeline-fill"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="card-timeline-time">{totalStr}</span>
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
                              {pct}% complete
                            </span>
                            <span className="card-action-link">
                              {isDone ? (
                                'Review'
                              ) : pct > 0 ? (
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
            </div>
          ) : activeTab === 'completed' ? (
            /* Tab 2: Completed Courses */
            <div className="courses-list-view">
              <div className="section-header-row">
                <div>
                  <h2 className="section-title">Completed Courses</h2>
                  <p className="section-subtitle">
                    Training programs you have successfully completed with all milestones fulfilled.
                  </p>
                </div>
              </div>

              {completedCourses.length === 0 ? (
                <div className="placeholder-card">
                  <CheckCircle2 size={40} className="placeholder-icon" />
                  <h3 className="placeholder-title">No Completed Courses Yet</h3>
                  <p className="placeholder-desc">
                    Complete all lessons and timeline assessments in your active courses to graduate them here and earn official credentials.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('my-courses')}
                  >
                    Go to My Courses
                  </button>
                </div>
              ) : (
                <div className="courses-grid">
                  {completedCourses.map((course) => (
                    <div key={course.courseId} className="course-card completed-course-card">
                      <div className="card-top-row">
                        <span className="card-category-badge">{course.category}</span>
                        <span className="badge-status completed">
                          <CheckCircle2 size={12} /> 100% Completed
                        </span>
                      </div>

                      <h3 className="course-card-title">{course.title}</h3>
                      <p className="course-card-desc">{course.description}</p>

                      <div className="completed-meta-box">
                        <ShieldCheck size={16} className="meta-badge-icon" />
                        <span>All {course.totalVideos || 3} Lessons Finished & Verified</span>
                      </div>

                      <div className="card-footer-row">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleOpenCourse(course.courseId)}
                        >
                          Review Lessons
                        </button>

                        <button
                          type="button"
                          className="btn-primary btn-cert-action"
                          onClick={() => handleOpenCertificate(course)}
                        >
                          <Award size={14} />
                          <span>Certificate</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Tab 3: Certifications */
            <div className="courses-list-view">
              <div className="section-header-row">
                <div>
                  <h2 className="section-title">Certifications & Credentials</h2>
                  <p className="section-subtitle">
                    Verified certificates awarded upon completing Softrate engineering curriculums.
                  </p>
                </div>
              </div>

              {completedCourses.length === 0 ? (
                <div className="placeholder-card">
                  <Award size={44} className="placeholder-icon accent-icon" />
                  <h3 className="placeholder-title">No Certifications Earned Yet</h3>
                  <p className="placeholder-desc">
                    Certificates are automatically issued when you achieve 100% completion in any assigned course.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('my-courses')}
                  >
                    Start an Assigned Course
                  </button>
                </div>
              ) : (
                <div className="certifications-grid">
                  {completedCourses.map((course) => (
                    <div key={course.courseId} className="certification-credential-card">
                      <div className="cert-card-banner">
                        <div className="cert-seal-icon">
                          <Award size={26} />
                        </div>
                        <div className="cert-badge-ribbon">Verified</div>
                      </div>

                      <div className="cert-card-body">
                        <span className="cert-course-type">{course.category || 'Certification'}</span>
                        <h3 className="cert-card-title">{course.title}</h3>
                        <p className="cert-card-recipient">Issued to <strong>{displayName}</strong></p>

                        <div className="cert-card-details">
                          <div className="cert-detail-item">
                            <span className="label">Course Code</span>
                            <span className="val">{course.code}</span>
                          </div>
                          <div className="cert-detail-item">
                            <span className="label">Status</span>
                            <span className="val valid-status">Verified & Active</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-view-certificate"
                          onClick={() => handleOpenCertificate(course)}
                        >
                          <Award size={14} />
                          <span>View Official Certificate</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Official Certificate Modal */}
      {selectedCertificate && (
        <CertificateModal
          certificate={selectedCertificate}
          onClose={() => setSelectedCertificate(null)}
        />
      )}
    </div>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <MainLmsApp /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
