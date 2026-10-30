import { CheckCircle2, Play, Lock, Clock, AlertTriangle } from 'lucide-react';

export default function CourseTimeline({
  timeline = [],
  activeVideoId,
  onSelectVideo,
  progressPercentage = 0,
}) {
  const completedCount = timeline.filter((item) => item.isCompleted).length;
  const totalCount = timeline.length;

  const formatDeadlineBrief = (dateStr, daysRule = 3) => {
    if (!dateStr) return `${daysRule}d window`;
    const d = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60));
    const diffDays = Math.ceil(diffHours / 24);

    if (diffHours < 0) return 'Overdue';
    if (diffDays <= 1) return `${Math.max(1, diffHours)}h left`;
    return `${diffDays}d left`;
  };

  return (
    <aside className="timeline-panel">
      <div className="timeline-header">
        <h3 className="timeline-title">Course Timeline</h3>
        <p className="timeline-subtitle">
          {completedCount} of {totalCount} completed ({progressPercentage}%)
        </p>

        <div className="overall-progress-bar">
          <div
            className="overall-progress-fill"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      <div className="timeline-stepper">
        {timeline.map((item, idx) => {
          const isSelected = item.videoId === activeVideoId;
          const isLocked = !item.isUnlocked;
          const isCompleted = item.isCompleted;
          const isOverdue = item.isOverdue;
          const deadlineDays = item.rules?.deadlineDays || 3;

          return (
            <div
              key={item.videoId}
              className={`timeline-step-item ${isSelected ? 'selected' : ''} ${
                isLocked ? 'locked' : ''
              } ${isCompleted ? 'completed' : ''}`}
            >
              {/* Connector Line */}
              {idx < timeline.length - 1 && (
                <div
                  className={`timeline-connector ${
                    isCompleted ? 'completed' : ''
                  }`}
                />
              )}

              {/* Step Node Icon */}
              <button
                type="button"
                className={`step-node ${
                  isCompleted
                    ? 'completed'
                    : isLocked
                    ? 'locked'
                    : 'active'
                }`}
                onClick={() => !isLocked && onSelectVideo(item.videoId)}
                disabled={isLocked}
                title={isLocked ? 'Locked until previous video is completed' : item.title}
              >
                {isCompleted ? (
                  <CheckCircle2 size={16} />
                ) : isLocked ? (
                  <Lock size={15} />
                ) : (
                  <Play size={15} />
                )}
              </button>

              {/* Step Content */}
              <button
                type="button"
                className="step-info"
                onClick={() => !isLocked && onSelectVideo(item.videoId)}
                disabled={isLocked}
                aria-label={`Lesson ${item.order}: ${item.title}`}
              >
                <div className="step-header-row">
                  <span className="step-number">Lesson {item.order}</span>
                  {isCompleted ? (
                    <span className="step-tag tag-completed">Done</span>
                  ) : isOverdue ? (
                    <span className="step-tag tag-overdue">
                      <AlertTriangle size={11} /> Overdue
                    </span>
                  ) : isLocked ? (
                    <span className="step-tag tag-locked">Locked</span>
                  ) : (
                    <span className="step-tag tag-due">
                      <Clock size={11} /> {formatDeadlineBrief(item.deadline, deadlineDays)}
                    </span>
                  )}
                </div>

                <div className="step-title-text">{item.title}</div>

                <div className="step-rule-hint">
                  {isCompleted
                    ? 'Completed'
                    : isLocked
                    ? 'Requires previous lesson'
                    : `Complete within ${deadlineDays} days`}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

