import express from "express";
import { getUpcomingContests } from "../controller/contestController.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

const contestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: "Too many requests from this IP, please try again later.",
    },
});

router.get("/", contestLimiter, getUpcomingContests);

export default router;
