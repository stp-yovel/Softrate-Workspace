import {
  LayoutDashboard,
  BookOpen,
  CheckCircle2,
  Award,
  Play,
} from 'lucide-react';

export default function Sidebar({
  activeTab = 'dashboard',
  onSelectTab,
  selectedCourse = null,
  onResumeCourse,
}) {
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'my-courses',
      label: 'My Courses',
      icon: BookOpen,
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: CheckCircle2,
    },
    {
      id: 'certifications',
      label: 'Certifications',
      icon: Award,
    },
  ];

  return (
    <aside className="app-sidebar" aria-label="Sidebar navigation">
      <div className="sidebar-group">
        <span className="sidebar-group-title">Navigation</span>
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && !selectedCourse;

            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar-nav-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} className="sidebar-btn-icon" />
                <span className="sidebar-btn-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Knowledge Mandala (rendered in background layer) */}
      <div className="sidebar-footer-mandala" aria-hidden="true">
        <div
          className="sidebar-mandala-symbol"
          role="img"
          aria-label="White Lotus Knowledge Mandala"
        />
      </div>

      {/* Active Course Card in sidebar when viewing lessons (frosted glass surface) */}
      {selectedCourse && (
        <div className="sidebar-course-card">
          <span className="sidebar-course-tag">Active lesson</span>
          <h4 className="sidebar-course-name" title={selectedCourse.title}>
            {selectedCourse.title}
          </h4>
          <div className="sidebar-course-progress">
            <div className="sidebar-progress-track">
              <div
                className="sidebar-progress-fill"
                style={{ width: `${selectedCourse.progressPercentage || 0}%` }}
              />
            </div>
            <span className="sidebar-progress-pct">
              {selectedCourse.progressPercentage || 0}%
            </span>
          </div>

          <button
            type="button"
            className="btn-primary sidebar-resume-btn"
            onClick={onResumeCourse}
          >
            <Play size={12} fill="currentColor" />
            <span>Resume</span>
          </button>
        </div>
      )}
    </aside>
  );
}
