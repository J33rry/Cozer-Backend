import admin from "firebase-admin";
import { google } from "googleapis";
import path from "path";

import dotenv from "dotenv";

dotenv.config();

// 1. Handle the Private Key newlines for Azure/Docker compatibility
const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

if (!privateKey) {
    console.error("CRITICAL: FIREBASE_PRIVATE_KEY is missing");
}

// 2. Initialize using environment variables
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
    }),
});

// export const db = admin.firestore();

async function verifyToken(idToken) {
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        return decodedToken;
    } catch (error) {
        console.error("Error verifying ID token:", error);
        throw error;
    }
}

async function sendNotification(token, title, body) {
    const message = {
        notification: {
            title,
            body,
        },
        android: {
            priority: "high",
        },
        token,
    };

    try {
        const response = await admin.messaging().send(message);
        console.log("Notification sent successfully:", response);
        return response;
    } catch (error) {
        console.error("Error sending notification:", error);
        throw error;
    }
}

async function sendMulticastNotification(tokens, title, body) {
    const message = {
        notification: {
            title,
            body,
        },
        android: {
            priority: "high",
        },
        tokens,
    };
    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log("Multicast notification sent successfully:", response);
        return response;
    } catch (error) {
        console.error("Error sending multicast notification:", error);
        throw error;
    }
}

async function getAccessToken() {
    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, "../../cozer_service.json"),
        scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });

    try {
        const accessToken = await auth.getAccessToken();
        return accessToken;
    } catch (error) {
        console.error("Error fetching access token:", error);
        throw error;
    }
}
export {
    sendNotification,
    getAccessToken,
    verifyToken,
    sendMulticastNotification,
};
