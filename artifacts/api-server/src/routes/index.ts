import { Router, type IRouter } from "express";
import healthRouter from "./health";
import directoryRouter from "./directory";
import profilesRouter from "./profiles";
import listingsRouter from "./listings";
import adminRouter from "./admin";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(directoryRouter);
router.use(profilesRouter);
router.use(listingsRouter);
router.use(adminRouter);
router.use(storageRouter);

export default router;
