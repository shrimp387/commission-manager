/**
 * jobRunner.js — Executes publish jobs for each platform
 *
 * Each platform module exports:
 *   test(credentials)  → { ok, username?, error? }
 *   publish(job, credentials) → { ok, url?, error? }
 */

const { publishE621 }     = require('./platforms/e621')
const { publishInkbunny } = require('./platforms/inkbunny')
const { publishInkbunnyBrowser } = require('./platforms/inkbunnyBrowser')
const { publishWeasyl }   = require('./platforms/weasyl')
const { publishBluesky }  = require('./platforms/bluesky')
const { publishTelegram } = require('./platforms/telegram')
const { publishDiscord }  = require('./platforms/discord')

class JobRunner {
  constructor(supabase, store) {
    this.supabase = supabase
    this.store = store
  }

  /**
   * Publishes a job to a single platform.
   * @param {string} platform — platform ID (e.g. 'e621', 'inkbunny')
   * @param {object} job      — publish job from Supabase
   */
  async publishToPlatform(platform, job) {
    const credentials = this.store.get(`platforms.${platform}`)
    if (!credentials?.enabled) {
      throw new Error(`Plataforma ${platform} no está habilitada en la configuración`)
    }

    switch (platform) {
      case 'e621':
        return publishE621(job, credentials)
      case 'inkbunny':
        // Use browser automation if useBrowser is enabled, otherwise use API
        if (credentials.useBrowser) {
          return publishInkbunnyBrowser(job, credentials)
        }
        return publishInkbunny(job, credentials)
      case 'weasyl':
        return publishWeasyl(job, credentials)
      case 'bluesky':
        return publishBluesky(job, credentials)
      case 'telegram':
        return publishTelegram(job, credentials)
      case 'discord':
        return publishDiscord(job, credentials)
      default:
        throw new Error(`Plataforma '${platform}' no implementada aún`)
    }
  }

  /**
   * Tests credentials for a platform without publishing.
   */
  async testPlatform(platform, credentials) {
    switch (platform) {
      case 'e621': {
        const { testE621 } = require('./platforms/e621')
        return testE621(credentials)
      }
      case 'inkbunny': {
        const { testInkbunny } = require('./platforms/inkbunny')
        const { testInkbunnyBrowser } = require('./platforms/inkbunnyBrowser')
        // Use browser test if useBrowser is enabled
        if (credentials.useBrowser) {
          return testInkbunnyBrowser(credentials)
        }
        return testInkbunny(credentials)
      }
      case 'weasyl': {
        const { testWeasyl } = require('./platforms/weasyl')
        return testWeasyl(credentials)
      }
      case 'bluesky': {
        const { testBluesky } = require('./platforms/bluesky')
        return testBluesky(credentials)
      }
      case 'discord': {
        const { testDiscord } = require('./platforms/discord')
        return testDiscord(credentials)
      }
      case 'telegram': {
        const { testTelegram } = require('./platforms/telegram')
        return testTelegram(credentials)
      }
      default:
        return { ok: false, error: `Plataforma '${platform}' no soportada` }
    }
  }
}

module.exports = { JobRunner }
