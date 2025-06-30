# 🔐 CAPTCHA Integration Guide

This system allows users to solve CAPTCHAs directly within your application using iframes, without opening new tabs or popups.

## 🚀 How It Works

1. **User initiates lead generation** → Your app sends request to `/api/leads`
2. **If CAPTCHA is detected** → Server responds with `requiresCaptcha: true` and `sessionId`
3. **Show CAPTCHA iframe** → Display iframe with `/api/captcha/page/{sessionId}`
4. **User solves CAPTCHA** → CAPTCHA page auto-detects completion
5. **Continue scraping** → System automatically continues with lead generation

## 📋 API Endpoints

### POST `/api/leads`
Generate leads with CAPTCHA handling
```json
{
  "prompt": "generate 10 leads of restaurants in New York",
  "source": "scraper",
  "maxResults": 10,
  "sessionId": "optional-existing-session-id"
}
```

**Response (CAPTCHA Required):**
```json
{
  "requiresCaptcha": true,
  "sessionId": "captcha_1234567890_abc123",
  "message": "CAPTCHA verification required",
  "captchaUrl": "/api/captcha/page/captcha_1234567890_abc123"
}
```

**Response (Success):**
```json
{
  "leads": [...],
  "meta": {
    "count": 10,
    "source": "scraper",
    "duration": 45.2
  }
}
```

### POST `/api/captcha/initialize`
Initialize a new CAPTCHA session
```json
{
  "prompt": "restaurants in New York"
}
```

### GET `/api/captcha/page/{sessionId}`
Get CAPTCHA page for iframe display

### GET `/api/captcha/status/{sessionId}`
Check if CAPTCHA is resolved

### POST `/api/captcha/resolve/{sessionId}`
Mark CAPTCHA as resolved and continue

## 🎨 Frontend Integration

### Basic HTML Structure
```html
<!-- CAPTCHA Container -->
<div id="captchaContainer" class="hidden">
    <div class="captcha-header">
        🔐 CAPTCHA Verification Required
    </div>
    <iframe id="captchaIframe" src="" width="100%" height="600px"></iframe>
</div>
```

### JavaScript Integration
```javascript
// Generate leads
async function generateLeads(prompt, source) {
    const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, source })
    });
    
    const result = await response.json();
    
    if (result.requiresCaptcha) {
        // Show CAPTCHA iframe
        showCaptcha(result.captchaUrl);
        currentSessionId = result.sessionId;
    } else {
        // Display leads
        displayLeads(result.leads);
    }
}

// Show CAPTCHA iframe
function showCaptcha(captchaUrl) {
    document.getElementById('captchaIframe').src = captchaUrl;
    document.getElementById('captchaContainer').classList.remove('hidden');
}

// Listen for CAPTCHA resolution
window.addEventListener('message', (event) => {
    if (event.data.type === 'captcha-resolved') {
        hideCaptcha();
        continueLeadGeneration(event.data.sessionId);
    }
});
```

## 🔧 Configuration

### Environment Variables
```bash
NODE_ENV=production
APIFY_TOKEN=your_apify_token
RAPIDAPI_KEY=your_rapidapi_key
RENDER=true  # For production detection
```

### Chrome Options
The system automatically detects environment:
- **Local Development**: Visible browser for manual CAPTCHA solving
- **Production**: Headless mode with fallback strategies

## 🎯 Demo

Visit `/captcha-demo.html` to see a working example of the CAPTCHA integration.

## 🛡️ Security Features

- **Session Management**: Each CAPTCHA session has a unique ID
- **Auto Cleanup**: Sessions expire after 30 minutes
- **Anti-Detection**: Uses realistic browser fingerprints
- **Fallback Strategies**: Multiple approaches to avoid CAPTCHAs

## 📱 Mobile Support

The iframe CAPTCHA solution works on mobile devices:
- Responsive design
- Touch-friendly interface
- Auto-scaling for different screen sizes

## 🔄 Error Handling

- **Session Not Found**: Returns 404 with clear error message
- **CAPTCHA Not Resolved**: Returns 400 with retry instructions
- **Driver Errors**: Graceful fallback with cleanup
- **Timeout Handling**: Auto-cleanup of expired sessions

## 💡 Best Practices

1. **Always check for `requiresCaptcha`** in your API responses
2. **Implement proper loading states** while CAPTCHA is being solved
3. **Handle session timeouts** gracefully
4. **Provide clear instructions** to users about solving CAPTCHAs
5. **Test on different devices** to ensure compatibility

## 🚨 Troubleshooting

### CAPTCHA Not Loading
- Check if Chrome is installed on server
- Verify environment variables are set
- Check browser console for errors

### Session Expired
- Sessions auto-expire after 30 minutes
- Start a new lead generation request

### Iframe Not Displaying
- Check CORS settings
- Verify static file serving is enabled
- Check browser security settings

## 🔮 Future Enhancements

- **CAPTCHA Solving Services**: Integration with 2captcha, Anti-Captcha
- **Machine Learning**: Auto-detection of CAPTCHA types
- **Proxy Support**: Rotating proxies to reduce CAPTCHA frequency
- **Rate Limiting**: Smart delays to avoid triggering CAPTCHAs
