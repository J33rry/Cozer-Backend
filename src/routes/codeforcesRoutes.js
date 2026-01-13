import express from "express";
import {
    getProblemDetail,
    getProblems,
    getUserStats,
} from "../controller/codeforcesController.js";

const router = express.Router();

router.post("/problems", getProblems);

router.post("/problem", getProblemDetail);

router.get("/userStats", getUserStats);

export default router;
