/**
 * inkbunnyBrowser.js — Browser automation for Inkbunny using Playwright
 *
 * Opens Inkbunny in a visible browser, logs in, fills out the submission form,
 * and leaves everything ready for the user to click "Submit".
 */

'use strict'

const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Paths for storing browser session
const BROWSER_DATA_DIR = path.join(os.homedir(), '.commission-manager', 'browser-data')
const COOKIES_FILE = path.join(BROWSER_DATA_DIR, 'inkbunny-cookies.json')

// Ensure browser data directory exists
if (!fs.existsSync(BROWSER_DATA_DIR)) {
  fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true })
}

/**
 * Downloads image from URL to a temporary file
 */
async function downloadImageToFile(imageUrl) {
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`)
  
  const buffer = Buffer.from(await response.arrayBuffer())
  const ext = imageUrl.split('.').pop().split('?')[0] || 'png'
  const tempFile = path.join(os.tmpdir(), `inkbunny-upload-${Date.now()}.${ext}`)
  
  fs.writeFileSync(tempFile, buffer)
  return tempFile
}

/**
 * Saves browser cookies to disk for session persistence
 */
async function saveCookies(context) {
  try {
    const cookies = await context.cookies()
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2))
    console.log('[inkbunnyBrowser] Cookies saved')
  } catch (err) {
    console.warn('[inkbunnyBrowser] Failed to save cookies:', err.message)
  }
}

/**
 * Loads browser cookies from disk
 */
async function loadCookies(context) {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'))
      await context.addCookies(cookies)
      console.log('[inkbunnyBrowser] Cookies loaded')
      return true
    }
  } catch (err) {
    console.warn('[inkbunnyBrowser] Failed to load cookies:', err.message)
  }
  return false
}

/**
 * Checks if user is logged in to Inkbunny
 */
async function isLoggedIn(page) {
  try {
    // Check if logout link exists (means user is logged in)
    const logoutLink = await page.$('a[href*="logout"]')
    return !!logoutLink
  } catch {
    return false
  }
}

/**
 * Logs into Inkbunny
 */
async function login(page, username, password) {
  console.log('[inkbunnyBrowser] Navigating to login page...')
  await page.goto('https://inkbunny.net/login.php', { waitUntil: 'networkidle' })
  
  // Fill login form
  await page.fill('input[name="username"]', username)
  await page.fill('input[name="password"]', password)
  
  // Click login button
  await page.click('button[type="submit"], input[type="submit"]')
  
  // Wait for navigation after login
  await page.waitForLoadState('networkidle')
  
  // Verify login succeeded
  if (!(await isLoggedIn(page))) {
    throw new Error('Login failed - please check credentials')
  }
  
  console.log('[inkbunnyBrowser] ✅ Logged in successfully')
}

/**
 * Publishes to Inkbunny using browser automation
 * 
 * Opens a visible browser, navigates to Inkbunny, fills the submission form,
 * and leaves it ready for user to click Submit.
 */
async function publishInkbunnyBrowser(job, credentials) {
  const { username, password } = credentials ?? {}
  
  if (!username || !password) {
    throw new Error('Inkbunny credentials incomplete')
  }
  
  console.log('[inkbunnyBrowser] Starting browser automation...')
  
  let browser = null
  let tempImageFile = null
  
  try {
    console.log('[inkbunnyBrowser] Launching browser...')
    
    // Launch browser in headed mode (visible window)
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome', // Use system Chrome if available
    }).catch(err => {
      console.error('[inkbunnyBrowser] Failed to launch browser:', err.message)
      throw new Error(`Failed to launch browser: ${err.message}. Make sure Chromium is installed.`)
    })
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    
    // Load saved cookies (session persistence)
    await loadCookies(context)
    
    const page = await context.newPage()
    
    // Check if already logged in
    await page.goto('https://inkbunny.net/', { waitUntil: 'networkidle' })
    
    if (!(await isLoggedIn(page))) {
      console.log('[inkbunnyBrowser] Not logged in, logging in...')
      await login(page, username, password)
      await saveCookies(context)
    } else {
      console.log('[inkbunnyBrowser] Already logged in (cookies restored)')
    }
    
    // Navigate to upload page
    console.log('[inkbunnyBrowser] Navigating to upload page...')
    await page.goto('https://inkbunny.net/submissionsupload.php', { waitUntil: 'networkidle' })
    
    // Download image to temporary file
    console.log('[inkbunnyBrowser] Downloading image...')
    tempImageFile = await downloadImageToFile(job.image_url)
    
    // Upload image file
    console.log('[inkbunnyBrowser] Uploading image...')
    const fileInput = await page.$('input[type="file"][name="uploadedfile[]"]')
    if (fileInput) {
      await fileInput.setInputFiles(tempImageFile)
      
      // Wait for upload to complete
      await page.waitForTimeout(2000)
      
      // Click "Continue" or "Upload" button
      const uploadButton = await page.$('button:has-text("Upload"), input[value*="Upload"], button:has-text("Continue")')
      if (uploadButton) {
        await uploadButton.click()
        await page.waitForLoadState('networkidle')
      }
    }
    
    // Now we should be on the submission details page
    // Fill out the form
    console.log('[inkbunnyBrowser] Filling submission form...')
    
    // Title
    const titleInput = await page.$('input[name="title"]')
    if (titleInput) {
      await titleInput.fill(job.title || 'Untitled')
    }
    
    // Description
    const descInput = await page.$('textarea[name="desc"]')
    if (descInput) {
      await descInput.fill(job.description || '')
    }
    
    // Keywords/Tags
    const keywordsInput = await page.$('input[name="keywords"], textarea[name="keywords"]')
    if (keywordsInput && job.tags && job.tags.length > 0) {
      await keywordsInput.fill(job.tags.join(' '))
    }
    
    // Rating - Inkbunny uses checkboxes for content ratings
    // tag_list_two = Mature/Adult content
    // tag_list_three = Explicit sexual content
    const ratingMap = {
      safe:         { nudity: false, sexual: false },
      questionable: { nudity: true,  sexual: false },
      explicit:     { nudity: true,  sexual: true },
    }
    const rating = ratingMap[job.rating] || ratingMap.safe
    
    // Check/uncheck nudity checkbox
    const nudityCheckbox = await page.$('input[name="tag_list[2]"], input[id*="nudity"]')
    if (nudityCheckbox) {
      if (rating.nudity) {
        await nudityCheckbox.check()
      } else {
        await nudityCheckbox.uncheck()
      }
    }
    
    // Check/uncheck sexual content checkbox
    const sexualCheckbox = await page.$('input[name="tag_list[3]"], input[id*="sexual"]')
    if (sexualCheckbox) {
      if (rating.sexual) {
        await sexualCheckbox.check()
      } else {
        await sexualCheckbox.uncheck()
      }
    }
    
    // Set visibility to public (not draft)
    const visibilitySelect = await page.$('select[name="visibility"]')
    if (visibilitySelect) {
      await visibilitySelect.selectOption('yes')
    }
    
    // Enable "Notify watchers"
    const notifyCheckbox = await page.$('input[name="notify_followers"]')
    if (notifyCheckbox) {
      await notifyCheckbox.check()
    }
    
    // Disable guest block (allow public access)
    const guestBlockCheckbox = await page.$('input[name="guest_block"]')
    if (guestBlockCheckbox) {
      await guestBlockCheckbox.uncheck()
    }
    
    console.log('[inkbunnyBrowser] ✅ Form filled! Browser left open for user review.')
    console.log('[inkbunnyBrowser] 👉 User can now review and click Submit.')
    
    // Save cookies again in case session was refreshed
    await saveCookies(context)
    
    // DON'T close the browser - leave it open for user to review and submit
    // Return a placeholder URL (we don't have the final URL until user clicks Submit)
    return {
      ok: true,
      url: 'https://inkbunny.net/submissionsupload.php',
      message: 'Browser opened with form filled. Click Submit to publish.',
      browserOpen: true,
    }
    
  } catch (err) {
    console.error('[inkbunnyBrowser] Error:', err)
    
    // Close browser on error
    if (browser) {
      await browser.close()
    }
    
    throw err
  } finally {
    // Clean up temp file
    if (tempImageFile && fs.existsSync(tempImageFile)) {
      try {
        fs.unlinkSync(tempImageFile)
      } catch (e) {
        console.warn('[inkbunnyBrowser] Failed to delete temp file:', e.message)
      }
    }
  }
}

/**
 * Tests Inkbunny credentials using browser automation
 */
async function testInkbunnyBrowser(credentials) {
  const { username, password } = credentials ?? {}
  
  if (!username || !password) {
    return { ok: false, error: 'Inkbunny credentials incomplete' }
  }
  
  let browser = null
  
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    
    await login(page, username, password)
    await saveCookies(context)
    
    await browser.close()
    
    return { ok: true, username }
  } catch (err) {
    if (browser) await browser.close()
    return { ok: false, error: err.message }
  }
}

module.exports = {
  publishInkbunnyBrowser,
  testInkbunnyBrowser,
}
