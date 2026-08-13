# Inkbunny FormData Fix - v2.6.0

## Problem
The Inkbunny API upload was failing with error:
```
No Session ID sent as variable 'sid'
```

Even though login was successful and returned a valid `sid`, the upload step was not receiving the session ID parameter.

## Root Cause
The native Node.js `fetch` API (Node 18+) requires special handling when using the `form-data` package for streaming multipart uploads:

1. **Missing `duplex: 'half'` parameter**: Node.js fetch requires this when sending streaming bodies (FormData creates a stream)
2. **Improper FormData stream handling**: The form-data package creates a readable stream that needs proper integration with fetch

## Solution Applied

### Changes in `companion-app/src/platforms/inkbunny.js`:

1. **Added `duplex: 'half'` to fetch options**:
   ```javascript
   const uploadRes = await fetch(`${IB_BASE}/api_upload.php`, {
     method: 'POST',
     headers: uploadForm.getHeaders(),
     body: uploadForm,
     duplex: 'half',  // ← REQUIRED for streaming bodies in Node.js fetch
   })
   ```

2. **Added debugging logs** to track FormData construction:
   ```javascript
   console.log('[inkbunny] FormData fields:', {
     sid: sid.substring(0, 8) + '...',
     filename,
     contentType,
     bufferSize: buffer.length
   })
   ```

3. **Clarified field order** with comments (sid is appended first, before the file)

## Reference Implementation
Solution based on analysis of PostyBirb Plus code:
- File: `postybirb-plus/electron-app/src/server/http/http.util.ts`
- PostyBirb uses the `request` library with `formData` option
- Their approach confirmed that FormData streams need proper handling

## Testing
To test the fix:
1. Run the rebuilt companion app: `dist\win-unpacked\commission-manager-companion.exe`
2. Create a publish job in the web app targeting Inkbunny
3. Monitor logs for successful upload (should see `submission_id` in response)

## Version
- Previous: v2.5.0
- Current: v2.6.0

## Files Modified
- `companion-app/src/platforms/inkbunny.js` - Added `duplex: 'half'` and enhanced logging
- `companion-app/package.json` - Bumped version to 2.6.0

## Build Status
✅ Build completed successfully
✅ No compilation errors
⏳ Ready for testing

## Next Steps
1. Test the upload with a real Inkbunny job
2. Verify Step 2 (upload) returns `submission_id`
3. Verify Step 3 (edit/publish) completes successfully
4. If successful, commit and deploy
