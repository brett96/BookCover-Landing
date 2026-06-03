# BookCover Demo Portal (Landing)

Marketing landing page with Firebase registration, email OTP verification, and gated links to the Member and Agent demo sites.

## Deploy overview

Three separate Vercel projects share one Firebase project and one `DEMO_JWT_SECRET`:

| Vercel project | Root folder | Domain |
|----------------|-------------|--------|
| Landing | This repo | `bookcover.cercalabs.com` |
| Member demo | `BCMemberDemo/web` | `bcmemberdemo.cercalabs.com` |
| Agent demo | `BookCover Agent Portal Demo/bookcover-agent-portal` | `bcagentportaldemo.cercalabs.com` |
