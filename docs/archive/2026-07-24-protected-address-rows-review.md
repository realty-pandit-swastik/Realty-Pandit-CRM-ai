# Protected address rows — review (EXEC 2 backfill, 2026-07-24)

**What these are.** The EXEC 2 (`c4933f9`) `full_address` backfill found 157 inventory rows whose
`full_address` string did not contain their `plot_no`. It rebuilt 58 of them from the structured
address fields. The **99 rows below were PROTECTED** (left untouched) because a naive rebuild
would have **dropped Google-geocoded locality detail** (e.g. a specific Khand / Sector / society name).

**Important:** the plot number is NOT lost for these rows — it still lives in the `plot_no` column and
shows in the admin address-edit form. Only the concatenated `full_address` *string* omits it.

## Recommendation

**Leave them as-is.** Three reasons:
1. The current `full_address` keeps accurate Google locality detail; the "naive rebuild" column below is
   raw user-typed data that is usually messier (note the frequent wrong "Meerut Division" token).
2. `plot_no` is preserved in its own column — nothing is actually lost.
3. EXEC 2 fixed the edit form to recompute `full_address` correctly, so each row **self-heals** the next
   time anyone edits its address.

If you still want the plot number inside the string for a specific row, just open it in the admin and
re-save — it will rebuild cleanly. No bulk action recommended.

## The 99 rows

| # | display_id | plot_no (in its own column) | detail that would be lost | current full_address (kept) | naive rebuild (rejected) |
|---|---|---|---|---|---|
| 1 | RP-MEE-COM-20167 | 1001 | Sector 3F | Sector 3 | Vaishali | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | Left side 1001, 1001, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 2 | RP-MEE-RES-20157 | 615 | Sector-1 | Ghaziabad | Sector-1, Vaishali, Ghaziabad, Uttar Pradesh, India | 615, Sector 1 vaishali, Sarthak enclave, Meerut Division, Uttar Pradesh - 201019 |
| 3 | RP-GZB-RES-20322 | B 53 | Surya Nagar | Rampuri, Surya Nagar, Ghaziabad, Uttar Pradesh 201011, India | B 53, Ramprastha colony, Rampuri ramprastha colony, Ghaziabad, Uttar Pradesh - 201011 |
| 4 | RP-MEE-COM-20182 | 898 | Vaishali | Vaishali, Ghaziabad, Uttar Pradesh, India | 898, Sector 5, Ghaziabad, Meerut Division, Uttar Pradesh |
| 5 | RP-GZB-COM-20132 | CP 4 | c 1 | Shakti Khand | Shakti Khand 4 | c 1, 4, Shakti Khand, Shakti Khand 4, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | CP 4, Ghaziabad, Indirapuram, Ghaziabad, Uttar Pradesh - 201014 |
| 6 | RP-GZB-RES-20275 | 26 | Block C | Sector 2A, Block C, Sector 2, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | G4, 26, Sector 2A Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 7 | RP-GHA-COM-20433 | 64 | Ghaziabad | Gyan Khand 1, Indirapuram, Ghaziabad, Uttar Pradesh, India | Gf shop, 64, Gyan khand 1 indirapuram, Ghaziqbad, Uttar Pradesh - 201014 |
| 8 | RP-GZB-RES-20045 | 60 | Sector 5 | Sector 5, Vaishali, Ghaziabad, Uttar Pradesh, India | 60, Vaishali , Sector 4 , Ghaziabad, Uttar Pradesh - 201010 |
| 9 | RP-MEE-RES-20142 | 195 | Vaishali Sector - 6 | Vaishali | Vaishali Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh, India | UG 3, 195, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 10 | RP-MEE-COM-20190 | Sector 3 | Vaishali | Vaishali, Ghaziabad, Uttar Pradesh, India | Sector 3, Metro Mahagun Mall, Ghaziabad, Meerut Division, Uttar Pradesh |
| 11 | RP-GZB-RES-20080 | 306 | Sector 4 | Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 306, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 12 | RP-MEE-RES-20189 | 195 | Vaishali Rd | Sector 4 | Vaishali | 4, Vaishali Rd, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | Yes, 195, Builder, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 13 | RP-GZB-COM-20172 | 1003-1004 | Sector 3F | Sector 3 | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | 1003-1004, 1003-1004, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 14 | RP-MEE-RES-20396 | 183 | Vaishali | Vaishali, Ghaziabad, Uttar Pradesh, India | 183, Sector 6, Ghaziabad, Meerut Division, Uttar Pradesh |
| 15 | RP-MEE-RES-20300 | Sector 6 | Vaishali | Vaishali, Ghaziabad, Uttar Pradesh, India | Sector 6, Ghaziabad, Meerut Division, Uttar Pradesh |
| 16 | RP-MEE-RES-20392 | 2 | Vaishali | Vaishali, Ghaziabad, Uttar Pradesh, India | 208, 2, Hindon height, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 17 | RP-GZB-RES-20421 | 146 | Shakti Khand 2 | Indirapuram | Shakti Khand 2, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | FF 3, 146, Shakti khand  2, Ghaziabad, Uttar Pradesh - 201014 |
| 18 | RP-MEE-RES-20143 | 19/ sec 2 vaishali | Sector 2 | Sector 2, Vaishali, Ghaziabad, Uttar Pradesh, India | G2, 19/ sec 2 vaishali, Builder, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 19 | RP-GZB-RES-20009 | 565 | Sector 4 | Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | GF, 565, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 20 | RP-GZB-COM-20107 | mcdonald | Amity International School Sector 1 | Sector 1 | Amity International School Sector 1, Sector 1, Vasundhara, Ghaziabad, Uttar Pradesh 201012, India | 1st and 2nd floor, mcdonald, Ghaziabad, Vasundhara, Ghaziabad, Uttar Pradesh - 201012 |
| 21 | RP-GZB-RES-20423 | 331 | Vaishali | Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 331, Sector 4, Ghaziabad, Uttar Pradesh - 201019 |
| 22 | RP-GZB-RES-20511 | Supertech Estate Est | M83W+9WJ | Vaishali Extension | M83W+9WJ, Vaishali Extension, Sector 9, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 6, Supertech Estate Est, Supertech , Sector 9, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 23 | RP-GZB-RES-20366 | Ahinsha khand 1 | SOCIETY | Indirapuram | ATS ADVANTAGE, 10231, SOCIETY, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | 2, Ahinsha khand 1, Ats Advantage, Ghaziabad, Windsor facing, Ghaziabad, Uttar Pradesh - 201014 |
| 24 | RP-GZB-RES-20070 | 630 | Niti Khand I | Niti Khand I, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | 630, Ghaziabad, Indirapuram, Ghaziabad, Uttar Pradesh - 201014 |
| 25 | RP-MEE-RES-20391 | 1 | Ghaziabad | Vaishali, Ghaziabad, Uttar Pradesh, India | 708, 1, Hindon height, Vaishali, Sector 3, Meerut Division, Uttar Pradesh - 201019 |
| 26 | RP-GZB-AGR-20320 | Cinema hall building plot | Vivek Bhavan | Pacific Business Park | Sahibabad Industrial Area Site 4 | Vivek Bhavan, Pacific Business Park, Maharajpur, Sahibabad Industrial Area Site 4, Sahibabad, Ghaziabad, Uttar Pradesh 201010, India | Cinema hall building plot, Maharajpur sahibabad industrial areasite 4, Ghaziabad, Uttar Pradesh - 201010 |
| 27 | RP-GZB-RES-20098 | 412 | Sector 3 | Sector 3, Vasundhara, Ghaziabad, Uttar Pradesh 201012, India | S3, 412, Ghaziabad, Vasundhara, Ghaziabad, Uttar Pradesh - 201012 |
| 28 | RP-GZB-RES-20066 | 387 | Sector 5 | Sector 5, Vaishali, Ghaziabad, Uttar Pradesh, India | 387, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201010 |
| 29 | RP-GZB-RES-20025 | 1046 | Sector 3 | Sector 3, Vasundhara, Ghaziabad, Uttar Pradesh 201012, India | 1046, Ghaziabad, Vasundhara, Ghaziabad, Uttar Pradesh - 201012 |
| 30 | RP-GZB-RES-20296 | 6/2/62 | Vaishali Sector - 6 | Vaishali Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh, India | 6/2/62, Sector 6 vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 31 | RP-MEE-RES-20413 | 10 | Vasundhara | Vasundhara, Ghaziabad, Uttar Pradesh, India | 74, 10, Ghaziabad, Meerut Division, Uttar Pradesh |
| 32 | RP-GZB-RES-20312 | 5 | Ahlcon Apartment | Ahlcon Apartment, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 4, 5, Ehelcon apartment, Sector 4 vaishali ghaziabad, Ghaziabad, Uttar Pradesh - 201019 |
| 33 | RP-GZB-RES-20103 | 956 | Sector 3 | Sector 3, Vasundhara, Ghaziabad, Uttar Pradesh 201012, India | 956, Ghaziabad, Vasundhara, Ghaziabad, Uttar Pradesh - 201012 |
| 34 | RP-GZB-COM-20124 | 3 side open | Sector 3 | Sector 3, Vasundhara, Ghaziabad, Uttar Pradesh 201012, India | Corner plot, 3 side open, Ghaziabad, Vasundhara, Ghaziabad, Uttar Pradesh - 201012 |
| 35 | RP-KAU-RES-20064 | 11 | KA Block | KA Block, Kaushambi, Ghaziabad, Uttar Pradesh 201010, India | 11, 11, Kaushambi Ghaziabad, Kaushambi, Kaushambi metro station, Kaushambi, Uttar Pradesh - 201010 |
| 36 | RP-GNO-RES-20050 | Greater Noida West | Greater Noida W Rd | Noida Phase-2 | Chipyana Khurd Urf Tigri | 2, Greater Noida W Rd, Noida Phase-2, Gaur City 2, Greater Noida, Chipyana Khurd Urf Tigri, Uttar Pradesh 201009, India | H-1955, Greater Noida West, Gaur city 11th Avenue, Greater Noida, Gaur City 2, Greater Noida, Uttar Pradesh - 201308 |
| 37 | RP-GZB-RES-20006 | 47 | Sector-1 | Sector-1, Vaishali, Ghaziabad, Uttar Pradesh, India | Ff, 47, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh |
| 38 | RP-GZB-COM-20314 | 92 | Ambedkar Rd | Chaudhary More | Gandhi Nagar | Bagh Bhathyari | Daulatpura | Ambedkar Rd, Chaudhary More, Gandhi Nagar, Bagh Bhathyari, Daulatpura, Ghaziabad, Uttar Pradesh 201001, India | Croma showroom, 92, Ambedkar road, Ghaziabad, Uttar Pradesh - 201001 |
| 39 | RP-GZB-RES-20134 | 149 | Sector 2 | Wave City Marg | Sector 2, Wave City Marg, Wave City, Ghaziabad, Uttar Pradesh 201015, India | 149, Ghaziabad, Wave City, Ghaziabad, Uttar Pradesh - 201015 |
| 40 | RP-GZB-RES-20062 | 932 | Shakti Khand 4 | Shakti Khand 4, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | 932, Ghaziabad, Indirapuram, Ghaziabad, Uttar Pradesh - 201014 |
| 41 | RP-GZB-RES-20091 | 302 | Sector 4 | Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | Ug3, 302, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 42 | RP-MEE-RES-20145 | 196 | Vaishali Sector - 6 | Vaishali | Vaishali Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh, India | G1, 196, BUILDER, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 43 | RP-GZB-RES-20026 | 174 | Sector 15 | Sector 15, Vasundhara, Ghaziabad, Uttar Pradesh, India | 174, Ghaziabad, Vasundhara, Ghaziabad, Uttar Pradesh |
| 44 | RP-VAI-RES-20035 | 300 | Sector 3A | Block A | Ghaziabad | Sector 3A, Block A, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | Sector 3 A, 300, Sector 3 A Rachna Vaishali, Vaishali, Jain Mandir, Vaishali, Uttar Pradesh - 201019 |
| 45 | RP-GZB-COM-20024 | 49 | Site 4 | Sahibabad Industrial Area Site 4 | Site 4, Sahibabad Industrial Area Site 4, Sahibabad, Ghaziabad, Uttar Pradesh 201010, India | 49, Industrial, Ghaziabad, Sahibabad, Ghaziabad, Uttar Pradesh - 201010 |
| 46 | RP-MEE-RES-20192 | 348 | Sector 5 | Vaishali | Sector 5, Vaishali, Ghaziabad, Uttar Pradesh, India | 1, 348, Karva, Ghaziabad, Meerut Division, Uttar Pradesh |
| 47 | RP-GZB-RES-20373 | 4/92 | Rachna Vaishali | Rachna Vaishali, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 3, 4/92, Sector 4 vaishali, Sector 4 vaishali ghaziabad uttar pradesh, Ghaziabad, Uttar Pradesh - 201019 |
| 48 | RP-GZB-COM-20100 | A-601 | Cloud-9 | Sector-1 | Cloud-9, Sector-1, Vaishali, Ghaziabad, Uttar Pradesh 201010, India | S-3, A-601, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201010 |
| 49 | RP-GZB-RES-20313 | 23 | Sector-1 | Sector-1, Vaishali, Ghaziabad, Uttar Pradesh, India | 23, Sector 1 vaishali ghaziabad, Ghaziabad, Uttar Pradesh - 201014 |
| 50 | RP-GZB-RES-20099 | 75 | Sector 2A Rd | Sector 2A | Block C | Sector 2 | Sector 2A Rd, Sector 2A, Block C, Sector 2, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | Ff3, 75, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 51 | RP-GZB-COM-20170 | 1018 | Sector 3F | Sector 3 | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | 1018-1019, 1018, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 52 | RP-MEE-COM-20165 | 1018 | Sector 3F | Sector 3 | Vaishali | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | Shop 1018, 1018, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 53 | RP-MEE-RES-20436 | 42 | Vaishali | Vaishali, Ghaziabad, Uttar Pradesh, India | 42, Sector 4, Ghaziabad, Meerut Division, Uttar Pradesh |
| 54 | RP-GZB-RES-20424 | NK1/955 NIti Khand 1 | Niti Khand I | Niti Khand I, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | 2, NK1/955 NIti Khand 1, NIti Khand 1, Indirapuram Ghaziabad, NIti Khand , Ghaziabad, Uttar Pradesh - 201014 |
| 55 | RP-GZB-AGR-20321 | Khasra number no 723 | Masuri Canal Bridge | Masuri Canal Bridge, Masuri, Uttar Pradesh 201015, India | Khasra number no 723, Main road, Masuri, Ghaziabad, Uttar Pradesh - 201015 |
| 56 | RP-GZB-RES-20021 | 5/435 | Sector 5 | Sector 5, Vaishali, Ghaziabad, Uttar Pradesh, India | 5/435, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 57 | RP-GZB-RES-20850 | 128 | 5/153 A | 153 A | 5/153 A, 153 A, Sector 5, Vaishali, Ghaziabad, Uttar Pradesh - 201019 | 5/128, 128, Sector 5, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 58 | RP-MEE-RES-20333 | 414/4 | Sector 4 | Vaishali | Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | Yes, 414/4, Builder flat, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 59 | RP-GZB-RES-20332 | 6 | Vaishali | Vaishali, Ghaziabad, Uttar Pradesh, India | 6, Sector- 6, Ghaziabad, Ghaziabad, Uttar Pradesh - 201019 |
| 60 | RP-MEE-COM-20169 | 1003 | Sector 3F | Sector 3 | Vaishali | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | Shop 1003, 1003, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 61 | RP-MEE-RES-20144 | 113 | Sector 3 | Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | 2nd, 113, Vaishali Sec 3, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 62 | RP-GZB-RES-20096 | 415 | Niti Khand 2 | Niti Khand 2, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | G 101, 415, Ghaziabad, Indirapuram, Ghaziabad, Uttar Pradesh - 201014 |
| 63 | RP-MEE-RES-20158 | 233A | Ram Nagar | Naya Ganj | Ram Nagar, Naya Ganj, Ghaziabad, Uttar Pradesh 201001, India | S1, 233A, Ghaziabad, Meerut Division, Uttar Pradesh - 201001 |
| 64 | RP-GZB-COM-20171 | , 1001-1002 | Sector 3F | Sector 3 | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | 1001-1002, , 1001-1002, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 65 | RP-MEE-RES-20301 | 218 | Indirapuram | Indirapuram, Ghaziabad, Uttar Pradesh, India | 218, Shakti Khand 2, Ghaziabad, Meerut Division, Uttar Pradesh |
| 66 | RP-GZB-RES-20369 | Aditya Megha City | Aditya Mega City | Aditya Mega City, Vaibhav Khand, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | I- 102, Aditya Megha City, Aditya Megha City, Vaibhav Khand indirapuram ghaziabad, Ghaziabad, Uttar Pradesh - 201014 |
| 67 | RP-MEE-COM-20166 | 1019 | Sector 3F | Sector 3 | Vaishali | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | Right side Shop 1019, 1019, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 68 | RP-GZB-RES-20318 | 700 | Rachna flats | 3A/275 | Block A | Rachna flats, 3A/275, Sector 3A, Block A, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 700, Sector 3A Rachna, Vaishali ghaziabad uttar pradesh, Ghaziabad, Uttar Pradesh - 201014 |
| 69 | RP-MEE-RES-20299 | Vaishali sector-4 | Sector 4 | Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | F1, Vaishali sector-4, Builder floors, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 70 | RP-GZB-RES-20109 | 777 | Sector 5 | Sector 5, Vaishali, Ghaziabad, Uttar Pradesh, India | 2nd floor with roof, 777, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 71 | RP-GZB-RES-20002 | 891 | Niti Khand I | Niti Khand I, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | Sf4, 891, Ghaziabad, Indirapuram, Ghaziabad, Uttar Pradesh - 201014 |
| 72 | RP-GZB-RES-20121 | 581 | Sector 4 | Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 581, Vaishali, Sector-4, Ghaziabad, Uttar Pradesh - 201019 |
| 73 | RP-GZB-RES-20409 | 3 | Design Arch Ehomes sector 5 vaishali ghaziabad | Design Arch Ehomes sector 5 vaishali ghaziabad | PH2, 3, Design Arch Ehomes, Sector 5 vaishali ghaziabad, Ghaziabad, Uttar Pradesh - 201019 |
| 74 | RP-MEE-COM-20168 | 1002 | Sector 3F | Sector 3 | Vaishali | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | Shop 1002, 1002, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 75 | RP-GZB-RES-20463 | SK2-65A | SK2-66 | F3, SK2-66, Shakti khand 2 indirapuram , Shakti khand 2 indirapuram , Shakti khand 2 , Ghaziabad, Uttar Pradesh - 201014 | F3, SK2-65A, Shakti khand 2 indirapuram , Shakti khand 2 indirapuram , Shakti khand 2 , Ghaziabad, Uttar Pradesh - 201014 |
| 76 | RP-GZB-RES-20120 | 501 | Sector 5 | Sector 5, Vaishali, Ghaziabad, Uttar Pradesh, India | S1, 501, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh |
| 77 | RP-GZB-RES-20372 | 4/92 | Rachna Vaishali | Rachna Vaishali, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 3, 4/92, Sector 4 vaishali, Sector 4 vaishali ghaziabad uttar, Ghaziabad, Uttar Pradesh - 201019 |
| 78 | RP-GAR-RES-20330 | H 10 | R34P+3Q | Shahpur Chaudhary | R34P+3Q, Shahpur Chaudhary, Uttar Pradesh 245205 | H 10, Ganga county, Garhmukteshwar, Uttar Pradesh - 245205 |
| 79 | RP-MEE-RES-20395 | 565 | Vaishali | Vaishali, Ghaziabad, Uttar Pradesh, India | F1, 565, Sector 5, Ghaziabad, Meerut Division, Uttar Pradesh |
| 80 | RP-GZB-RES-20181 | 294 | Sector-1 | Sector-1, Vaishali, Ghaziabad, Uttar Pradesh, India | Ff2, 294, Sector 1 vaishali, Ghaziabad, Uttar Pradesh |
| 81 | RP-GZB-RES-20319 | 800 | Block B | Sector 3A, Block B, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 800, Sector 3A Rachna, Vaishali ghaziabad uttar pradesh, Ghaziabad, Uttar Pradesh - 201019 |
| 82 | RP-GNO-RES-20046 | Techzone4 | Nirala Greenshire | NIRALA GREENSHIRE | Noida-Greater Noida Link Rd | Sector 2 | Nirala Greenshire, NIRALA GREENSHIRE, Noida-Greater Noida Link Rd, Sector 2, Patwari, Greater Noida, Uttar Pradesh 201318, India | G12, 1903, Techzone4, Greater Noida, Patwari, Greater Noida, Uttar Pradesh - 201318 |
| 83 | RP-MEE-RES-20156 | 206 | Vaishali Sector - 6 | Vaishali | Vaishali Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh, India | UGF, 206, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 84 | RP-VAI-RES-20122 | 195 | Vaishali Sector - 6 | Ghaziabad | Vaishali Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh, India | F3, 195, Media Enclave, Vaishali, Sector 6, Vaishali, Uttar Pradesh - 201019 |
| 85 | RP-MEE-RES-20155 | 496 | Sector 3F | Vaishali | Sector 3F, Sector 3, Vaishali, Ghaziabad, Uttar Pradesh, India | 3, 496, Sector 3 F Block, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 86 | RP-MEE-RES-20164 | 429 | Niti Khand I | Indirapuram | Niti Khand I, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | A4, 429, Ghaziabad niti khand 1, Meerut Division, Uttar Pradesh - 201014 |
| 87 | RP-VAS-RES-20065 | 11/213 | Ghaziabad | Sector 11, Vasundhara, Ghaziabad, Uttar Pradesh, India | Kothi, 11/213, Vasundhara sector 11, Vasundhara sector 11, Vasundhara, Vasundhara sector 11, Uttar Pradesh - 201012 |
| 88 | RP-GZB-RES-20764 | 4/521 | Gaur Ganga 2 | 552, Gaur Ganga 2, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | All, 4/521, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 89 | RP-MEE-RES-20191 | Sec 4 vaishali | Leela Homes | Sector 4 | Leela Homes, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | Yes, Sec 4 vaishali, Leela home's, Ghaziabad, Meerut Division, Uttar Pradesh - 201019 |
| 90 | RP-GZB-RES-20779 | 204 | Sector 5 | 103, 856, Sector 5, Vaishali, Ghaziabad, Uttar Pradesh - 201019 | UG3, 204, Vaishali Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 91 | RP-GZB-RES-20730 | 12/312 | M967+CHG | M967+CHG, Sector 12, Vasundhara, Ghaziabad, Uttar Pradesh 201012, India | 12/312, 12/312, Housing society society sector 12 vasundhara , Sector 12 vasundhara , Judge colonyVasundhara, Ghaziabad, Uttar Pradesh - 201012 |
| 92 | RP-GZB-RES-20093 | 725 | Sector 5 | Sector 5, Vaishali, Ghaziabad, Uttar Pradesh, India | UG3, 725, Karwan Lane, Ghaziabad, Vaishali, Ghaziabad, Uttar Pradesh - 201010 |
| 93 | RP-GZB-RES-20782 | 10A-165 | Plot no-186 | Pocket A | sector - 10a | Attri Niwas, Plot no-186, Pocket A, sector - 10a, Vasundhara, Ghaziabad, Uttar Pradesh 201012, India | 2, 10A-165, Attri Niwas, Sector 10 A, Vasundhara, Ghaziabad, Uttar Pradesh - 201012 |
| 94 | RP-GZB-RES-20844 | 5/876 | Fourth Floor | Supertech Residency | 425, Fourth Floor, Supertech Residency, Sector 5, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 3, 5/876, Vaishali, Sector 5, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 95 | RP-GZB-COM-20781 | 4/507 | Gaur Ganga 2 | 552, Gaur Ganga 2, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 4/507, 4/507, Sector 4, Vaishali, Ghaziabad, Uttar Pradesh - 201019 |
| 96 | RP-GZB-RES-20784 | 5/428 | Fourth Floor | Supertech Residency | 425, Fourth Floor, Supertech Residency, Sector 5, Vaishali, Ghaziabad, Uttar Pradesh 201019, India | 3, 5/428, Sector 5, Vaishali, Ghaziabad, Uttar Pradesh 201019, India, Sector 5 vaishali , Bharat dairy, Ghaziabad, Uttar Pradesh - 201019 |
| 97 | RP-GZB-RES-20466 | NK2-366 | Plot no.498 | Plot no.498, Niti Khand 2, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | 2, NK2-366, Niti Khand 2, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India, NIti Khand 2 indirapuram ghaziabad , Niti Khand 2, Ghaziabad, Uttar Pradesh - 201014 |
| 98 | RP-GZB-RES-20734 | 6/207 | Plot No 11 | Vaishali Extension | Plot No 11, Vaishali Extension, Vaishali Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh 201012, India | 6/207-FF, 6/207,  Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh 201012, India, Vaishali Sector - 6, Vaishali, Ghaziabad, Uttar Pradesh - 201012 |
| 99 | RP-GZB-RES-20780 | Aditya Megha City  | J9Q7+72G | J9Q7+72G, Aditya Mega City, Vaibhav Khand, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India | 102, Aditya Megha City , Aditya Mega City, Vaibhav Khand, Indirapuram, Ghaziabad, Uttar Pradesh - 201014 |
