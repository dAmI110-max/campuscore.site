import { Router, type IRouter } from "express";
import healthRouter from "./health";
import directoryRouter from "./directory";
import profilesRouter from "./profiles";
import listingsRouter from "./listings";
import adminRouter from "./admin";
import storageRouter from "./storage";
import accessRouter from "./staff-access";
import messagingRouter from "./messaging";
import notificationsRouter from "./notifications";
import safetyRouter from "./safety";

const router: IRouter = Router();

router.use(healthRouter);
router.use(directoryRouter);
router.use(profilesRouter);
router.use(listingsRouter);
router.use(adminRouter);
router.use(accessRouter);
router.use(storageRouter);
router.use(messagingRouter);
router.use(notificationsRouter);
router.use(safetyRouter);

export default router;
