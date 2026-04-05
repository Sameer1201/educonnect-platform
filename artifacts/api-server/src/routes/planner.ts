import { Router } from "express";
import {
  db,
  classesTable,
  enrollmentsTable,
  usersTable,
  subjectsTable,
  chaptersTable,
  lecturesTable,
  testsTable,
  lecturePlansTable,
  assignmentsTable,
  questionBankQuestionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function getAuth(req: any, res: any): { userId: number; role: string } | null {
  const userId = Number(req.cookies?.userId);
  const role = req.cookies?.userRole;
  if (!userId || Number.isNaN(userId) || !role) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return { userId, role };
}

function sameHourWindow(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) < 60 * 60 * 1000;
}

router.get("/planner/insights", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["planner", "super_admin"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const allClasses = await db.select().from(classesTable);
  const plannerClasses = auth.role === "planner"
    ? allClasses.filter((item) => item.plannerId === auth.userId)
    : allClasses;
  const classIds = plannerClasses.map((item) => item.id);

  const [enrollments, teachers, subjects, chapters, lectures, tests, assignments, questionBank, lecturePlans] = await Promise.all([
    classIds.length > 0 ? db.select().from(enrollmentsTable) : Promise.resolve([]),
    db.select().from(usersTable).where(eq(usersTable.role, "admin" as any)).catch(() => [] as any[]),
    classIds.length > 0 ? db.select().from(subjectsTable) : Promise.resolve([]),
    db.select().from(chaptersTable),
    db.select().from(lecturesTable),
    db.select().from(testsTable),
    db.select().from(assignmentsTable),
    db.select().from(questionBankQuestionsTable),
    db.select().from(lecturePlansTable),
  ]);

  const plannerSubjects = subjects.filter((subject) => classIds.includes(subject.classId));
  const subjectIds = plannerSubjects.map((subject) => subject.id);
  const plannerChapters = chapters.filter((chapter) => subjectIds.includes(chapter.subjectId));
  const chapterIds = plannerChapters.map((chapter) => chapter.id);
  const plannerLectures = lectures.filter((lecture) => subjectIds.includes(lecture.subjectId));
  const plannerTests = tests.filter((test) => test.classId !== null && classIds.includes(test.classId));
  const plannerAssignments = assignments.filter((assignment) => classIds.includes(assignment.classId));
  const plannerQuestionBank = questionBank.filter((question) => classIds.includes(question.classId));
  const plannerLecturePlans = auth.role === "planner"
    ? lecturePlans.filter((item) => item.plannerId === auth.userId)
    : lecturePlans;

  const teacherMap = new Map(teachers.map((teacher: any) => [teacher.id, teacher]));

  const classCapacities = plannerClasses.map((cls) => {
    const enrolledCount = enrollments.filter((item) => item.classId === cls.id).length;
    const maxStudents = cls.maxStudents ?? 0;
    const utilization = maxStudents > 0 ? Math.round((enrolledCount / maxStudents) * 100) : null;
    return {
      classId: cls.id,
      classTitle: cls.title,
      exam: cls.subject,
      teacherId: cls.adminId,
      teacherName: teacherMap.get(cls.adminId)?.fullName ?? null,
      enrolledCount,
      maxStudents,
      utilization,
      seatsLeft: maxStudents > 0 ? Math.max(maxStudents - enrolledCount, 0) : null,
      waitlistRisk: maxStudents > 0 && enrolledCount >= maxStudents,
    };
  });

  const teacherLoads = teachers.map((teacher: any) => {
    const classesForTeacher = plannerClasses.filter((cls) => cls.adminId === teacher.id);
    const plansForTeacher = plannerLecturePlans.filter((plan) => plan.teacherId === teacher.id);
    return {
      teacherId: teacher.id,
      teacherName: teacher.fullName,
      subject: teacher.subject ?? null,
      classesCount: classesForTeacher.length,
      lecturePlansCount: plansForTeacher.length,
      nextClassAt: classesForTeacher
        .filter((cls) => cls.scheduledAt)
        .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0]?.scheduledAt ?? null,
    };
  });

  const teacherConflicts = plannerClasses.flatMap((cls) => {
    if (!cls.scheduledAt) return [];
    const currentTime = new Date(cls.scheduledAt);
    const teacherPlans = plannerLecturePlans.filter((plan) => plan.teacherId === cls.adminId);
    const clashingPlans = teacherPlans.filter((plan) => sameHourWindow(currentTime, new Date(plan.scheduledAt)));
    const clashingClasses = plannerClasses.filter((other) => other.id !== cls.id && other.adminId === cls.adminId && other.scheduledAt && sameHourWindow(currentTime, new Date(other.scheduledAt!)));
    if (clashingPlans.length === 0 && clashingClasses.length === 0) return [];
    return [{
      teacherId: cls.adminId,
      teacherName: teacherMap.get(cls.adminId)?.fullName ?? null,
      classId: cls.id,
      classTitle: cls.title,
      scheduledAt: cls.scheduledAt,
      conflictingLecturePlans: clashingPlans.map((plan) => ({ id: plan.id, title: plan.title, scheduledAt: plan.scheduledAt })),
      conflictingClasses: clashingClasses.map((item) => ({ id: item.id, title: item.title, scheduledAt: item.scheduledAt })),
    }];
  });

  const curriculumTimeline = plannerClasses.map((cls) => {
    const classSubjects = plannerSubjects.filter((subject) => subject.classId === cls.id);
    const subjectData = classSubjects.map((subject) => {
      const subjectChapters = plannerChapters.filter((chapter) => chapter.subjectId === subject.id);
      const lectureCount = plannerLectures.filter((lecture) => lecture.subjectId === subject.id).length;
      const questionCount = plannerQuestionBank.filter((question) => question.subjectId === subject.id).length;
      const testCount = plannerTests.filter((test) => test.chapterId !== null && subjectChapters.some((chapter) => chapter.id === test.chapterId)).length;
      return {
        subjectId: subject.id,
        subjectTitle: subject.title,
        teacherId: subject.teacherId ?? cls.adminId,
        teacherName: teacherMap.get(subject.teacherId ?? cls.adminId)?.fullName ?? null,
        chapterCount: subjectChapters.length,
        lectureCount,
        questionCount,
        testCount,
        completionScore: Math.min(100, Math.round((((lectureCount > 0 ? 1 : 0) + (questionCount > 0 ? 1 : 0) + (testCount > 0 ? 1 : 0)) / 3) * 100)),
      };
    });
    return {
      classId: cls.id,
      classTitle: cls.title,
      exam: cls.subject,
      subjects: subjectData,
    };
  });

  const contentReadiness = plannerClasses.map((cls) => {
    const classSubjects = plannerSubjects.filter((subject) => subject.classId === cls.id);
    const subjectIdsForClass = classSubjects.map((subject) => subject.id);
    const chapterIdsForClass = plannerChapters.filter((chapter) => subjectIdsForClass.includes(chapter.subjectId)).map((chapter) => chapter.id);
    return {
      classId: cls.id,
      classTitle: cls.title,
      notesReady: plannerLecturePlans.some((plan) => plan.subject === cls.subject && !!plan.description?.trim()),
      questionBankReady: plannerQuestionBank.some((question) => question.classId === cls.id),
      testsReady: plannerTests.some((test) => test.classId === cls.id),
      lecturesReady: plannerLectures.some((lecture) => subjectIdsForClass.includes(lecture.subjectId)),
      assignmentsReady: plannerAssignments.some((assignment) => assignment.classId === cls.id),
      chapterCoverage: chapterIdsForClass.length,
    };
  });

  const examCalendarMapping = Object.entries(
    plannerClasses.reduce<Record<string, number>>((acc, cls) => {
      acc[cls.subject] = (acc[cls.subject] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([exam, batchCount]) => ({
    exam,
    batchCount,
    reversePlanHint: `Prioritize ${exam} batches ${batchCount > 1 ? "in weekly sequence" : "this week"} and align tests before major revision windows.`,
  }));

  const approvalQueue = [
    ...teacherConflicts.map((conflict) => ({
      type: "conflict",
      priority: "high",
      title: `Teacher conflict for ${conflict.teacherName ?? "assigned teacher"}`,
      detail: `${conflict.classTitle} overlaps with another scheduled item.`,
    })),
    ...contentReadiness
      .filter((item) => !item.questionBankReady || !item.testsReady || !item.lecturesReady)
      .map((item) => ({
        type: "readiness",
        priority: "medium",
        title: `Content gap in ${item.classTitle}`,
        detail: `Lectures ready: ${item.lecturesReady ? "yes" : "no"}, question bank: ${item.questionBankReady ? "yes" : "no"}, tests: ${item.testsReady ? "yes" : "no"}`,
      })),
  ];

  const substituteTeacherSuggestions = plannerClasses.map((cls) => {
    const alternatives = teachers
      .filter((teacher: any) => teacher.id !== cls.adminId)
      .sort((a: any, b: any) => {
        const aLoad = teacherLoads.find((item) => item.teacherId === a.id)?.lecturePlansCount ?? 0;
        const bLoad = teacherLoads.find((item) => item.teacherId === b.id)?.lecturePlansCount ?? 0;
        return aLoad - bLoad;
      })
      .slice(0, 3)
      .map((teacher: any) => ({
        teacherId: teacher.id,
        teacherName: teacher.fullName,
        subject: teacher.subject ?? null,
      }));
    return {
      classId: cls.id,
      classTitle: cls.title,
      currentTeacherId: cls.adminId,
      currentTeacherName: teacherMap.get(cls.adminId)?.fullName ?? null,
      suggestions: alternatives,
    };
  });

  const privatePublicRules = {
    studentVisible: ["class", "test"],
    internalOnly: ["lecture_plan", "management_meeting", "faculty_sync"],
  };

  res.json({
    batchCapacityPlanner: classCapacities,
    teacherAvailability: teacherLoads,
    conflictDetection: teacherConflicts,
    curriculumTimeline,
    smartScheduling: {
      upcomingTests: plannerTests
        .filter((test) => test.scheduledAt)
        .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
        .slice(0, 8),
      recommendations: plannerClasses.slice(0, 8).map((cls) => ({
        classId: cls.id,
        classTitle: cls.title,
        suggestion: cls.scheduledAt
          ? "Keep revision and tests aligned around this scheduled batch slot."
          : "This batch has no scheduled slot yet. Schedule next lecture soon.",
      })),
    },
    privatePublicRules,
    batchAssignmentAutomation: examCalendarMapping,
    analyticsDashboard: {
      totalBatches: plannerClasses.length,
      totalTeachers: teachers.length,
      totalLecturePlans: plannerLecturePlans.length,
      uncoveredTeachers: teacherLoads.filter((item) => item.lecturePlansCount === 0).length,
    },
    rescheduleWorkflow: plannerClasses
      .filter((cls) => cls.scheduledAt)
      .map((cls) => ({
        classId: cls.id,
        classTitle: cls.title,
        scheduledAt: cls.scheduledAt,
        canReschedule: true,
      })),
    teacherReplacementFlow: substituteTeacherSuggestions,
    contentReadinessTracker: contentReadiness,
    examCalendarMapping,
    plannerApprovalQueue: approvalQueue,
  });
});

export { router as plannerRouter };
