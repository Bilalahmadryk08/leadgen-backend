import express from 'express';
import { 
  initializeCaptchaSession, 
  checkCaptchaStatus, 
  resolveCaptcha,
  getCaptchaPage 
} from '../controllers/captchaController.js';

const router = express.Router();

// Initialize a new CAPTCHA session
router.post('/initialize', initializeCaptchaSession);

// Get the CAPTCHA page content for iframe
router.get('/page/:sessionId', getCaptchaPage);

// Check if CAPTCHA is resolved
router.get('/status/:sessionId', checkCaptchaStatus);

// Mark CAPTCHA as resolved and continue scraping
router.post('/resolve/:sessionId', resolveCaptcha);

export default router;
