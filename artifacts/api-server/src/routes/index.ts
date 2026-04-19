import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import { testsRouter } from "./tests";
import activityRouter from "./activity";
import notificationsRouter from "./notifications";
import leaderboardRouter from "./leaderboard";
import analyticsRouter from "./analytics";
import { teacherPerformanceRouter } from "./teacherPerformance";
import { dmRouter } from "./dm";
import { lecturePlansRouter } from "./lecturePlans";
import { questionBankRouter } from "./questionBank";
import { plannerRouter } from "./planner";
import studentReviewRouter from "./studentReview";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(dashboardRouter);
router.use(testsRouter);
router.use("/activity", activityRouter);
router.use(notificationsRouter);
router.use(leaderboardRouter);
router.use(analyticsRouter);
router.use(teacherPerformanceRouter);
router.use(dmRouter);
router.use(lecturePlansRouter);
router.use(questionBankRouter);
router.use(plannerRouter);
router.use(studentReviewRouter);

export default router;
