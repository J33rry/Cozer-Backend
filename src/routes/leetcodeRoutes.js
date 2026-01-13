import express from "express";
import {
    getDailyProblem,
    getProblemDetail,
    getProblems,
    getUserStats,
} from "../controller/leetcodeController.js";

const router = express.Router();

router.get("/daily", getDailyProblem);

router.post("/problems", getProblems);

router.get("/problem/:slug", getProblemDetail);

router.get("/userStats", getUserStats);

export default router;
