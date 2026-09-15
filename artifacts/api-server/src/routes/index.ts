import { Router, type IRouter } from "express";
import healthRouter from "./health";
import operationsRouter from "./operations";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(operationsRouter);

export default router;
