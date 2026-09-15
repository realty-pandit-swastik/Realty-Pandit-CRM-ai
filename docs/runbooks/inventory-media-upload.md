# Runbook — inventory photo & video upload

`POST /api/inventory/:id/upload` (`routes/inventory.ts`). Fixed 2026-08-11 —
`cde4667`, `300dfae`, `7dd7423`.

---

## The four size limits, and which one bites first

| Limit | Where | Value |
|---|---|---|
| 🔴 **Cloudflare edge** | Free plan, `api.realtypandit.in` is proxied | **100 MB — immovable** |
| UI guard | `InventoryList.tsx` `MAX_UPLOAD_MB` | **95 MB** (headroom for multipart overhead) |
| multer | `inventory.ts` `MAX_UPLOAD_MB` | 100 MB |
| nginx | `client_max_body_size` | 100 MB |
| Images only | `storage.ts` `MAX_FILE_SIZE` | 10 MB |

**Cloudflare is the real ceiling.** Anything over 100 MB is rejected at the edge with an error we
cannot customise, which is why the UI stops the user at 95 MB with a message instead. Raising the
app limit alone achieves nothing. Business plan would give 200 MB (~$200/mo).

## Supported formats

`mp4, mov, webm, 3gp, 3g2, mkv, avi, m4v, mpeg` + the image set.

🔴 **`application/octet-stream` and an empty mimetype are accepted when the file EXTENSION is a
known media type.** Some Android pickers hand over a perfectly good .mp4 with no usable mimetype —
this was the most likely real-world cause of "video upload doesn't work". Do not "tidy" that rule
away.

`isVideoUpload()` decides video-vs-image by **mimetype OR extension**. Keying on mimetype alone sent
octet-stream videos to `sharp` as images and 500'd the request.

## 🔴 Disk storage, not memory

multer uses **`diskStorage`**. It must stay that way. With `memoryStorage`, 20 files × 100 MB is
2 GB against a ~2,096 MB Node heap — a guaranteed OOM of the cluster worker. Measured after the
change: 4 concurrent 86 MB uploads moved RSS by **+10 MB**.

Temp files land in `uploads/tmp` and are removed in a `finally`, covering the error path. Videos are
renamed into place; images are only *read* by sharp, so without that cleanup they accumulate forever.
`storage.ts` reads `file.path || file.buffer`, so any caller still on memoryStorage keeps working.

## Everything ends up as h264 / .mp4

`utils/video_transcode.ts` `ensureH264Playable` runs after upload (backgrounded) and fixes **two**
things:

- **codec** — iPhone HEVC → h264
- **container** — anything not `.mp4` is remuxed and the file **renamed to .mp4**, with the
  inventory's `video_urls` rewritten to match

⚠ The container half is not optional. ffmpeg writes MP4 bytes; the old code renamed them back over
the original extension, so an `.avi` held MP4 data while express.static served
`Content-Type: video/x-msvideo`. The API sends **`X-Content-Type-Options: nosniff`**, which forbids
the browser from correcting a mislabel — so the video simply would not play. h264-already-in-a-wrong
-container takes the `-c copy` path, which is near-instant.

## Browser-side compression (4K)

Phones shoot 4K at ~350–400 MB/minute, so 95 MB is only 15–20 seconds. `utils/video_compress.ts`
re-encodes anything **over** the limit to 1080p / 4 Mbps before upload. Measured: a 121 MB 4K clip
became 1.4 MB in 38 seconds, audio intact.

- **WebCodecs** for encoding (hardware-accelerated, faster than real time); a `<video>` element at
  4× handles decoding, so we ship a muxer (`mp4-muxer`) but no demuxer.
- Audio is decoded with `AudioContext.decodeAudioData`, which is **not** real-time bound — reading it
  off the accelerated `<video>` would have pitched it 4× fast.
- 🔴 **Both codecs are negotiated with `isConfigSupported`, never hardcoded.** The codec string
  encodes a LEVEL that caps resolution: `avc1.42001f` is Baseline 3.1 and **fails at 1080p**. AAC
  encoding is proprietary and absent from some Chromium builds, so audio falls back AAC → Opus →
  video-only.
- Feature-detected. No WebCodecs → the original is returned and the 95 MB guard shows a clear
  message. A 350 MB file is never silently sent to an edge that will reject it.

## Diagnosing a failed upload

```bash
# API access log (NOT /var/log/nginx/access.log — the api vhost logs separately)
grep "POST /api/inventory/.*/upload" /var/www/realty-pandit/logs/api-access.log | tail -20

# Rejections are 400 with the reason in the body; 500 here means a genuine bug
grep -iE "\[Upload\] rejected|LIMIT_FILE_SIZE" backend/logs/combined-$(date +%F).log | tail

# Temp dir should always be empty at rest
ls -1 /var/www/realty-pandit/backend/uploads/tmp | wc -l
```

A 400 naming the file is working as designed. A 500 is not — before 2026-08-11 every rejection was
a 500 plus a false `[Alert:CRITICAL] server_5xx`.

## Known, not fixed

Upload and delete both do a read-modify-write of `video_urls`, so rapid concurrent uploads can leave
a stale array entry. Pre-existing and unrelated to formats; needs its own change.
