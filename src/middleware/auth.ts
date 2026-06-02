import { Request, Response, NextFunction } from "express";
import { auth, db, Timestamp } from "../config/firebase";
import { User } from "../types";
import { getNextId } from "../utils/id-generator";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        uid: string;
        email: string;
        role: "customer" | "admin";
        walletId?: string;
      };
    }
  }
}

async function autoCreateUser(firebaseUid: string, email: string) {
  const uid = firebaseUid.startsWith("RAD5")
    ? firebaseUid
    : await getNextId("RAD5");
  const walletId = uid;

  // 1. Use firebaseUid directly as the document ID for O(1) lookups
  const userRef = db.collection("users").doc(firebaseUid);
  const walletRef = db.collection("wallets").doc();

  try {
    await db.runTransaction(async (transaction) => {
      // 2. Use .create() instead of .set()
      // This will throw an error if the document already exists,
      // preventing race conditions from concurrent requests creating duplicate data.
      transaction.create(userRef, {
        uid,
        firebaseUid,
        fullName: "",
        phoneNumber: "",
        email,
        role: "customer",
        walletId,
        pin: null,
        pinSetup: false,
        expoPushToken: null,
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      transaction.create(walletRef, {
        walletId,
        userId: userRef.id,
        balance: 0,
        totalFunded: 0,
        totalSpent: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    return { docId: userRef.id, uid, walletId };
  } catch (error: any) {
    // If error is ALREADY_EXISTS (Code 6), another concurrent request just created the user.
    // We can safely ignore the creation and let the middleware fetch the newly created user.
    if (error.code === 6) {
      console.log(
        `User ${firebaseUid} was already being created by another request.`,
      );
      const existingUser = await userRef.get();
      const data = existingUser.data() as User;
      return { docId: existingUser.id, uid: data.uid, walletId: data.walletId };
    }
    throw error;
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res
        .status(401)
        .json({ success: false, message: "Access denied. No token provided." });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = await auth.verifyIdToken(token);
    const firebaseUid = decoded.uid;
    const email = decoded.email || "";

    // 3. Direct document lookup instead of a query
    const userRef = db.collection("users").doc(firebaseUid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const created = await autoCreateUser(firebaseUid, email);
      req.user = {
        userId: created.docId,
        uid: created.uid,
        email,
        role: "customer",
        walletId: created.walletId,
      };
      next();
      return;
    }

    const user = userDoc.data() as User;

    if (!user.isActive) {
      res
        .status(403)
        .json({
          success: false,
          message: "Account deactivated. Contact admin.",
        });
      return;
    }

    req.user = {
      userId: userDoc.id,
      uid: user.uid,
      email: user.email,
      role: user.role,
      walletId: user.walletId,
    };
    next();
  } catch (error: any) {
    if (error.code === "auth/id-token-expired") {
      res
        .status(401)
        .json({ success: false, message: "Token expired. Re-login." });
      return;
    }
    res.status(401).json({ success: false, message: "Invalid token" });
  }
}
