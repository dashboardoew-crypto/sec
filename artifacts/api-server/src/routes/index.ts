import { Router, type IRouter } from "express";
import healthRouter from "./health";
import operationsRouter from "./operations";
import authRouter from "./auth";
import adminDataRouter from "./admin-data";
import reportsVehicleRouter from "./reports-vehicle";
import reportsSolarRouter from "./reports-solar";
import reportsCarBreakdownsRouter from "./reports-car-breakdowns";
import breakdownsRouter from "./breakdowns";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(reportsVehicleRouter);
router.use(reportsSolarRouter);
router.use(reportsCarBreakdownsRouter);
router.use(breakdownsRouter);
router.use(operationsRouter);
router.use(adminDataRouter);

export default router;
