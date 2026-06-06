import { Router, Request, Response } from 'express';
import { db, Timestamp } from '../config/firebase.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { AppVersion } from '../types/index.js';

const router = Router();

const VERSION_DOC_ID = 'current';

/**
 * GET /api/version/check
 * Public: Returns the latest app version and APK link.
 * Query: ?platform=android|ios  (optional, defaults to android)
 */
router.get('/check', async (req: Request, res: Response) => {
  try {
    const platform = (req.query.platform as string || 'android').toLowerCase();

    const docRef = db.collection('app_versions').doc(VERSION_DOC_ID);
    const doc = await docRef.get();

    if (!doc.exists) {
      res.json({
        success: true,
        data: {
          version: '0.0.0',
          versionCode: 0,
          apkLink: null,
          releaseNotes: null,
          forceUpdate: false,
        },
      });
      return;
    }

    const data = doc.data() as AppVersion;

    res.json({
      success: true,
      data: {
        version: data.version,
        versionCode: data.versionCode,
        apkLink: platform === 'ios' ? null : data.apkLink,
        releaseNotes: data.releaseNotes || null,
        forceUpdate: data.forceUpdate,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/version/update
 * Admin: Sets the latest app version and APK link.
 */
router.put('/update', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { version, versionCode, apkLink, releaseNotes, forceUpdate } = req.body;

    if (!version || versionCode === undefined) {
      res.status(400).json({ success: false, message: 'Version and versionCode are required' });
      return;
    }

    if (typeof versionCode !== 'number' || versionCode < 0) {
      res.status(400).json({ success: false, message: 'versionCode must be a non-negative number' });
      return;
    }

    const docRef = db.collection('app_versions').doc(VERSION_DOC_ID);

    const data: Partial<AppVersion> = {
      version: String(version),
      versionCode,
      apkLink: apkLink || '',
      releaseNotes: releaseNotes || '',
      forceUpdate: Boolean(forceUpdate),
      updatedAt: Timestamp.now(),
      updatedBy: req.user!.userId,
    };

    await docRef.set(data, { merge: true });

    res.json({
      success: true,
      message: 'App version updated successfully',
      data: {
        version: data.version,
        versionCode: data.versionCode,
        apkLink: data.apkLink,
        releaseNotes: data.releaseNotes,
        forceUpdate: data.forceUpdate,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
