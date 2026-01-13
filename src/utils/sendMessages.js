import admin from "firebase-admin";

// 1. Initialize the App (Run this only once in your server start-up)
const serviceAccount = require("./service-account.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

// 2. The Sending Function
async function sendNotification(targetToken) {
    // The Payload
    const message = {
        token: targetToken, // The user's FCM token from your DB

        // "notification" key: Automatically displayed by the OS when app is in background
        notification: {
            title: "Task Reminder",
            body: "Hey, it's time for your daily coding practice!",
        },

        // "data" key: Custom key-value pairs for your app logic (e.g., navigation)
        // NOTE: All values here must be strings.
        data: {
            screen: "CodingScreen",
            problemId: "2182G",
            userId: "12345",
        },

        // Platform-specific overrides (Optional, good for reliability)
        android: {
            priority: "high",
            notification: {
                sound: "default",
                channelId: "daily_reminders", // Needs to match channel created in Android code
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    badge: 1,
                },
            },
        },
    };

    try {
        // 3. Send the message
        const response = await admin.messaging().send(message);
        console.log("✅ Successfully sent message:", response);
    } catch (error) {
        console.error("❌ Error sending message:", error);
        if (error.code === "messaging/registration-token-not-registered") {
            console.log("⚠️ Token is invalid/expired. Remove it from your DB.");
            // Logic to delete token from database goes here
        }
    }
}

// Usage
const userToken = "fH8sD9s..."; // Fetch this from your DB
sendNotification(userToken);
