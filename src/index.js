// require("dotenv").config();
// const express = require("express");
// const { getAccessToken } = require("./services/fcmService");

import express from "express";
// import { getAccessToken } from "./services/fcmService.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import cron from "node-cron";
import rateLimit from "express-rate-limit";

// ROUTES
import authRoutes from "./routes/authRoutes.js";
import leetcodeRoutes from "./routes/leetcodeRoutes.js";
import codeforcesRoutes from "./routes/codeforcesRoutes.js";
import contestRoutes from "./routes/contestRoutes.js";
import {
    checkUpcomingContests,
    dailyProblem,
    updateProfile,
} from "./cron-jobs/cronJobs.js";

dotenv.config();
const app = express();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

app.use(express.json());
app.use(cookieParser());

app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        credentials: true,
    })
);

app.use("/auth", authRoutes);
app.use("/codeforces", codeforcesRoutes);
app.use("/leetcode", leetcodeRoutes);
app.use("/contests", contestRoutes);
app.use("/health", (req, res) => {
    res.send("Server is healthy");
});

// CRON JOBS
// Update profiles daily at 12:01 AM
cron.schedule("1 0 * * *", async () => {
    console.log("⏰ Starting daily profile update...");
    try {
        await updateProfile();
        console.log("✅ Daily profile update completed.");
    } catch (error) {
        console.error("❌ Cron job failed:", error);
    }
});
// check for upcoming contests every 30 minutes
cron.schedule("*/30 * * * *", async () => {
    console.log("⏰ Checking for upcoming contests...");
    try {
        await checkUpcomingContests();
    } catch (error) {
        console.error("❌ Cron job failed:", error);
    }
});
// Send daily problem notifications every 30 minutes
cron.schedule("* * * * *", async () => {
    console.log("Checking for notifications");
    try {
        await dailyProblem();
    } catch (error) {
        console.error("❌ Cron job failed:", error);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
