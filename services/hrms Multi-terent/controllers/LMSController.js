const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Helper to seed "Softrate newbie" course if it doesn't exist
async function ensureSoftrateNewbieCourse(LMSCourse, companyId) {
  let course = await LMSCourse.findOne({
    companyId,
    $or: [{ title: 'Softrate newbie' }, { code: 'SR-NEWBIE' }],
  });

  if (!course) {
    course = await LMSCourse.create({
      companyId,
      title: 'Softrate newbie',
      code: 'SR-NEWBIE',
      description: 'Foundational onboarding and engineering standards training for new members.',
      category: 'Onboarding',
      visibility: 'all',
      status: 'active',
      videos: [
        {
          order: 1,
          title: 'Welcome to Softrate & Core Values',
          description: 'Introduction to our engineering culture, workspace setup, and communication principles.',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          youtubeVideoId: 'dQw4w9WgXcQ',
          durationSeconds: 213,
          rules: {
            deadlineDays: 3,
            unlockType: 'sequential',
            minWatchPercentage: 90,
            preventSeekForward: true,
          },
        },
        {
          order: 2,
          title: 'Engineering Workflow & Code Standards',
          description: 'Git branching rules, conventional commits, and professional code quality guidelines.',
          youtubeUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
          youtubeVideoId: 'jNQXAC9IVRw',
          durationSeconds: 195,
          rules: {
            deadlineDays: 3,
            unlockType: 'sequential',
            minWatchPercentage: 90,
            preventSeekForward: true,
          },
        },
        {
          order: 3,
          title: 'Testing, Review & Production Deployment',
          description: 'Automated CI/CD pipelines, code reviews, and production release safety checks.',
          youtubeUrl: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
          youtubeVideoId: '9bZkp7q19f0',
          durationSeconds: 250,
          rules: {
            deadlineDays: 3,
            unlockType: 'sequential',
            minWatchPercentage: 90,
            preventSeekForward: true,
          },
        },
      ],
    });
  }

  return course;
}

// Helper to initialize enrollment video timeline
function buildInitialVideoProgress(courseVideos, assignedAt = new Date()) {
  return courseVideos.map((vid, idx) => {
    const isFirst = idx === 0;
    const deadlineDays = vid.rules?.deadlineDays || 3;
    const unlockedAt = isFirst ? assignedAt : null;
    const deadline = isFirst
      ? new Date(assignedAt.getTime() + deadlineDays * 24 * 60 * 60 * 1000)
      : null;

    return {
      videoId: vid._id,
      order: vid.order || idx + 1,
      title: vid.title,
      isUnlocked: isFirst,
      unlockedAt,
      deadline,
      isCompleted: false,
      completedAt: null,
      watchTimeSeconds: 0,
      watchPercentage: 0,
      isOverdue: false,
    };
  });
}

// Helper to update overdue flags
function evaluateOverdueStatus(videosProgress) {
  const now = new Date();
  let hasOverdue = false;

  for (const item of videosProgress) {
    if (item.isUnlocked && !item.isCompleted && item.deadline) {
      if (now > new Date(item.deadline)) {
        item.isOverdue = true;
        hasOverdue = true;
      } else {
        item.isOverdue = false;
      }
    }
  }

  return hasOverdue;
}

exports.seedDefaultCourse = async (req, res) => {
  try {
    const { LMSCourse } = req.models;
    const companyId = req.user.companyId;

    const course = await ensureSoftrateNewbieCourse(LMSCourse, companyId);
    return res.status(200).json({
      success: true,
      message: 'Course seeded successfully',
      data: course,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllCourses = async (req, res) => {
  try {
    const { LMSCourse } = req.models;
    const companyId = req.user.companyId;

    await ensureSoftrateNewbieCourse(LMSCourse, companyId);
    const courses = await LMSCourse.find({ companyId, status: 'active' }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCourse = async (req, res) => {
  try {
    const { LMSCourse } = req.models;
    const companyId = req.user.companyId;
    let { title, code, description, category, bannerUrl, thumbnailUrl, videos, visibility } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Course title is required' });
    }

    // Normalize course visibility
    let normalizedVisibility = 'all';
    if (visibility) {
      const v = String(visibility).toLowerCase().trim();
      if (['intern', 'interns', 'public_intern', 'public_to_intern'].includes(v)) {
        normalizedVisibility = 'interns';
      } else if (['employee', 'employees', 'public_employee', 'public_to_employee'].includes(v)) {
        normalizedVisibility = 'employees';
      } else if (['private', 'assigned', 'assigned_only'].includes(v)) {
        normalizedVisibility = 'private';
      } else {
        normalizedVisibility = 'all';
      }
    }

    // Parse stringified videos array if sent via FormData
    if (typeof videos === 'string') {
      try {
        videos = JSON.parse(videos);
      } catch {
        videos = [];
      }
    }

    // Process uploaded banner file if provided
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.png';
      const fileName = `course_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
      const uploadDir = path.join(__dirname, '../public/uploads/lms');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, fileName), req.file.buffer);
      bannerUrl = `/uploads/lms/${fileName}`;
      thumbnailUrl = `/uploads/lms/${fileName}`;
    }

    const processedVideos = (videos || []).map((v, idx) => {
      let youtubeVideoId = v.youtubeVideoId || '';
      if (!youtubeVideoId && v.youtubeUrl) {
        const match = v.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        youtubeVideoId = match ? match[1] : v.youtubeUrl;
      }
      return {
        order: v.order || idx + 1,
        title: v.title || `Lesson ${idx + 1}`,
        description: v.description || '',
        youtubeUrl: v.youtubeUrl || '',
        youtubeVideoId,
        durationSeconds: v.durationSeconds || 0,
        rules: {
          deadlineDays: v.rules?.deadlineDays || 3,
          unlockType: v.rules?.unlockType || 'sequential',
          minWatchPercentage: v.rules?.minWatchPercentage || 90,
          preventSeekForward: v.rules?.preventSeekForward !== false,
        },
      };
    });

    const newCourse = await LMSCourse.create({
      companyId,
      title,
      code: code || `CRS-${Date.now().toString().slice(-4)}`,
      description: description || '',
      category: category || 'Onboarding',
      bannerUrl: bannerUrl || thumbnailUrl || '',
      thumbnailUrl: thumbnailUrl || bannerUrl || '',
      visibility: normalizedVisibility,
      status: 'active',
      videos: processedVideos,
    });

    return res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: newCourse,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update Course Visibility
exports.updateCourseVisibility = async (req, res) => {
  try {
    const { LMSCourse } = req.models;
    const companyId = req.user.companyId;
    const { courseId } = req.params;
    let { visibility } = req.body;

    const course = await LMSCourse.findOne({ _id: courseId, companyId });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    let normalizedVisibility = 'all';
    if (visibility) {
      const v = String(visibility).toLowerCase().trim();
      if (['intern', 'interns', 'public_intern', 'public_to_intern'].includes(v)) {
        normalizedVisibility = 'interns';
      } else if (['employee', 'employees', 'public_employee', 'public_to_employee'].includes(v)) {
        normalizedVisibility = 'employees';
      } else if (['private', 'assigned', 'assigned_only'].includes(v)) {
        normalizedVisibility = 'private';
      } else {
        normalizedVisibility = 'all';
      }
    }

    course.visibility = normalizedVisibility;
    await course.save();

    return res.status(200).json({
      success: true,
      message: 'Course visibility updated successfully',
      data: course,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Full Course Update (Title, Code, Category, Description, Visibility, Videos, Banner)
exports.updateCourse = async (req, res) => {
  try {
    const { LMSCourse } = req.models;
    const companyId = req.user.companyId;
    const { courseId } = req.params;
    let { title, code, description, category, bannerUrl, thumbnailUrl, videos, visibility, status } = req.body;

    const course = await LMSCourse.findOne({ _id: courseId, companyId });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (title) course.title = title.trim();
    if (code) course.code = code.trim();
    if (description !== undefined) course.description = description;
    if (category) course.category = category;
    if (status) course.status = status;

    if (visibility) {
      const v = String(visibility).toLowerCase().trim();
      if (['intern', 'interns', 'public_intern', 'public_to_intern'].includes(v)) {
        course.visibility = 'interns';
      } else if (['employee', 'employees', 'public_employee', 'public_to_employee'].includes(v)) {
        course.visibility = 'employees';
      } else if (['private', 'assigned', 'assigned_only'].includes(v)) {
        course.visibility = 'private';
      } else {
        course.visibility = 'all';
      }
    }

    // Parse stringified videos array if sent via FormData
    if (typeof videos === 'string') {
      try {
        videos = JSON.parse(videos);
      } catch {
        // preserve existing if parse fails
      }
    }

    // Process uploaded banner file if provided
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.png';
      const fileName = `course_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
      const uploadDir = path.join(__dirname, '../public/uploads/lms');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, fileName), req.file.buffer);
      course.bannerUrl = `/uploads/lms/${fileName}`;
      course.thumbnailUrl = `/uploads/lms/${fileName}`;
    } else if (bannerUrl !== undefined) {
      course.bannerUrl = bannerUrl;
      course.thumbnailUrl = bannerUrl;
    }

    if (Array.isArray(videos)) {
      course.videos = videos.map((v, idx) => {
        let youtubeVideoId = v.youtubeVideoId || '';
        if (!youtubeVideoId && v.youtubeUrl) {
          const match = v.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
          youtubeVideoId = match ? match[1] : v.youtubeUrl;
        }
        return {
          order: v.order || idx + 1,
          title: v.title || `Lesson ${idx + 1}`,
          description: v.description || '',
          youtubeUrl: v.youtubeUrl || '',
          youtubeVideoId,
          durationSeconds: v.durationSeconds || 0,
          rules: {
            deadlineDays: Number(v.deadlineDays || v.rules?.deadlineDays) || 3,
            unlockType: v.unlockType || v.rules?.unlockType || 'sequential',
            minWatchPercentage: v.rules?.minWatchPercentage || 90,
            preventSeekForward: v.rules?.preventSeekForward !== false,
          },
        };
      });
    }

    await course.save();

    return res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: course,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// HR Maps a Course to a User (Employee or Intern)
exports.assignCourse = async (req, res) => {
  try {
    const { LMSCourse, LMSEnrollment } = req.models;
    const companyId = req.user.companyId;
    let { courseId, userId, userType, userEmail, userName } = req.body;

    if (!courseId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'courseId and userId are required',
      });
    }

    // Resolve userId if passed as EmployeeId or internid string (e.g. "262005")
    let targetObjectId = userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const { Employee, Intern } = req.models;
      let member = null;
      if (Employee) {
        member = await Employee.findOne({
          $or: [
            { EmployeeId: userId },
            { EmployeeId: { $regex: new RegExp(`^${userId}$`, 'i') } },
            { email: userId },
          ],
        });
      }
      if (!member && Intern) {
        member = await Intern.findOne({
          $or: [
            { internid: userId },
            { internId: userId },
            { internid: { $regex: new RegExp(`^${userId}$`, 'i') } },
            { email: userId },
          ],
        });
      }

      if (member && member._id) {
        targetObjectId = member._id;
        userEmail = userEmail || member.email || '';
        userName = userName || member.fullName || '';
      } else {
        return res.status(400).json({
          success: false,
          message: `User '${userId}' not found in organization`,
        });
      }
    }

    if (!mongoose.Types.ObjectId.isValid(targetObjectId)) {
      return res.status(400).json({
        success: false,
        message: `Invalid member identifier: ${userId}`,
      });
    }

    const course = await LMSCourse.findOne({ _id: courseId, companyId });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    let enrollment = await LMSEnrollment.findOne({
      companyId,
      courseId,
      userId: targetObjectId,
    });

    const now = new Date();

    if (!enrollment) {
      const initialProgress = buildInitialVideoProgress(course.videos, now);
      enrollment = await LMSEnrollment.create({
        companyId,
        courseId,
        userId: targetObjectId,
        userType: userType || 'employee',
        userEmail: userEmail || '',
        userName: userName || '',
        assignedBy: req.user.id,
        assignedAt: now,
        status: 'enrolled',
        progressPercentage: 0,
        videosProgress: initialProgress,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Course mapped to user successfully',
      data: enrollment,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Fetch courses mapped to a specific staff member (for HR viewing their profile)
exports.getUserCourses = async (req, res) => {
  try {
    const { LMSEnrollment } = req.models;
    const companyId = req.user.companyId;
    let { userId } = req.params;

    // Resolve userId if passed as EmployeeId or internid string (e.g. "262005")
    let targetObjectId = userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const { Employee, Intern } = req.models;
      let member = null;
      if (Employee) {
        member = await Employee.findOne({
          $or: [
            { EmployeeId: userId },
            { EmployeeId: { $regex: new RegExp(`^${userId}$`, 'i') } },
            { email: userId },
          ],
        });
      }
      if (!member && Intern) {
        member = await Intern.findOne({
          $or: [
            { internid: userId },
            { internId: userId },
            { internid: { $regex: new RegExp(`^${userId}$`, 'i') } },
            { email: userId },
          ],
        });
      }

      if (member && member._id) {
        targetObjectId = member._id;
      } else {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
        });
      }
    }

    if (!mongoose.Types.ObjectId.isValid(targetObjectId)) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const enrollments = await LMSEnrollment.find({
      companyId,
      userId: targetObjectId,
    }).populate('courseId');

    const data = enrollments
      .filter((e) => e.courseId)
      .map((enrollment) => {
        const isOverdue = evaluateOverdueStatus(enrollment.videosProgress);
        const course = enrollment.courseId;
        const courseVideos = course.videos || [];
        const userProgress = enrollment.videosProgress || [];
        const totalDurationSeconds = courseVideos.reduce(
          (sum, v) => sum + (Number(v.durationSeconds) || 0),
          0
        );
        let watchedSeconds = 0;
        courseVideos.forEach((v) => {
          const vp = userProgress.find(
            (p) => p.videoId && v._id && p.videoId.toString() === v._id.toString()
          );
          if (vp) {
            const vDur = Number(v.durationSeconds) || 0;
            if (vp.isCompleted) {
              watchedSeconds += vDur;
            } else {
              const wSec = Number(vp.watchTimeSeconds) || 0;
              const pSec = Math.round(((Number(vp.watchPercentage) || 0) / 100) * vDur);
              watchedSeconds += Math.min(vDur, Math.max(wSec, pSec));
            }
          }
        });

        return {
          enrollmentId: enrollment._id,
          courseId: course._id,
          title: course.title,
          code: course.code,
          description: course.description,
          category: course.category,
          assignedAt: enrollment.assignedAt,
          status: isOverdue ? 'overdue' : enrollment.status,
          progressPercentage: enrollment.progressPercentage,
          totalVideos: courseVideos.length,
          completedVideos: userProgress.filter((v) => v.isCompleted).length,
          totalDurationSeconds,
          watchedSeconds,
        };
      });

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Fetch courses mapped to the logged-in user (including public courses for interns/employees)
exports.getMyCourses = async (req, res) => {
  try {
    const { LMSCourse, LMSEnrollment } = req.models;
    const companyId = req.user.companyId;
    const userId = req.user.id;

    // Ensure "Softrate newbie" exists
    const defaultCourse = await ensureSoftrateNewbieCourse(LMSCourse, companyId);

    // Determine user role (intern vs employee vs manager vs hr)
    const userRole = (req.user.role || '').toLowerCase();
    const userRoleName = (req.user.roleName || '').toUpperCase();
    let isIntern = userRole === 'intern' || userRoleName === 'INTERN';
    let isEmployee = userRole === 'employee' || userRole === 'manager' || userRoleName === 'EMPLOYEE' || userRoleName === 'MANAGER';

    if (!isIntern && req.models?.Intern) {
      isIntern = !!(await req.models.Intern.exists({ _id: userId }));
    }
    if (!isEmployee && !isIntern && req.models?.Employee) {
      isEmployee = !!(await req.models.Employee.exists({ _id: userId }));
    }

    // Role-based visibility matching
    const visibilityConditions = ['all'];
    if (isIntern) {
      visibilityConditions.push('interns');
    }
    if (isEmployee || (!isIntern && !isEmployee)) {
      visibilityConditions.push('employees');
    }
    if (userRole === 'hr' || userRoleName === 'HR' || userRole === 'admin' || userRoleName === 'ADMIN') {
      visibilityConditions.push('interns', 'employees');
    }

    // Fetch active courses matching user's visibility
    const publicCourses = await LMSCourse.find({
      companyId,
      status: 'active',
      $or: [
        { visibility: { $in: visibilityConditions } },
        { _id: defaultCourse._id }
      ],
    });

    // Find existing enrollments for this user
    let enrollments = await LMSEnrollment.find({
      companyId,
      userId,
    }).populate('courseId');

    const enrolledCourseIds = new Set(
      enrollments
        .filter((e) => e.courseId)
        .map((e) => e.courseId._id.toString())
    );

    // Auto-enroll user into public courses without requiring manual HR assignment
    for (const pubCourse of publicCourses) {
      const courseIdStr = pubCourse._id.toString();
      if (!enrolledCourseIds.has(courseIdStr)) {
        const initialProgress = buildInitialVideoProgress(pubCourse.videos);
        const newEnrollment = await LMSEnrollment.create({
          companyId,
          courseId: pubCourse._id,
          userId,
          userType: isIntern ? 'intern' : (req.user.role || 'employee'),
          userEmail: req.user.email || '',
          userName: req.user.name || '',
          assignedBy: req.user.id,
          assignedAt: new Date(),
          status: 'enrolled',
          progressPercentage: 0,
          videosProgress: initialProgress,
        });

        newEnrollment.courseId = pubCourse;
        enrollments.push(newEnrollment);
        enrolledCourseIds.add(courseIdStr);
      }
    }

    // Format response
    const data = enrollments
      .filter((e) => e.courseId)
      .map((enrollment) => {
        const isOverdue = evaluateOverdueStatus(enrollment.videosProgress);
        const course = enrollment.courseId;
        const banner = course.bannerUrl || course.thumbnailUrl || '';
        const courseVideos = course.videos || [];
        const userProgress = enrollment.videosProgress || [];
        const totalDurationSeconds = courseVideos.reduce(
          (sum, v) => sum + (Number(v.durationSeconds) || 0),
          0
        );
        let watchedSeconds = 0;
        courseVideos.forEach((v) => {
          const vp = userProgress.find(
            (p) => p.videoId && v._id && p.videoId.toString() === v._id.toString()
          );
          if (vp) {
            const vDur = Number(v.durationSeconds) || 0;
            if (vp.isCompleted) {
              watchedSeconds += vDur;
            } else {
              const wSec = Number(vp.watchTimeSeconds) || 0;
              const pSec = Math.round(((Number(vp.watchPercentage) || 0) / 100) * vDur);
              watchedSeconds += Math.min(vDur, Math.max(wSec, pSec));
            }
          }
        });

        return {
          enrollmentId: enrollment._id,
          courseId: course._id,
          title: course.title,
          code: course.code,
          description: course.description,
          category: course.category,
          visibility: course.visibility || 'all',
          isSuggested: ['all', 'interns', 'employees'].includes(course.visibility || 'all'),
          bannerUrl: banner,
          thumbnailUrl: banner,
          assignedAt: enrollment.assignedAt,
          status: isOverdue ? 'overdue' : enrollment.status,
          progressPercentage: enrollment.progressPercentage,
          totalVideos: courseVideos.length,
          completedVideos: userProgress.filter((v) => v.isCompleted).length,
          totalDurationSeconds,
          watchedSeconds,
        };
      });

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get Course Timeline & Player Data
exports.getCourseTimeline = async (req, res) => {
  try {
    const { LMSCourse, LMSEnrollment } = req.models;
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { courseId } = req.params;

    const course = await LMSCourse.findOne({ _id: courseId, companyId });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    let enrollment = await LMSEnrollment.findOne({
      companyId,
      courseId,
      userId,
    });

    // If not enrolled yet, auto-enroll for convenience
    if (!enrollment) {
      const initialProgress = buildInitialVideoProgress(course.videos);
      enrollment = await LMSEnrollment.create({
        companyId,
        courseId: course._id,
        userId,
        userType: req.user.role || 'employee',
        assignedBy: req.user.id,
        assignedAt: new Date(),
        status: 'enrolled',
        progressPercentage: 0,
        videosProgress: initialProgress,
      });
    }

    const isOverdue = evaluateOverdueStatus(enrollment.videosProgress);
    await enrollment.save();

    // Merge course video details with user progress
    const timeline = course.videos.map((vid) => {
      const progress = enrollment.videosProgress.find(
        (p) => p.videoId.toString() === vid._id.toString()
      ) || {};

      return {
        videoId: vid._id,
        order: vid.order,
        title: vid.title,
        description: vid.description,
        youtubeUrl: vid.youtubeUrl,
        youtubeVideoId: vid.youtubeVideoId,
        durationSeconds: vid.durationSeconds,
        rules: vid.rules,
        isUnlocked: progress.isUnlocked || false,
        unlockedAt: progress.unlockedAt || null,
        deadline: progress.deadline || null,
        isCompleted: progress.isCompleted || false,
        completedAt: progress.completedAt || null,
        watchPercentage: progress.watchPercentage || 0,
        isOverdue: progress.isOverdue || false,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        course: {
          id: course._id,
          title: course.title,
          code: course.code,
          description: course.description,
          category: course.category,
          visibility: course.visibility || 'all',
        },
        enrollment: {
          id: enrollment._id,
          status: isOverdue ? 'overdue' : enrollment.status,
          progressPercentage: enrollment.progressPercentage,
          assignedAt: enrollment.assignedAt,
        },
        timeline,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Record video watch progress & unlock next video
exports.updateVideoProgress = async (req, res) => {
  try {
    const { LMSCourse, LMSEnrollment } = req.models;
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { courseId } = req.params;
    const { videoId, watchPercentage, watchTimeSeconds, markComplete } = req.body;

    const course = await LMSCourse.findOne({ _id: courseId, companyId });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const enrollment = await LMSEnrollment.findOne({
      companyId,
      courseId,
      userId,
    });

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    const currentIdx = enrollment.videosProgress.findIndex(
      (v) =>
        (v.videoId && v.videoId.toString() === videoId?.toString()) ||
        (v._id && v._id.toString() === videoId?.toString())
    );

    if (currentIdx === -1) {
      return res.status(404).json({ success: false, message: 'Video not found in enrollment' });
    }

    const currentProgress = enrollment.videosProgress[currentIdx];
    const courseVideo =
      course.videos[currentIdx] ||
      course.videos.find((v) => v._id.toString() === videoId?.toString());
    const minThreshold = courseVideo?.rules?.minWatchPercentage || 90;

    if (watchPercentage !== undefined) {
      currentProgress.watchPercentage = Math.max(
        currentProgress.watchPercentage || 0,
        Number(watchPercentage)
      );
    }
    if (watchTimeSeconds !== undefined) {
      currentProgress.watchTimeSeconds = Number(watchTimeSeconds);
    }

    const isQualifyingComplete =
      markComplete === true ||
      req.body.isCompleted === true ||
      currentProgress.watchPercentage >= minThreshold;

    if (isQualifyingComplete && !currentProgress.isCompleted) {
      currentProgress.isCompleted = true;
      currentProgress.completedAt = new Date();
      currentProgress.isOverdue = false;

      // Unlock next video in sequence
      const nextIdx = currentIdx + 1;
      if (nextIdx < enrollment.videosProgress.length) {
        const nextProgress = enrollment.videosProgress[nextIdx];
        const nextCourseVideo = course.videos[nextIdx];
        const deadlineDays = nextCourseVideo?.rules?.deadlineDays || 3;
        const now = new Date();

        nextProgress.isUnlocked = true;
        nextProgress.unlockedAt = now;
        nextProgress.deadline = new Date(now.getTime() + deadlineDays * 24 * 60 * 60 * 1000);
      }
    }

    // Recalculate progress
    const completedCount = enrollment.videosProgress.filter((v) => v.isCompleted).length;
    enrollment.progressPercentage = Math.round(
      (completedCount / enrollment.videosProgress.length) * 100
    );

    if (enrollment.progressPercentage === 100) {
      enrollment.status = 'completed';
    } else if (enrollment.progressPercentage > 0) {
      enrollment.status = 'in-progress';
    }

    evaluateOverdueStatus(enrollment.videosProgress);
    await enrollment.save();

    return res.status(200).json({
      success: true,
      message: isQualifyingComplete
        ? 'Lesson completed! Next lesson unlocked.'
        : 'Watch progress updated.',
      data: {
        progressPercentage: enrollment.progressPercentage,
        status: enrollment.status,
        videosProgress: enrollment.videosProgress,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all notes and video slices for a specific course
 */
exports.getCourseNotes = async (req, res) => {
  try {
    const { LMSNote } = req.models;
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { courseId } = req.params;

    if (!LMSNote) {
      return res.status(500).json({ success: false, message: 'LMSNote model not available' });
    }

    const notes = await LMSNote.find({
      companyId,
      userId,
      courseId,
    }).sort({ createdAt: -1 });

    const formatted = notes.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      title: n.title,
      description: n.description,
      slice: n.slice,
      createdAt: n.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error('Error fetching course notes:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create a new note or video slice
 */
exports.createCourseNote = async (req, res) => {
  try {
    const { LMSNote } = req.models;
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { courseId } = req.params;
    const { type, title, description, slice, videoId } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    if (!LMSNote) {
      return res.status(500).json({ success: false, message: 'LMSNote model not available' });
    }

    const note = await LMSNote.create({
      companyId,
      userId,
      courseId,
      videoId: videoId || slice?.videoId || '',
      type: type === 'slice' ? 'slice' : 'normal',
      title: title.trim(),
      description: (description || '').trim(),
      slice:
        type === 'slice' && slice
          ? {
              startTime: Number(slice.startTime) || 0,
              endTime: Number(slice.endTime) || 0,
              videoOrder: Number(slice.videoOrder) || 1,
              videoTitle: slice.videoTitle || '',
            }
          : undefined,
    });

    return res.status(201).json({
      success: true,
      message: 'Note saved successfully',
      data: {
        id: note._id.toString(),
        type: note.type,
        title: note.title,
        description: note.description,
        slice: note.slice,
        createdAt: note.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating course note:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a course note or video slice
 */
exports.deleteCourseNote = async (req, res) => {
  try {
    const { LMSNote } = req.models;
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { noteId } = req.params;

    if (!LMSNote) {
      return res.status(500).json({ success: false, message: 'LMSNote model not available' });
    }

    const deleted = await LMSNote.findOneAndDelete({
      _id: noteId,
      companyId,
      userId,
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Note deleted successfully',
      noteId,
    });
  } catch (error) {
    console.error('Error deleting course note:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
