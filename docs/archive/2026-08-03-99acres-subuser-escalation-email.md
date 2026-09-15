# DRAFT — escalation email to 99acres (SubUserName missing from lead feed)

**To:** pramod.verma@99acres.com
**Status:** DRAFT — not sent. Review before sending.
**Evidence gathered:** 2026-08-03 from production DB (2,626 `99acres` lead-capture records) + git history.

---

**Subject:** 99acres lead feed — `SubUserName` missing on 100% of leads since 22 July 2026 (200 leads affected)

Dear Pramod,

I hope you're well.

We have an issue with the 99acres lead API feed that we would like your team's help on. Since
**22 July 2026**, the `SubUserName` field has stopped being returned in the lead response. Every
other field continues to arrive normally, so this appears to be isolated to that one field.

`SubUserName` is important to us because we use it to route each enquiry to the specific team
member whose listing generated it. Without it we cannot identify the listing owner, and the
enquiry has to be distributed manually instead.

**What we are seeing**

| | Before 22 Jul 2026 | After 22 Jul 2026 |
|---|---|---|
| Leads received | 2,426 | 200 |
| `SubUserName` present | **94.4%** | **0.0%** |
| `CityName` present | 96.5% | 95.5% |
| `PropertyCode` present | 96.9% | 96.0% |
| `Price` present | 96.5% | 95.5% |
| `ResCom` present | 96.5% | 95.5% |
| `ProjName` present | 27.3% | 28.0% |

The last lead that included `SubUserName` was received at **2026-07-22 13:56 UTC (19:26 IST)**.
Since then we have received **200 consecutive leads over 12 days with the field empty on every
single one** — there has not been a single exception.

Daily breakdown across the changeover:

```
2026-07-20   16 leads   16 with SubUserName
2026-07-21    9 leads    8 with SubUserName
2026-07-22   16 leads   14 with SubUserName
2026-07-23   19 leads    0 with SubUserName   <-- change begins
2026-07-24    8 leads    0
2026-07-25   19 leads    0
...
2026-08-02   19 leads    0
2026-08-03    8 leads    0
```

**One related observation**

Over the same period, `QryId` changed from being present on 24.6% of leads to **100%**. That
suggests the response payload was modified around 22 July. It may help your team locate the
change.

**What we have already ruled out on our side**

We checked our integration thoroughly before raising this:

1. Our parser has not been modified since **11 April 2026** — confirmed from our version history.
   No change was deployed on or around 22 July that touches this field.
2. Our parser accepts **both** `SubUserName` and `subUserName`, so a change in capitalisation
   would still be read correctly.
3. Every other field we read from the same object in the response continues to parse at an
   unchanged rate (see table above). Only this one field became empty.
4. Before 22 July the field was arriving correctly for **12 distinct sub-user accounts**,
   including:
   `vksingh6879@gmail.com` (559 leads), `jadonsumit001@gmail.com` (468),
   `khan.mahraj199@gmail.com` (348), `ravindragolaji96@gmail.com` (286),
   `haardiq0308@gmail.com` (217), `ashwanikashyap8595@gmail.com` (139).
   Our account mapping is therefore correct and unchanged.

**Sample leads for your reference** (all received with `SubUserName` empty):

| Received (UTC) | QryId | PropertyCode | City |
|---|---|---|---|
| 2026-08-03 10:56 | `6a7072cb6d40c13a540a1576` | V85227942 | Ghaziabad |
| 2026-08-03 10:56 | `6a707323bba3785600c57372` | X87009290 | Ghaziabad |
| 2026-08-03 10:20 | `6a706b1cbba3785600c55ab7` | R83125304 | Ghaziabad |
| 2026-08-03 10:08 | `6a706687bba3785600c54c92` | D93032486 | Ghaziabad |
| 2026-08-03 08:08 | `6a704a7f6d40c13a5409933a` | Z88091626 | Ghaziabad |
| 2026-08-03 07:08 | `6a703c8fbba3785600c4c43a` | M92320334 | Ghaziabad |

**Business impact**

Roughly **17 leads per day** currently cannot be routed to the team member who owns the listing.
This slows our response time and means the consultant who posted the property is not the one who
receives the enquiry.

**What we would like your help with**

1. Please confirm whether a change was made to the lead API response on or around **22 July 2026**
   that removed or renamed `SubUserName`.
2. If the field has been renamed or moved, please share the updated field name or the current API
   specification so we can update our integration.
3. If it was removed unintentionally, please restore it.
4. Separately, `CmpctLabl` and `QryInfo` have been empty on **100%** of leads for as long as we
   have records — both before and after this change. If these are expected to carry data on our
   account, we would appreciate having them enabled, as they would help us identify the enquiry.
5. If possible, please let us know whether the leads received since 22 July can be re-supplied
   with their sub-user attribution, so we can route the backlog correctly.

Happy to jump on a call or share any further logs that would help.

Thank you for your support.

Best regards,

[Your name]
Realty Pandit
[Phone] · [Email]

---

## Notes for internal review (not part of the email)

- **Our system is not at fault.** Verified two ways: the parse line
  `subUserName: this.xmlStr(qryDtl.SubUserName || qryDtl.subUserName)` last changed 2026-04-11
  (`c12b3f1`), and a pickaxe search shows no other commit ever modified that string. The
  2026-07-24 commit `27884c8` changed only the *fallback* routing and *logging*, not parsing.
- **The 07-22 date is a coincidence worth knowing about**: that was also the day of the three
  production outages and the "snapshot production source" commit `37a7ad7`. That commit did not
  alter the parse line — confirmed — but expect the question to be raised internally.
- `CmpctLabl` / `QryInfo` at 0% is **pre-existing**, not a regression. Stated as a separate,
  softer ask so it doesn't dilute the main issue.
- Fallback behaviour today: unmatched leads go to manager round-robin (`27884c8`), so **no lead is
  lost** — only mis-routed. Worth saying on a call if they push back on severity.
