# Realty Pandit Mobile

<!-- impeccable:product-schema 1 -->

## Platform
adaptive

## Stack
TypeScript, React Native, Expo development builds, Expo Router, TanStack Query and SecureStore, as specified in MOBILE_PLAN.md.

## Users
Staff, managers, super administrators, partners and builders. Public consumer journeys stay on the website.

## Product Purpose
Take a lead from capture and qualification through matching, sharing, visits, negotiation and recorded outcomes using the existing CRM backend.

## Operating Context
The user confirmed that the first home screen should lead with assigned follow-ups and visits. Connectivity is required for authoritative writes and communications. Mobile must retain the separate identity and permission domains of existing clients.

## Capabilities and Constraints
The Express backend owns business rules, tenancy, identity normalization, taxonomy, prices and lifecycle transitions. No old Android code may be reused. No production deployment, migration, store submission or live customer communication is authorized. Performance budgets in MOBILE_PLAN.md are targets pending release-device measurements.

## Brand Commitments
Retain the Realty Pandit identity. Use the user's Deep Navy, Emerald Teal, Soft White and Slate Gray palette. Native controls, useful density and restrained presentation take precedence over marketing effects.

## Evidence on Hand
Current repository source and synthetic test fixtures. No native acceptance evidence existed at kickoff. Existing web implementation is a contract reference, not proof of native parity.

## Product Principles
- Show the next real action and its context.
- Preserve backend authority and server authorization.
- Keep failure distinct from empty data and preserve unsaved input.
- Report verification by platform without fabricated results.

## Accessibility & Inclusion
System fonts and text scaling, screen-reader labels, safe areas, keyboard handling, platform Back behavior and at least 48-unit touch targets. Respect reduced motion.
