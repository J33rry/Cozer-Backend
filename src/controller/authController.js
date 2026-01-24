import { codeforces, leetcode, users } from "../db/schema.js";
import { verifyToken } from "../services/fcmService.js";
import { eq } from "drizzle-orm";
import db from "../utils/db.js";
import axios from "axios";

export const authSync = async (req, res) => {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    // console.log(req.headers.authorization);
    const { pushToken, isAnonymous } = req.body;

    if (!idToken) {
        return res.status(401).send("No token provided");
    }

    try {
        const decodedToken = await verifyToken(idToken);
        // console.log(decodedToken);
        console.log(isAnonymous);
        const { uid, email, name } = decodedToken;
        const result = await db
            .insert(users)
            .values({
                firebase_uid: uid,
                email: email,
                display_name: name || "User",
                fcm_token: pushToken,
                is_guest: isAnonymous ? 1 : 0,
            })
            .onConflictDoUpdate({
                target: users.firebase_uid,
                set: {
                    fcm_token: pushToken,
                    email: email,
                    is_guest: isAnonymous ? 1 : 0,
                },
            })
            .returning();

        const user = result[0];

        res.json({
            status: "success",
            userId: user.id,
            displayName: user.display_name,
            leetcodeUser: user.leetcode_user,
            codeforcesUser: user.codeforces_user,
        });
    } catch (error) {
        console.error("Auth Sync Error:", error);
        res.status(500).send("Internal Server Error");
    }
};

export const getProfile = async (req, res) => {
    const userId = req.user.user_id;
    console.log(req.user);
    try {
        const user = await db
            .select()
            .from(users)
            .where(eq(users.firebase_uid, userId))
            .limit(1);

        if (user.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        // console.log(user[0]);
        if (!user[0].leetcode_user && !user[0].codeforces_user) {
            return res.json(user[0]);
        }
        const leetcodeData = await db
            .select()
            .from(leetcode)
            .where(eq(leetcode.user_id, user[0].id))
            .limit(1);
        const codeforcesData = await db
            .select()
            .from(codeforces)
            .where(eq(codeforces.user_id, user[0].id))
            .limit(1);
        res.json({
            status: "success",
            profile: user[0],
            leetcode_stats:
                leetcodeData.length > 0 ? leetcodeData[0] : "User not linked",
            codeforces_stats:
                codeforcesData.length > 0
                    ? codeforcesData[0]
                    : "User not linked",
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).send("Internal Server Error");
    }
};

export const updateProfile = async (req, res) => {
    const {
        display_name,
        leetcode_user,
        codeforces_user,
        daily_notifications,
        contest_notifications,
        daily_time,
    } = req.body;

    const firebaseUid = req.user.user_id;
    console.log("req");

    try {
        const updatedUserResults = await db
            .update(users)
            .set({
                display_name: display_name,
                leetcode_user: leetcode_user,
                codeforces_user: codeforces_user,
                daily_notifications: daily_notifications,
                contest_notifications: contest_notifications,
                daily_time: daily_time,
            })
            .where(eq(users.firebase_uid, firebaseUid))
            .returning({ id: users.id });

        if (updatedUserResults.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        console.log("db updated");
        const internalUserId = updatedUserResults[0].id;

        if (leetcode_user) {
            const check = await fetch(
                `https://alfa-leetcode-api.onrender.com/userProfile/${leetcode_user}`,
            );
            const data = await check.json();

            if (!data) {
                return res
                    .status(400)
                    .json({ message: "Failed to fetch LeetCode data" });
            }

            await db
                .insert(leetcode)
                .values({
                    user_id: internalUserId,
                    total_problems_solved: data.totalSolved,
                    easy_problems_solved: data.easySolved,
                    medium_problems_solved: data.mediumSolved,
                    hard_problems_solved: data.hardSolved,
                    ranking: data.ranking,
                    calendar: data.submissionCalendar,
                    recent_submission: data.recentSubmissions,
                    total_questions: data.totalQuestions,
                    total_easy: data.totalEasy,
                    total_medium: data.totalMedium,
                    total_hard: data.totalHard,
                })
                .onConflictDoUpdate({
                    target: leetcode.user_id,
                    set: {
                        total_problems_solved: data.totalSolved,
                        easy_problems_solved: data.easySolved,
                        medium_problems_solved: data.mediumSolved,
                        hard_problems_solved: data.hardSolved,
                        ranking: data.ranking,
                        calendar: data.submissionCalendar,
                        recent_submission: data.recentSubmissions,
                        total_questions: data.totalQuestions,
                        total_easy: data.totalEasy,
                        total_medium: data.totalMedium,
                        total_hard: data.totalHard,
                    },
                });
        }
        console.log("leetcode updated");
        if (codeforces_user) {
            console.log(codeforces_user);
            const [inforesponse, ratingresponse] = await Promise.all([
                axios.get(
                    `https://codeforces.com/api/user.info?handles=${codeforces_user}`,
                    {
                        headers: {
                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Content-Type": "application/json",
                            "Accept-Encoding": "gzip,deflate,compress",
                        },
                        timeout: 10000,
                    },
                ),

                axios.get(
                    `https://codeforces.com/api/user.rating?handle=${codeforces_user}`,
                    {
                        headers: {
                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Content-Type": "application/json",
                            "Accept-Encoding": "gzip,deflate,compress",
                        },
                        timeout: 10000,
                    },
                ),
            ]);
            console.log("data found");

            const infoData = inforesponse.data.result[0];
            const ratingData = ratingresponse.data.result;
            console.log(infoData);
            // console.log(ratingData);

            if (!infoData || !ratingData) {
                return res
                    .status(400)
                    .json({ message: "Failed to fetch Codeforces data" });
            }

            await db
                .insert(codeforces)
                .values({
                    user_id: internalUserId,
                    rating: infoData.rating || 0,
                    max_rating: infoData.maxRating || 0,
                    rank: infoData.rank || "unrated",
                    max_rank: infoData.maxRank || "unrated",
                    contests: ratingData,
                })
                .onConflictDoUpdate({
                    target: codeforces.user_id,
                    set: {
                        rating: infoData.rating || 0,
                        max_rating: infoData.maxRating || 0,
                        rank: infoData.rank || "unrated",
                        max_rank: infoData.maxRank || "unrated",
                        contests: ratingData,
                    },
                });
        }
        console.log("codeforces updated");
        await db.insert();
        res.json({
            status: "success",
            message: "Profile and stats updated successfully",
        });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
