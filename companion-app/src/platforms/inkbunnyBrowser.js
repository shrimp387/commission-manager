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
    // Wait a bit for page to load
    await page.waitForTimeout(1000)
    
    // Multiple ways to detect login:
    // 1. Check for logout link
    const logoutLink = await page.$('a[href*="logout"]')
    if (logoutLink) return true
    
    // 2. Check for username display in header
    const usernameEl = await page.$('.widget_userheader, .username, a[href*="/user"]')
    if (usernameEl) return true
    
    // 3. Check if we're NOT on login page
    const url = page.url()
    if (!url.includes('login.php') && url.includes('inkbunny.net')) {
      return true
    }
    
    return false
  } catch (err) {
    console.warn('[inkbunnyBrowser] isLoggedIn check error:', err.message)
    return false
  }
}

/**
 * Logs into Inkbunny
 */
async function login(page, username, password) {
  console.log('[inkbunnyBrowser] Navigating to login page...')
  await page.goto('https://inkbunny.net/login.php', { waitUntil: 'domcontentloaded', timeout: 30000 })
  
  // Wait for form to be ready
  await page.waitForSelector('input[name="username"]', { timeout: 10000 })
  
  // Fill login form
  console.log('[inkbunnyBrowser] Filling login form...')
  await page.fill('input[name="username"]', username)
  await page.fill('input[name="password"]', password)
  
  // Click login button
  console.log('[inkbunnyBrowser] Clicking login button...')
  await page.click('button[type="submit"], input[type="submit"]')
  
  // Wait for navigation after login
  console.log('[inkbunnyBrowser] Waiting for login to complete...')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000)  // Give it time to redirect
  
  // Verify login succeeded
  const loggedIn = await isLoggedIn(page)
  console.log('[inkbunnyBrowser] Login check result:', loggedIn)
  
  if (!loggedIn) {
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
    
    // Check if already logged in by going to homepage
    console.log('[inkbunnyBrowser] Checking if already logged in...')
    await page.goto('https://inkbunny.net/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)  // Wait for page to fully render
    
    const loggedIn = await isLoggedIn(page)
    console.log('[inkbunnyBrowser] Already logged in:', loggedIn)
    
    if (!loggedIn) {
      console.log('[inkbunnyBrowser] Not logged in, performing login...')
      await login(page, username, password)
      await saveCookies(context)
    } else {
      console.log('[inkbunnyBrowser] Already logged in (cookies restored)')
    }
    
    // Navigate to upload page
    console.log('[inkbunnyBrowser] Navigating to upload page...')
    await page.goto('https://inkbunny.net/submissionsupload.php', { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3000)  // Extra wait for page to fully render
    
    console.log('[inkbunnyBrowser] Current URL after navigation:', page.url())
    console.log('[inkbunnyBrowser] Page title:', await page.title())
    
    // Take screenshot for debugging
    const debugScreenshot = path.join(os.tmpdir(), `inkbunny-debug-${Date.now()}.png`)
    await page.screenshot({ path: debugScreenshot, fullPage: true })
    console.log('[inkbunnyBrowser] Debug screenshot saved:', debugScreenshot)
    
    // Download image to temporary file
    console.log('[inkbunnyBrowser] Downloading image from:', job.image_url)
    tempImageFile = await downloadImageToFile(job.image_url)
    console.log('[inkbunnyBrowser] Image downloaded to:', tempImageFile)
    
    // Upload image file - try multiple selectors
    console.log('[inkbunnyBrowser] Looking for file input...')
    
    // Wait for ANY of these selectors
    const fileInputSelectors = [
      'input[type="file"][name="uploadedfile[]"]',
      'input[type="file"][name="uploadedfile"]',
      'input[type="file"]',
      '#uploadedfile',
      'input[name="uploadedfile[]"]',
    ]
    
    let fileInput = null
    for (const selector of fileInputSelectors) {
      console.log('[inkbunnyBrowser] Trying selector:', selector)
      try {
        await page.waitForSelector(selector, { timeout: 3000, state: 'attached' })
        fileInput = await page.$(selector)
        if (fileInput) {
          console.log('[inkbunnyBrowser] ✅ Found file input with selector:', selector)
          break
        }
      } catch (err) {
        console.log('[inkbunnyBrowser] Selector not found:', selector)
      }
    }
    
    if (!fileInput) {
      // Try to find ANY file input on the page
      console.log('[inkbunnyBrowser] Trying to find ANY file input...')
      fileInput = await page.$('input[type="file"]')
      
      if (!fileInput) {
        throw new Error('File upload input not found on page. Check screenshot: ' + debugScreenshot)
      }
    }
    
    console.log('[inkbunnyBrowser] Setting file input...')
    await fileInput.setInputFiles(tempImageFile)
    console.log('[inkbunnyBrowser] File set, waiting for upload...')
    
    // Wait for upload to complete
    await page.waitForTimeout(3000)
    
    // Click "Continue" or "Upload" button - try multiple selectors
    console.log('[inkbunnyBrowser] Looking for upload/continue button...')
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Upload")',
      'input[value*="Upload"]',
      'button:has-text("Continue")',
      'input[value*="Continue"]',
      '.submit-button',
    ]
    
    let uploadButton = null
    for (const selector of buttonSelectors) {
      uploadButton = await page.$(selector)
      if (uploadButton) {
        console.log('[inkbunnyBrowser] Found button with selector:', selector)
        break
      }
    }
    
    if (uploadButton) {
      console.log('[inkbunnyBrowser] Clicking upload button...')
      await uploadButton.click()
      await page.waitForLoadState('networkidle', { timeout: 30000 })
      await page.waitForTimeout(3000)
      console.log('[inkbunnyBrowser] Upload button clicked, page loaded')
      console.log('[inkbunnyBrowser] New URL:', page.url())
    } else {
      console.warn('[inkbunnyBrowser] Upload button not found, assuming auto-upload or ajax')
    }
    
    // Now we should be on the submission details page
    // Fill out the form
    console.log('[inkbunnyBrowser] Filling submission form...')
    console.log('[inkbunnyBrowser] Current URL:', page.url())
    
    // Take another screenshot
    const formScreenshot = path.join(os.tmpdir(), `inkbunny-form-${Date.now()}.png`)
    await page.screenshot({ path: formScreenshot, fullPage: true })
    console.log('[inkbunnyBrowser] Form screenshot saved:', formScreenshot)
    
    // Wait for form to be ready
    await page.waitForTimeout(2000)
    
    // Title - try multiple selectors
    console.log('[inkbunnyBrowser] Setting title:', job.title)
    const titleSelectors = ['input[name="title"]', '#title', 'input[id*="title"]']
    let titleInput = null
    for (const selector of titleSelectors) {
      titleInput = await page.$(selector)
      if (titleInput) {
        await titleInput.fill(job.title || 'Untitled')
        console.log('[inkbunnyBrowser] Title set using selector:', selector)
        break
      }
    }
    if (!titleInput) {
      console.warn('[inkbunnyBrowser] ⚠️ Title input not found with any selector')
    }
    
    // Description - try multiple selectors
    console.log('[inkbunnyBrowser] Setting description...')
    const descSelectors = ['textarea[name="desc"]', '#desc', 'textarea[id*="desc"]', 'textarea[name="description"]']
    let descInput = null
    for (const selector of descSelectors) {
      descInput = await page.$(selector)
      if (descInput) {
        await descInput.fill(job.description || '')
        console.log('[inkbunnyBrowser] Description set using selector:', selector)
        break
      }
    }
    if (!descInput) {
      console.warn('[inkbunnyBrowser] ⚠️ Description textarea not found with any selector')
    }
    
    // Keywords/Tags - try multiple selectors
    console.log('[inkbunnyBrowser] Setting keywords/tags:', job.tags)
    const keywordSelectors = [
      'input[name="keywords"]', 
      'textarea[name="keywords"]',
      '#keywords',
      'input[id*="keyword"]',
      'textarea[id*="keyword"]'
    ]
    let keywordsInput = null
    for (const selector of keywordSelectors) {
      keywordsInput = await page.$(selector)
      if (keywordsInput) break
    }
    
    if (keywordsInput && job.tags && job.tags.length > 0) {
      await keywordsInput.fill(job.tags.join(' '))
      console.log('[inkbunnyBrowser] Keywords set:', job.tags.length, 'tags using selector')
    } else if (!keywordsInput) {
      console.warn('[inkbunnyBrowser] ⚠️ Keywords input not found with any selector')
    } else {
      console.warn('[inkbunnyBrowser] ⚠️ No tags provided to set')
    }
    
    // Rating - Inkbunny uses checkboxes for content ratings
    // tag_list[2] = Mature/Adult content (nudity)
    // tag_list[3] = Explicit sexual content
    console.log('[inkbunnyBrowser] Setting rating:', job.rating)
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
        console.log('[inkbunnyBrowser] Nudity checkbox checked')
      } else {
        await nudityCheckbox.uncheck()
        console.log('[inkbunnyBrowser] Nudity checkbox unchecked')
      }
    } else {
      console.warn('[inkbunnyBrowser] Nudity checkbox not found')
    }
    
    // Check/uncheck sexual content checkbox
    const sexualCheckbox = await page.$('input[name="tag_list[3]"], input[id*="sexual"]')
    if (sexualCheckbox) {
      if (rating.sexual) {
        await sexualCheckbox.check()
        console.log('[inkbunnyBrowser] Sexual content checkbox checked')
      } else {
        await sexualCheckbox.uncheck()
        console.log('[inkbunnyBrowser] Sexual content checkbox unchecked')
      }
    } else {
      console.warn('[inkbunnyBrowser] Sexual content checkbox not found')
    }
    
    // Set visibility to public (not draft)
    console.log('[inkbunnyBrowser] Setting visibility to public...')
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
