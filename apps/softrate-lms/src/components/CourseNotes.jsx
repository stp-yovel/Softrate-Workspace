import { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Scissors,
  Plus,
  Trash2,
  Play,
  AlertCircle,
  Clock,
  Bookmark,
} from 'lucide-react';
import {
  fetchCourseNotes,
  createCourseNote,
  deleteCourseNote,
} from '../services/courseApi';

// Format seconds into MM:SS
function formatTime(seconds) {
  if (isNaN(seconds) || seconds == null || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Parse string MM:SS or integer into seconds
function parseTime(timeStr) {
  if (typeof timeStr === 'number') return Math.max(0, Math.floor(timeStr));
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return Math.max(0, m * 60 + s);
  }
  return Math.max(0, parseInt(timeStr, 10) || 0);
}

export default function CourseNotes({
  courseId,
  activeVideo,
  playbackState = { currentTime: 0, maxSeenSeconds: 0, duration: 0 },
  onSeek,
  token,
}) {
  const [notes, setNotes] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [noteType, setNoteType] = useState('slice'); // 'slice' | 'normal'
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('00:15');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const descTextareaRef = useRef(null);

  // Load saved notes directly and exclusively from the database
  useEffect(() => {
    let isMounted = true;

    const loadFromDb = async () => {
      if (!courseId) return;
      setIsLoadingNotes(true);
      try {
        const res = await fetchCourseNotes(courseId, token);
        if (res && res.success && Array.isArray(res.data) && isMounted) {
          setNotes(res.data);
        }
      } catch (err) {
        console.error('[CourseNotes] Error loading notes from DB:', err);
      } finally {
        if (isMounted) setIsLoadingNotes(false);
      }
    };

    loadFromDb();

    return () => {
      isMounted = false;
    };
  }, [courseId, token]);

  const handleOpenForm = () => {
    setShowAddForm(true);
    setErrorMsg('');
    const current = playbackState.currentTime || 0;
    const maxSeen = playbackState.maxSeenSeconds || current;
    const initialStart = Math.min(current, maxSeen);
    const initialEnd = Math.min(initialStart + 15, maxSeen);

    setStartTime(formatTime(initialStart));
    setEndTime(formatTime(initialEnd));
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setTitle('');
    setDescription('');
    if (descTextareaRef.current) {
      descTextareaRef.current.style.height = 'auto';
    }
    setErrorMsg('');
    setIsSaving(false);
  };

  const handleDescriptionChange = (e) => {
    setDescription(e.target.value);
    if (descTextareaRef.current) {
      descTextareaRef.current.style.height = 'auto';
      descTextareaRef.current.style.height = `${Math.max(72, descTextareaRef.current.scrollHeight)}px`;
    }
  };

  const handleUseCurrentAsStart = () => {
    const current = playbackState.currentTime || 0;
    const maxSeen = playbackState.maxSeenSeconds || 0;
    const validTime = Math.min(current, maxSeen);
    setStartTime(formatTime(validTime));
  };

  const handleUseCurrentAsEnd = () => {
    const current = playbackState.currentTime || 0;
    const maxSeen = playbackState.maxSeenSeconds || 0;
    const validTime = Math.min(current, maxSeen);
    setEndTime(formatTime(validTime));
  };

  const handleSaveNote = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim()) {
      setErrorMsg('Note title is required.');
      return;
    }

    const maxSeen = playbackState.maxSeenSeconds || 0;

    let sliceData = null;
    if (noteType === 'slice') {
      const startSec = parseTime(startTime);
      const endSec = parseTime(endTime);

      // Validation rule: start time and end time should not > seen time
      if (startSec > maxSeen) {
        setErrorMsg(
          `Start time (${formatTime(startSec)}) cannot exceed watched time (${formatTime(maxSeen)}).`
        );
        return;
      }

      if (endSec > maxSeen) {
        setErrorMsg(
          `End time (${formatTime(endSec)}) cannot exceed watched time (${formatTime(maxSeen)}).`
        );
        return;
      }

      if (startSec >= endSec) {
        setErrorMsg('End time must be greater than start time.');
        return;
      }

      sliceData = {
        startTime: startSec,
        endTime: endSec,
        videoId: activeVideo?.videoId || '',
        videoOrder: activeVideo?.order || 1,
        videoTitle: activeVideo?.title || 'Lesson',
      };
    }

    setIsSaving(true);
    try {
      const payload = {
        type: noteType,
        title: title.trim(),
        description: description.trim(),
        videoId: activeVideo?.videoId || '',
        slice: sliceData,
      };

      const res = await createCourseNote(courseId, payload, token);
      if (res && res.success && res.data) {
        const savedItem = {
          ...res.data,
          lessonOrder: activeVideo?.order || 1,
          lessonTitle: activeVideo?.title || 'Lesson',
        };
        setNotes((prev) => [savedItem, ...prev]);
        handleCloseForm();
      } else {
        setErrorMsg(res?.message || 'Failed to save note to database.');
      }
    } catch (err) {
      console.error('[CourseNotes] Failed to save note to DB:', err);
      setErrorMsg('Failed to save note to database.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (id) => {
    try {
      const res = await deleteCourseNote(courseId, id, token);
      if (res && res.success) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
      } else {
        console.warn('[CourseNotes] Delete failed:', res?.message);
      }
    } catch (err) {
      console.error('[CourseNotes] Failed to delete note from DB:', err);
    }
  };

  const maxSeen = playbackState.maxSeenSeconds || 0;

  return (
    <div className="course-notes-card">
      {/* Card Header */}
      <div className="notes-card-header">
        <div>
          <h3 className="notes-card-title">Notes & Slices</h3>
          <p className="notes-card-subtitle">
            {notes.length} {notes.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>

        {!showAddForm && (
          <button
            type="button"
            className="btn-add-note"
            onClick={handleOpenForm}
          >
            <Plus size={14} />
            <span>Add Note</span>
          </button>
        )}
      </div>

      {/* Note Creation Form */}
      {showAddForm && (
        <form className="note-form" onSubmit={handleSaveNote}>
          {/* Note Type Toggle */}
          <div className="note-type-toggle">
            <button
              type="button"
              className={`type-toggle-btn ${noteType === 'slice' ? 'active' : ''}`}
              onClick={() => setNoteType('slice')}
            >
              <Scissors size={14} />
              <span>Video Slice</span>
            </button>

            <button
              type="button"
              className={`type-toggle-btn ${noteType === 'normal' ? 'active' : ''}`}
              onClick={() => setNoteType('normal')}
            >
              <FileText size={14} />
              <span>General Note</span>
            </button>
          </div>

          {/* Slice Time Range Configuration */}
          {noteType === 'slice' && (
            <div className="slice-config-box">
              <div className="slice-max-seen-badge">
                <Clock size={12} />
                <span>
                  Max allowed slice: <strong>{formatTime(maxSeen)}</strong> (watched time)
                </span>
              </div>

              <div className="time-inputs-stack">
                <div className="time-input-col">
                  <div className="time-label-row">
                    <label>Start Time (MM:SS)</label>
                    <button
                      type="button"
                      className="btn-use-time-inline"
                      onClick={handleUseCurrentAsStart}
                      title="Set to current playback time"
                    >
                      <Clock size={11} />
                      <span>Use Current</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    className="time-field-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="00:00"
                  />
                </div>

                <div className="time-input-col">
                  <div className="time-label-row">
                    <label>End Time (MM:SS)</label>
                    <button
                      type="button"
                      className="btn-use-time-inline"
                      onClick={handleUseCurrentAsEnd}
                      title="Set to current playback time"
                    >
                      <Clock size={11} />
                      <span>Use Current</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    className="time-field-input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="00:30"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Title & Description Fields */}
          <div className="form-field-group">
            <label>
              Title <span className="field-required">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={noteType === 'slice' ? 'e.g. Critical concept explanation' : 'e.g. Summary of principles'}
            />
          </div>

          <div className="form-field-group">
            <label>Description</label>
            <textarea
              ref={descTextareaRef}
              rows={3}
              value={description}
              onChange={handleDescriptionChange}
              placeholder="Add key insights, thoughts, or reminders..."
            />
          </div>

          {errorMsg && (
            <div className="note-error-alert">
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="note-form-actions">
            <button
              type="button"
              className="btn-form-cancel"
              onClick={handleCloseForm}
            >
              Cancel
            </button>
            <button type="submit" className="btn-form-save" disabled={isSaving}>
              {isSaving ? 'Saving...' : `Save ${noteType === 'slice' ? 'Slice' : 'Note'}`}
            </button>
          </div>
        </form>
      )}

      {/* Notes List */}
      <div className="notes-list">
        {notes.length === 0 ? (
          <div className="notes-empty-state">
            <Bookmark size={28} className="empty-bookmark-icon" />
            <p className="empty-text">No notes or video slices saved yet.</p>
            <p className="empty-subtext">
              Click &quot;Add Note&quot; to bookmark important moments or write takeaways.
            </p>
          </div>
        ) : (
          notes.map((item) => {
            const isSlice = item.type === 'slice' && item.slice;

            return (
              <div key={item.id} className="note-card-item">
                <div className="note-card-top">
                  <div className="note-badges-group">
                    {isSlice ? (
                      <span className="badge-slice-tag">
                        <Scissors size={11} />
                        {formatTime(item.slice.startTime)} - {formatTime(item.slice.endTime)}
                      </span>
                    ) : (
                      <span className="badge-normal-tag">
                        <FileText size={11} />
                        Note
                      </span>
                    )}

                    <span className="badge-lesson-tag">
                      Lesson {item.lessonOrder || item.slice?.videoOrder || 1}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn-delete-note"
                    onClick={() => handleDeleteNote(item.id)}
                    title="Delete this note"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <h4 className="note-item-title">{item.title}</h4>
                {item.description && (
                  <p className="note-item-desc">{item.description}</p>
                )}

                <div className="note-card-bottom">
                  {isSlice && (
                    <button
                      type="button"
                      className="btn-play-slice"
                      onClick={() => onSeek && onSeek(item.slice.startTime)}
                    >
                      <Play size={11} />
                      <span>Play Slice ({formatTime(item.slice.startTime)})</span>
                    </button>
                  )}

                  <span className="note-created-date">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

