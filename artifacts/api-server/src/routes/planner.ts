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
  examTemplatesTable,
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

const DEFAULT_EXAM_TEMPLATES = [
  {
    key: "jee-main",
    name: "JEE Main",
    description: "Physics, Chemistry, Mathematics with mixed MCQ and numerical structure.",
    examHeader: "JOINT ENTRANCE EXAMINATION",
    examSubheader: "JEE Main Mock Assessment",
    durationMinutes: 180,
    passingScore: null,
    defaultPositiveMarks: 4,
    defaultNegativeMarks: 1,
    isSystem: true,
    showInRegistration: true,
    sections: [
      { title: "Physics", subjectLabel: "Physics", description: "JEE Main Physics. Teacher can mix MCQ and NAT.", questionCount: 25, marksPerQuestion: 4, negativeMarks: 1, preferredQuestionType: "mcq" },
      { title: "Chemistry", subjectLabel: "Chemistry", description: "JEE Main Chemistry. Teacher can mix MCQ and NAT.", questionCount: 25, marksPerQuestion: 4, negativeMarks: 1, preferredQuestionType: "mcq" },
      { title: "Mathematics", subjectLabel: "Mathematics", description: "JEE Main Mathematics. Teacher can mix MCQ and NAT.", questionCount: 25, marksPerQuestion: 4, negativeMarks: 1, preferredQuestionType: "mcq" },
    ],
  },
  {
    key: "gate",
    name: "GATE",
    description: "General Aptitude, Engineering Mathematics, and Core Subject with MCQ, MSQ, and NAT.",
    examHeader: "GRADUATE APTITUDE TEST IN ENGINEERING",
    examSubheader: "GATE Mock Assessment",
    durationMinutes: 180,
    passingScore: null,
    defaultPositiveMarks: 2,
    defaultNegativeMarks: 0.66,
    isSystem: true,
    showInRegistration: true,
    sections: [
      { title: "General Aptitude", subjectLabel: "General Aptitude", description: "10 questions. Mixed +1 and +2. MCQ can carry -1/3 or -2/3. NAT/MSQ no negative.", questionCount: 10, marksPerQuestion: 1, negativeMarks: 0.33, preferredQuestionType: "mcq" },
      { title: "Engineering Mathematics", subjectLabel: "Engineering Maths", description: "Around 10-12 questions. Mixed MCQ, MSQ, NAT allowed.", questionCount: 10, marksPerQuestion: 1, negativeMarks: 0.33, preferredQuestionType: "mcq" },
      { title: "Core Subject", subjectLabel: "Core Subject", description: "Around 40-45 questions. Core paper with MCQ, MSQ, NAT.", questionCount: 45, marksPerQuestion: 2, negativeMarks: 0.66, preferredQuestionType: "mcq" },
    ],
  },
  {
    key: "iit-jam",
    name: "IIT JAM",
    description: "Single-subject paper with Section A, B, and C.",
    examHeader: "JOINT ADMISSION TEST FOR MASTERS",
    examSubheader: "IIT JAM Mock Assessment",
    durationMinutes: 180,
    passingScore: null,
    defaultPositiveMarks: 2,
    defaultNegativeMarks: 0.33,
    isSystem: true,
    showInRegistration: true,
    sections: [
      { title: "Section A", subjectLabel: "Section A", description: "30 MCQs with negative marking.", questionCount: 30, marksPerQuestion: 1, negativeMarks: 0.33, preferredQuestionType: "mcq" },
      { title: "Section B", subjectLabel: "Section B", description: "10 MSQs with no negative marking.", questionCount: 10, marksPerQuestion: 2, negativeMarks: 0, preferredQuestionType: "multi" },
      { title: "Section C", subjectLabel: "Section C", description: "20 NAT questions with no negative marking.", questionCount: 20, marksPerQuestion: 2, negativeMarks: 0, preferredQuestionType: "integer" },
    ],
  },
  {
    key: "cuet",
    name: "CUET",
    description: "Language, Domain Subject, and General Test style structure. MCQ only.",
    examHeader: "COMMON UNIVERSITY ENTRANCE TEST",
    examSubheader: "CUET Mock Assessment",
    durationMinutes: 60,
    passingScore: null,
    defaultPositiveMarks: 5,
    defaultNegativeMarks: 1,
    isSystem: true,
    showInRegistration: true,
    sections: [
      { title: "Language", subjectLabel: "Language", description: "50 questions, attempt around 40. MCQ only.", questionCount: 50, marksPerQuestion: 5, negativeMarks: 1, preferredQuestionType: "mcq" },
      { title: "Domain Subjects", subjectLabel: "Domain Subjects", description: "Subject-specific MCQ section. Multiple subjects can be cloned later by planner.", questionCount: 50, marksPerQuestion: 5, negativeMarks: 1, preferredQuestionType: "mcq" },
      { title: "General Test", subjectLabel: "General Test", description: "General aptitude and reasoning. MCQ only.", questionCount: 50, marksPerQuestion: 5, negativeMarks: 1, preferredQuestionType: "mcq" },
    ],
  },
  {
    key: "neet",
    name: "NEET",
    description: "Physics, Chemistry, Biology with NEET-style optional section logic.",
    examHeader: "NATIONAL ELIGIBILITY CUM ENTRANCE TEST",
    examSubheader: "NEET Mock Assessment",
    durationMinutes: 200,
    passingScore: null,
    defaultPositiveMarks: 4,
    defaultNegativeMarks: 1,
    isSystem: true,
    showInRegistration: true,
    sections: [
      { title: "Physics", subjectLabel: "Physics", description: "45 MCQs. NEET-style section with optional choice rules configurable later.", questionCount: 45, marksPerQuestion: 4, negativeMarks: 1, preferredQuestionType: "mcq" },
      { title: "Chemistry", subjectLabel: "Chemistry", description: "45 MCQs. NEET-style section with optional choice rules configurable later.", questionCount: 45, marksPerQuestion: 4, negativeMarks: 1, preferredQuestionType: "mcq" },
      { title: "Biology", subjectLabel: "Biology", description: "90 MCQs. Includes Botany/Zoology coverage as needed.", questionCount: 90, marksPerQuestion: 4, negativeMarks: 1, preferredQuestionType: "mcq" },
    ],
  },
];

async function ensureExamTemplates(userId: number) {
  const existing = await db.select().from(examTemplatesTable);
  if (existing.length > 0) return existing;
  const inserted = await db.insert(examTemplatesTable).values(
    DEFAULT_EXAM_TEMPLATES.map((template) => ({
      ...template,
      sections: JSON.stringify(template.sections),
      createdBy: userId,
    })),
  ).returning();
  return inserted;
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

router.get("/planner/exam-templates", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["planner", "super_admin", "admin"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const rows = await ensureExamTemplates(auth.userId);
  return res.json(
    rows.map((row) => ({
      ...row,
      examHeader: row.examHeader ?? null,
      examSubheader: row.examSubheader ?? null,
      showInRegistration: row.showInRegistration ?? true,
      sections: row.sections ? JSON.parse(row.sections) : [],
    })),
  );
});

router.post("/planner/exam-templates", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["planner", "super_admin"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { key, name, description, examHeader, examSubheader, durationMinutes, passingScore, defaultPositiveMarks, defaultNegativeMarks, sections, showInRegistration } = req.body;
  if (!name || !Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "name and sections are required" });
  }
  const [template] = await db.insert(examTemplatesTable).values({
    key: key ? String(key) : String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: String(name),
    description: description ? String(description) : null,
    examHeader: examHeader ? String(examHeader) : null,
    examSubheader: examSubheader ? String(examSubheader) : null,
    durationMinutes: Number(durationMinutes) || 180,
    passingScore: passingScore === undefined || passingScore === null || String(passingScore).trim() === "" ? null : Number(passingScore),
    defaultPositiveMarks: Number(defaultPositiveMarks) || 1,
    defaultNegativeMarks: Number(defaultNegativeMarks) || 0,
    sections: JSON.stringify(sections),
    isSystem: false,
    showInRegistration: showInRegistration !== false,
    createdBy: auth.userId,
  }).returning();
  return res.status(201).json({ ...template, sections: JSON.parse(template.sections) });
});

router.patch("/planner/exam-templates/:id", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["planner", "super_admin"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const templateId = Number(req.params.id);
  const { key, name, description, examHeader, examSubheader, durationMinutes, passingScore, defaultPositiveMarks, defaultNegativeMarks, sections, showInRegistration } = req.body;
  const updates: Record<string, unknown> = {};
  if (key !== undefined) updates.key = String(key);
  if (name !== undefined) updates.name = String(name);
  if (description !== undefined) updates.description = description ? String(description) : null;
  if (examHeader !== undefined) updates.examHeader = examHeader ? String(examHeader) : null;
  if (examSubheader !== undefined) updates.examSubheader = examSubheader ? String(examSubheader) : null;
  if (durationMinutes !== undefined) updates.durationMinutes = Number(durationMinutes);
  if (passingScore !== undefined) {
    updates.passingScore = passingScore === null || String(passingScore).trim() === "" ? null : Number(passingScore);
  }
  if (defaultPositiveMarks !== undefined) updates.defaultPositiveMarks = Number(defaultPositiveMarks);
  if (defaultNegativeMarks !== undefined) updates.defaultNegativeMarks = Number(defaultNegativeMarks);
  if (sections !== undefined) updates.sections = JSON.stringify(sections);
  if (showInRegistration !== undefined) updates.showInRegistration = Boolean(showInRegistration);
  const [template] = await db.update(examTemplatesTable).set(updates).where(eq(examTemplatesTable.id, templateId)).returning();
  if (!template) return res.status(404).json({ error: "Template not found" });
  return res.json({ ...template, sections: JSON.parse(template.sections) });
});

export { router as plannerRouter };
