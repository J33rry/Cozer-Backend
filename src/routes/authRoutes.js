import express from "express";
import {
    authSync,
    getProfile,
    updateProfile,
} from "../controller/authController.js";
import { authMiddlewre } from "../middleware/authMiddleware.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: "Too many auth attempts, please try again later." },
});

router.post("/sync", authLimiter, authSync);
router.get("/profile", authMiddlewre, getProfile);
router.post("/update", authMiddlewre, updateProfile);

// router.post("/calendar", getUserCalender);

export default router;
