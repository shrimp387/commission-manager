/**
 * Gmail OAuth2 utility — sends emails via the Gmail API using the user's Google account.
 *
 * Flow:
 *   1. User clicks "Conectar con Google" → openGoogleOAuth()
 *   2. Google redirects back with ?code=... in the URL
 *   3. We exchange that code for tokens → exchangeCodeForTokens()
 *   4. Tokens are persisted in localStorage
 *   5. sendGmail() uses the access token (auto-refreshing when expired)
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
const REDIRECT_URI = window.location.origin
const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email'

const LS_KEY = 'gmail_tokens'

// ── Token helpers ──────────────────────────────────────────────────────────

export function getGmailTokens() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') }
  catch { return null }
}

export function saveGmailTokens(tokens) {
  localStorage.setItem(LS_KEY, JSON.stringify({ ...tokens, savedAt: Date.now() }))
}

export function clearGmailTokens() {
  localStorage.removeItem(LS_KEY)
}

export function isGmailConnected() {
  const t = getGmailTokens()
  return !!(t?.access_token)
}

// ── OAuth ──────────────────────────────────────────────────────────────────

export function openGoogleOAuth() {
  // Save current page state so we can restore after redirect
  sessionStorage.setItem('gmail_oauth_return', window.location.href)

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/**
 * Call this on app startup to handle the OAuth redirect.
 * Returns { ok: true, email } on success, { ok: false } if no code present.
 */
export async function handleOAuthRedirect() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return { ok: false }

  // Clean URL immediately
  window.history.replaceState({}, '', window.location.pathname)

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })
    const data = await res.json()
    if (data.error) return { ok: false, error: data.error_description || data.error }

    saveGmailTokens(data)

    // Fetch user email to show in UI
    const email = await fetchGmailUserEmail(data.access_token)
    const tokens = { ...data, userEmail: email }
    saveGmailTokens(tokens)

    return { ok: true, email }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function fetchGmailUserEmail(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    return data.email || null
  } catch {
    return null
  }
}

// ── Token refresh ──────────────────────────────────────────────────────────

async function refreshAccessToken() {
  const tokens = getGmailTokens()
  if (!tokens?.refresh_token) throw new Error('No refresh token available. Reconnect Google.')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)

  const updated = { ...tokens, access_token: data.access_token, savedAt: Date.now() }
  saveGmailTokens(updated)
  return updated.access_token
}

async function getValidAccessToken() {
  const tokens = getGmailTokens()
  if (!tokens) throw new Error('Google no conectado')

  // Refresh if token is older than 55 minutes
  const age = (Date.now() - (tokens.savedAt || 0)) / 1000
  if (age > 55 * 60) {
    return refreshAccessToken()
  }
  return tokens.access_token
}

// ── Send email ──────────────────────────────────────────────────────────────

/**
 * Sends an email via Gmail API.
 * @param {Object} opts
 * @param {string} opts.to        - Recipient email address
 * @param {string} opts.subject   - Email subject
 * @param {string} opts.htmlBody  - HTML body
 * @param {string} [opts.fromName] - Display name for the sender (optional)
 */
export async function sendGmail({ to, subject, htmlBody, fromName = 'Estudio de Comisiones' }) {
  const accessToken = await getValidAccessToken()
  const tokens = getGmailTokens()
  const fromEmail = tokens?.userEmail || 'me'

  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail

  // Build RFC 2822 email message
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
  ].join('\r\n')

  // Base64url encode
  const encoded = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Error al enviar email')
  return data
}

// ── Commission acceptance email template ───────────────────────────────────

export async function sendCommissionAcceptedEmail(request, studioName = 'Estudio de Comisiones') {
  const subject = `¡Tu comisión fue aceptada! — ${request.artworkType || 'Comisión'}`

  const budget = request.budgetMin
    ? `$${request.budgetMin}–${request.budgetMax ? '$' + request.budgetMax : '?'} USD`
    : 'Por confirmar'

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f12; color: #e8e8ec; margin: 0; padding: 0; }
  .wrapper { max-width: 560px; margin: 32px auto; background: #1a1a1e; border-radius: 14px; border: 1px solid #2e2e36; overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a1a1e 0%, #222227 100%); padding: 32px 32px 24px; border-bottom: 1px solid #2e2e36; }
  .badge { display: inline-block; background: rgba(34,197,94,0.12); color: #22C55E; border: 1px solid rgba(34,197,94,0.25); border-radius: 99px; font-size: 12px; font-weight: 700; padding: 4px 14px; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 14px; }
  h1 { font-size: 22px; font-weight: 800; color: #e8e8ec; margin: 0 0 6px; }
  .sub { font-size: 14px; color: #888896; margin: 0; }
  .body { padding: 28px 32px; }
  .greeting { font-size: 15px; color: #e8e8ec; margin-bottom: 20px; line-height: 1.6; }
  .details-box { background: #222227; border: 1px solid #2e2e36; border-radius: 10px; padding: 18px; margin-bottom: 20px; }
  .detail-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #2e2e36; font-size: 13px; }
  .detail-row:last-child { border-bottom: none; }
  .detail-label { color: #888896; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
  .detail-value { color: #e8e8ec; text-align: right; }
  .id-box { background: #2a2a30; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #888896; margin-bottom: 24px; text-align: center; }
  .id-box strong { color: #e8e8ec; font-family: monospace; font-size: 13px; }
  .footer-note { font-size: 13px; color: #888896; line-height: 1.6; border-top: 1px solid #2e2e36; padding-top: 20px; margin-top: 8px; }
  .footer-note a { color: #60A5FA; }
  .footer { background: #111113; padding: 16px 32px; font-size: 11px; color: #555560; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="badge">✅ Comisión Aceptada</div>
    <h1>¡Tu solicitud fue aceptada!</h1>
    <p class="sub">Hola, ${request.name} — estamos listos para empezar</p>
  </div>
  <div class="body">
    <p class="greeting">
      Nos complace confirmar que tu solicitud de comisión ha sido revisada y <strong style="color:#22C55E">aceptada</strong>.
      A continuación encontrarás un resumen de los detalles acordados.
    </p>
    <div class="details-box">
      <div class="detail-row">
        <span class="detail-label">Tipo de obra</span>
        <span class="detail-value">${request.artworkType || '—'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Uso final</span>
        <span class="detail-value">${request.usage || '—'}</span>
      </div>
      ${request.deadline ? `<div class="detail-row"><span class="detail-label">Fecha límite</span><span class="detail-value">${request.deadline}</span></div>` : ''}
      <div class="detail-row">
        <span class="detail-label">Presupuesto estimado</span>
        <span class="detail-value" style="color:#22C55E;font-weight:700">${budget}</span>
      </div>
    </div>
    <div class="id-box">
      ID de solicitud: <strong>${request.id}</strong>
    </div>
    <p class="footer-note">
      Nos pondremos en contacto contigo muy pronto para coordinar los próximos pasos.
      Si tienes alguna pregunta, responde a este correo o escríbenos directamente.
    </p>
  </div>
  <div class="footer">
    ${studioName} · Enviado automáticamente · No respondas a este mensaje directamente.
  </div>
</div>
</body>
</html>`

  return sendGmail({ to: request.email, subject, htmlBody })
}

export async function sendCommissionRejectedEmail(request, reason = '', studioName = 'Estudio de Comisiones') {
  const subject = `Actualización sobre tu solicitud de comisión`

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f12; color: #e8e8ec; margin: 0; padding: 0; }
  .wrapper { max-width: 560px; margin: 32px auto; background: #1a1a1e; border-radius: 14px; border: 1px solid #2e2e36; overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a1a1e 0%, #222227 100%); padding: 32px 32px 24px; border-bottom: 1px solid #2e2e36; }
  .badge { display: inline-block; background: rgba(239,68,68,0.12); color: #EF4444; border: 1px solid rgba(239,68,68,0.25); border-radius: 99px; font-size: 12px; font-weight: 700; padding: 4px 14px; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 14px; }
  h1 { font-size: 22px; font-weight: 800; color: #e8e8ec; margin: 0 0 6px; }
  .sub { font-size: 14px; color: #888896; margin: 0; }
  .body { padding: 28px 32px; }
  .greeting { font-size: 15px; color: #e8e8ec; margin-bottom: 20px; line-height: 1.6; }
  .reason-box { background: #222227; border: 1px solid #2e2e36; border-left: 3px solid #EF4444; border-radius: 0 10px 10px 0; padding: 16px; margin-bottom: 20px; font-size: 14px; color: #aaa; line-height: 1.6; }
  .footer-note { font-size: 13px; color: #888896; line-height: 1.6; border-top: 1px solid #2e2e36; padding-top: 20px; }
  .footer { background: #111113; padding: 16px 32px; font-size: 11px; color: #555560; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="badge">Solicitud no aceptada</div>
    <h1>Sobre tu solicitud</h1>
    <p class="sub">Hola, ${request.name} — gracias por tu interés</p>
  </div>
  <div class="body">
    <p class="greeting">
      Luego de revisar tu solicitud con detalle, en esta ocasión no podremos aceptarla.
      Apreciamos mucho tu interés y el tiempo que tomaste en enviarla.
    </p>
    ${reason ? `<div class="reason-box">${reason}</div>` : ''}
    <p class="footer-note">
      Si en el futuro tienes un proyecto que se adapte mejor, no dudes en escribirnos de nuevo.
      Gracias por considerar nuestro estudio.
    </p>
  </div>
  <div class="footer">
    ${studioName} · Enviado automáticamente.
  </div>
</div>
</body>
</html>`

  return sendGmail({ to: request.email, subject, htmlBody })
}

// ── Payment invoice email ──────────────────────────────────────────────────

/**
 * Sends the payment instructions email after a commission is accepted.
 * @param {Object} request       - The original commission request object
 * @param {Object} paymentDetails - { price, currency, methods: [{label, icon, value}], note }
 * @param {string} studioName    - Display name of the studio
 */
export async function sendPaymentEmail(request, paymentDetails, studioName = 'Estudio de Comisiones') {
  const { price, currency, methods, note } = paymentDetails
  const subject = `Instrucciones de pago — ${request.artworkType || 'Comisión'}`

  const methodsHtml = methods.map(m => `
    <div style="background:#222227;border:1px solid #2e2e36;border-radius:10px;padding:14px 18px;margin-bottom:10px;display:flex;align-items:flex-start;gap:12px;">
      <span style="font-size:1.4rem;flex-shrink:0">${m.icon}</span>
      <div>
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#888896;text-transform:uppercase;letter-spacing:0.05em">${m.label}</p>
        <p style="margin:0;font-size:14px;color:#e8e8ec;word-break:break-all">${m.value}</p>
      </div>
    </div>
  `).join('')

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f12; color: #e8e8ec; margin: 0; padding: 0; }
  .wrapper { max-width: 560px; margin: 32px auto; background: #1a1a1e; border-radius: 14px; border: 1px solid #2e2e36; overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a1a1e 0%, #222227 100%); padding: 32px 32px 24px; border-bottom: 1px solid #2e2e36; }
  .badge { display: inline-block; background: rgba(96,165,250,0.12); color: #60A5FA; border: 1px solid rgba(96,165,250,0.25); border-radius: 99px; font-size: 12px; font-weight: 700; padding: 4px 14px; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 14px; }
  h1 { font-size: 22px; font-weight: 800; color: #e8e8ec; margin: 0 0 6px; }
  .sub { font-size: 14px; color: #888896; margin: 0; }
  .body { padding: 28px 32px; }
  .price-box { background: #222227; border: 1px solid #2e2e36; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; }
  .price-label { font-size: 11px; font-weight: 700; color: #888896; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .price-value { font-size: 36px; font-weight: 900; color: #22C55E; letter-spacing: -0.03em; }
  .price-currency { font-size: 18px; color: #888896; }
  .section-title { font-size: 12px; font-weight: 700; color: #888896; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 12px; }
  .note-box { background: rgba(96,165,250,0.06); border: 1px solid rgba(96,165,250,0.2); border-radius: 8px; padding: 14px; margin-top: 20px; font-size: 14px; color: #e8e8ec; line-height: 1.6; }
  .footer-note { font-size: 13px; color: #888896; line-height: 1.6; border-top: 1px solid #2e2e36; padding-top: 20px; margin-top: 20px; }
  .footer { background: #111113; padding: 16px 32px; font-size: 11px; color: #555560; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="badge">💳 Instrucciones de Pago</div>
    <h1>Completa tu pago</h1>
    <p class="sub">Hola, ${request.name} — tu comisión fue aceptada ✅</p>
  </div>
  <div class="body">
    <div class="price-box">
      <p class="price-label">Total a pagar</p>
      <p class="price-value">${price.toFixed(2)} <span class="price-currency">${currency}</span></p>
    </div>

    <p class="section-title">Métodos de pago disponibles</p>
    ${methodsHtml}

    ${note ? `<div class="note-box">💬 <strong>Nota del artista:</strong><br/>${note}</div>` : ''}

    <div class="footer-note">
      Una vez realizado el pago, responde a este correo con tu comprobante.
      Comenzaremos a trabajar en tu comisión tan pronto confirmemos el pago.
      <br/><br/>
      ID de solicitud: <code style="background:#222;padding:2px 6px;border-radius:4px;">${request.id}</code>
    </div>
  </div>
  <div class="footer">
    ${studioName} · Enviado automáticamente.
  </div>
</div>
</body>
</html>`

  return sendGmail({ to: request.email, subject, htmlBody })
}


// ── Artwork delivery email ─────────────────────────────────────────────────

/**
 * Sends the final artwork delivery email with the image attached as inline content.
 * @param {Object} opts
 * @param {string} opts.clientEmail  - Client's email address
 * @param {string} opts.clientName   - Client's name
 * @param {string} opts.taskName     - Commission/task name
 * @param {string} opts.imageUrl     - Base64 data URL of the high-res image
 * @param {string} opts.imageName    - File name for the attachment label
 * @param {string} [opts.note]       - Optional delivery note from the artist
 * @param {string} [opts.studioName] - Studio display name
 */
export async function sendDeliveryEmail({ clientEmail, clientName, taskName, imageUrl, imageName, note = '', studioName = 'Estudio de Comisiones' }) {
  const subject = `¡Tu comisión está lista! — ${taskName}`

  const isBase64 = imageUrl?.startsWith('data:image')

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f12; color: #e8e8ec; margin: 0; padding: 0; }
  .wrapper { max-width: 560px; margin: 32px auto; background: #1a1a1e; border-radius: 14px; border: 1px solid #2e2e36; overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a1a1e 0%, #222227 100%); padding: 32px 32px 24px; border-bottom: 1px solid #2e2e36; }
  .badge { display: inline-block; background: rgba(34,197,94,0.12); color: #22C55E; border: 1px solid rgba(34,197,94,0.25); border-radius: 99px; font-size: 12px; font-weight: 700; padding: 4px 14px; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 14px; }
  h1 { font-size: 22px; font-weight: 800; color: #e8e8ec; margin: 0 0 6px; }
  .sub { font-size: 14px; color: #888896; margin: 0; }
  .body { padding: 28px 32px; }
  .artwork-preview { width: 100%; border-radius: 10px; border: 1px solid #2e2e36; display: block; margin-bottom: 20px; max-height: 420px; object-fit: contain; background: #111; }
  .artwork-label { font-size: 11px; color: #888896; text-align: center; margin: -14px 0 24px; }
  .note-box { background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.2); border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 14px; color: #e8e8ec; line-height: 1.6; }
  .info { font-size: 13px; color: #888896; line-height: 1.6; }
  .footer { background: #111113; padding: 16px 32px; font-size: 11px; color: #555560; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="badge">🎨 Obra Entregada</div>
    <h1>¡Tu comisión está lista!</h1>
    <p class="sub">Hola, ${clientName} — aquí está tu obra</p>
  </div>
  <div class="body">
    ${isBase64 ? `
      <img src="${imageUrl}" alt="${imageName || 'tu comisión'}" class="artwork-preview" />
      <p class="artwork-label">${imageName || taskName} — Alta resolución</p>
    ` : `
      <div style="background:#222;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px;color:#888896;font-size:14px;">
        🖼 La imagen adjunta es: <strong style="color:#e8e8ec">${imageName || taskName}</strong>
      </div>
    `}

    ${note ? `<div class="note-box">💬 <strong>Nota del artista:</strong><br/>${note}</div>` : ''}

    <p class="info">
      Tu obra ha sido entregada en alta calidad. Guarda este email para conservar tu archivo.
      Si necesitas algún ajuste o tienes preguntas, responde a este correo.
      <br/><br/>
      Ha sido un placer trabajar en esta comisión. ¡Gracias por confiar en ${studioName}! 🙏
    </p>
  </div>
  <div class="footer">
    ${studioName} · Entregado con ❤️
  </div>
</div>
</body>
</html>`

  return sendGmail({ to: clientEmail, subject, htmlBody })
}
