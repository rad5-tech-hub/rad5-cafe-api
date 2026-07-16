import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

router.post('/setup-pin', authenticate, async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      res.status(400).json({ success: false, message: 'PIN is required' });
      return;
    }
    await authService.setupPin(req.user!.userId, pin);
    res.json({ success: true, message: 'PIN set up successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/change-pin', authenticate, async (req: Request, res: Response) => {
  try {
    const { oldPin, newPin } = req.body;
    if (!oldPin || !newPin) {
      res.status(400).json({ success: false, message: 'Old PIN and new PIN are required' });
      return;
    }
    await authService.changePin(req.user!.userId, oldPin, newPin);
    res.json({ success: true, message: 'PIN changed successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

router.put('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const { fullName, phoneNumber } = req.body;
    await authService.updateProfile(req.user!.userId, { fullName, phoneNumber });
    res.json({ success: true, message: 'Profile updated' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/expo-push-token', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Push token is required' });
      return;
    }
    await authService.saveExpoPushToken(req.user!.userId, token);
    res.json({ success: true, message: 'Push token saved' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/web-push-token', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Web push token is required' });
      return;
    }
    const { fcmWebPushService } = await import('../services/fcm-web-push.js');
    await fcmWebPushService.saveToken(req.user!.userId, token);
    res.json({ success: true, message: 'Web push token saved' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/web-push-token', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Web push token is required' });
      return;
    }
    const { fcmWebPushService } = await import('../services/fcm-web-push.js');
    await fcmWebPushService.removeToken(req.user!.userId, token);
    res.json({ success: true, message: 'Web push token removed' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/referral', authenticate, async (req: Request, res: Response) => {
  try {
    const { referralCode, method } = req.body;
    if (!referralCode || !method) {
      res.status(400).json({ success: false, message: 'Referral code and method are required' });
      return;
    }
    await authService.setReferral(req.user!.userId, referralCode, method);
    res.json({ success: true, message: 'Referral applied successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/has-fullname', authenticate, async (req: Request, res: Response) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    const hasFullName = !!(profile.fullName && profile.fullName.trim().length > 0);
    res.json({ success: true, hasFullName });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/fullname', authenticate, async (req: Request, res: Response) => {
  try {
    const { fullName } = req.body;
    if (!fullName || !fullName.trim()) {
      res.status(400).json({ success: false, message: 'fullName is required' });
      return;
    }
    await authService.updateProfile(req.user!.userId, { fullName: fullName.trim() });
    res.json({ success: true, message: 'Full name saved' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
