# Runbook — inventory documents (title deeds, registries, NOCs)

Access rule set by the owner **2026-08-11**, enforced in `56ee0bd`.

---

## The rule

> **View · download · upload · rename · delete · share** a property document ⇔ the viewer is
> **`super_boss`** OR the listing's **assigned agent** OR its **uploading agent**.

A `manager` inherits their direct reports' listings, because `getTeamIds()`
(`utils/team_scope.ts`) returns `[self, ...reports]`. An `employee` gets `[self]` only.

Two deliberate narrowings:

- 🔴 **Sharing a listing does NOT share its paperwork.** `redactInventoryForStaff` lets a
  `shared_with_ids` teammate see the listing's private fields, but documents are gated on the
  narrower rule. 102 listings are currently shared; none of them expose documents.
- 🔴 **External partner agents get nothing**, even on their own listing. Documents are the
  owner's paperwork, not marketing material. `partnerMayMutateInventory()` passing is
  deliberately **not** sufficient.

## Why this needed enforcing at all

Before `56ee0bd` the rule existed **only as a hidden button**. The Documents tab lives inside the
edit modal, so it was unreachable unless `can_edit` was true — but nothing underneath enforced it.
Measured on prod:

| Hole | Evidence |
|---|---|
| The file had **no authentication** | A 5.4 MB registry PDF downloaded with no session: `200`, 5,461,139 bytes |
| The detail API **handed the URL** to staff who fail the check | Test employee: `can_edit:false` **and** `documents:1` with the full `file_url`, on 8/8 listings |
| **No ownership check on any write route** | `POST`/`DELETE`/`PATCH`/`share` gated only on `edit_inventory`, which all 29 employees hold |
| Documents **bypassed every redaction list** | Absent from all four field lists in `sanitization_service.ts` |

## The four enforcement points — all four are load-bearing

1. **`mayAccessDocuments(req, res, inventoryId)`** (`routes/inventory.ts`) — guards upload,
   delete, rename, share and download. Mirrors the `PATCH /:id` edit guard; **keep the two in
   step.**
2. **Detail route** omits the `documents` **key** (not `[]`) for anyone who fails the rule, so the
   UI can still distinguish "none uploaded" from "not yours". Partners are stripped
   unconditionally.
3. **`sanitization_service.ts`** — `'documents'` is in `STAFF_HIDDEN_INVENTORY_FIELDS`, and
   stripped for partners *ahead of* the `canSeeOwner` early-return. Defence in depth: a future
   route that does `include: { documents: true }` and forgets to gate it still cannot leak.
4. **`app.ts` static guard** — `/uploads/properties/*/documents/*` returns **403**, mounted
   *before* `express.static`.

## 🔴 Why the static path is blocked, and what stays public

Documents sit under `/uploads`, which is otherwise public. The guard blocks **only** the
`documents/` subtree — including the `*_thumb.*` siblings `media_promote.ts` writes beside image
documents, because **a thumbnail of a title deed is still the title deed**.

**Photos and videos stay public.** The website, WhatsApp shares and ad creatives all fetch them
directly, and `agents/website/src` has no reference to documents at all.

Do not "simplify" this by blocking all of `/uploads` — that breaks the public site.

## Reading a document

```
GET /api/inventory/:id/documents/:docId/download
      ?thumb=1    the *_thumb.* preview instead of the original
      &inline=1   render in the browser rather than forcing a save dialog
```

Authenticated + the rule above, path-traversal checked, `Cache-Control: private, no-store`.
The UI builds this via `inventoryDocumentUrl()` in `api/client.ts` — **use that helper**, never
`doc.file_url` directly (the raw path is blocked and will 403).

## Sharing a document with a customer

`POST /:id/documents/:docId/share` no longer sends a raw `/uploads` link. It mints a **7-day
HMAC-signed** link served by a public, token-gated route:

```
GET /inventory/:id/documents/:docId/public?token=<exp>.<sig>
```

Reuses `utils/pdf_token.ts`, the same scheme as brochure PDFs. The token is bound to the
**document id** and an expiry, so a forwarded link expires on its own and cannot be re-pointed at
another document. Verified: valid `200`, expired `403`, tampered `403`, absent `403`, reused on a
different document `403`.

This changed nothing in the field — `document_shared` interactions were **0**; the feature had
never been used.

## Uploading a document (`d7758bf`)

`POST /:id/documents`, max **20 MB**, single file. Accepted: PDF · JPG/PNG/WebP · Word · Excel.

🔴 **`application/octet-stream` and an empty mimetype are accepted when the EXTENSION is a known
document type** (`.pdf .doc .docx .xls .xlsx .jpg .jpeg .png .webp`). Android pickers routinely
hand over a perfectly good PDF with no usable mimetype — matching on mimetype alone refused it.
Do not "tidy" that rule away; it is the same rule the media route needed in `cde4667`.

Rejections come back as a **400 naming the file**, via the `uploadDocument` wrapper. Before
`d7758bf` the `fileFilter` throw was unhandled, so every rejected file produced a **500** plus a
false `[Alert:CRITICAL] server_5xx`. A 500 on this route now means a genuine bug.

`docUpload` still uses `memoryStorage` — fine here, because it is a single file at 20 MB. The media
route had to move to `diskStorage` only because it accepts 20 files at 100 MB.

⚠ The multer middleware runs **before** `mayAccessDocuments`, so an unauthorized upload is buffered
(≤20 MB) before being refused with a 403. Wasteful, not dangerous.

⚠ **iPhone photos of a deed are `.heic` and are still refused.** Accepting them needs a
sharp-based conversion to JPEG on upload, or the stored file will not render in any browser — a
deliberate decision, not an oversight.

## Diagnosis

```bash
# Should be 403 — if this returns 200 the static guard is gone
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.realtypandit.in/uploads/properties/<id>/documents/<file>

# Should be 200 — if this 403s, the guard regex is too greedy and the website is broken
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.realtypandit.in/uploads/properties/<id>/<photo>.webp

# Who can reach a given document?
sudo -u postgres psql -d reality_pandit -c "
SELECT a.name, a.role FROM agents a, inventory i
WHERE i.id = '<inventory-id>' AND a.status = 'active'
  AND (a.role='super_boss' OR a.id = i.assigned_agent_id OR a.id = i.uploaded_by_agent_id);"
```

A **403** naming the rule is working as designed. Documents live at
`uploads/properties/<inventory-id>/documents/`.

## Known / not fixed

- **The Media tab requests `*_thumb_thumb.webp`** and 404s on every property photo — it appends
  `_thumb` to a URL that already ends in `_thumb`. Pre-existing, unrelated to documents,
  confirmed **404 not 403** (so not the static guard). Cosmetic but noisy in the console.
- ~~Document upload rejects `application/octet-stream`~~ — **fixed in `d7758bf`**, see below.
- `services/storage.ts` builds a second, unrelated `/uploads/documents/<key>/` path. It is **dead
  code** — no callers, empty directory — and is *not* covered by the static guard.
- `GET /:id/enrichment` still does `include: { documents: true }` although it never returns them.
  Harmless today; a trap if someone later spreads the row into the response.

## ⚠ Note on commit `56ee0bd`

That commit also captured a **pre-existing, uncommitted** change that was already live on prod:
`rosterForPickers()` in `api/client.ts` plus its two call sites in `InventoryList.tsx` (the
name-sorted, active-only roster for filter chips). It is unrelated to document access — it was
swept in because the repo lagged the live files, which is the normal direction of drift here
(`precaution_local_repo_behind_prod`).

Related: [[inventory-media-upload]] (photos/videos, which stay public), `precaution_local_repo_behind_prod`.
