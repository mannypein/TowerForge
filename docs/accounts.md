# Site accounts — passwords and recovery codes

Accounts (`TowerForge.Server`, SQLite `users` table) are a username and a
password hash — no email. So a forgotten password can't be reset by mail;
**recovery codes** do it instead (2026-10-23).

## How it works

- **A recovery code** is 16 random characters from 31 that can't be mixed
  up (no 0/O, 1/I/L), shown as `XXXX-XXXX-XXXX-XXXX` — about 79 bits.
  It's hashed like a password (ASP.NET Core Identity's PBKDF2 hasher) in
  `recovery_codes` (one per account, with when and who made it:
  `player` or `owner`). The plain code is shown once, when it's made.
- **New accounts** get one straight away; the Account page shows it with
  Copy and "I've saved it".
- **Signed in**, the Account page shows whether the account has a code,
  makes a new one (the old one stops working), and changes the password
  (current password needed).
- **Forgot your password?** (Account → Sign In): username + recovery code +
  new password. Spaces, dashes and capitals in the code don't matter. It
  signs in like a normal sign-in (loads the account's stats), uses the
  code up and shows a fresh one.
- Wrong name and wrong code get the same answer and take the same work
  (a dummy hash is checked when there's no account or no code). Every
  endpoint here shares the sign-in rate limit: 10 a minute per IP.
- Not done: sign-ins on other devices stay signed in after a reset (the
  cookie has no "security stamp"; sessions last up to 30 days). Fine for a
  forgotten password; a stolen account would need that added.

API (`Controllers/AccountController.cs`): `POST /api/account/reset-password`
{ username, recoveryCode, newPassword } → like `login` plus
`recoveryCode`; `POST /api/account/recovery-code` (signed in) →
{ recoveryCode }; `POST /api/account/password` { currentPassword,
newPassword } → 204; `register` and `login` / `me` answer `recoveryCodeSet`.

## A player without a code (owner)

The 40-odd accounts made before 2026-10-23 have no code until their owner
signs in and makes one (the Account page asks them to). A player who is
locked out and has no code asks in the Discord; the owner checks the
account is theirs — e.g. their highest tier and wave, their build, a share
code they made, or what their Profile says — then runs, from the repo root:

```
ssh ubuntu@towerforge.net "bash -s -- <username>" < ops/accounts/recovery-code.sh
```

It prints `Recovery code for <name>: XXXX-…` (replacing any code the account
had). Send it to the player privately (a Discord DM); they use it under
Account → Sign In → Forgot your password?, which also gives them their own
new code. The command is the server itself (`TowerForge.Server
--recovery-code <name>`), run as the `towerforge` user with the production
settings, so it never starts the site.

## Checked (2026-10-23)

On a local server with a throwaway database: register returns a code;
wrong code / wrong name → 401 with the same message; short new password →
400; the code typed in lowercase with spaces works, signs in, loads the
save and returns a new code; the old code then fails; the old password
fails and the new one works; change password with a wrong current one →
400, right one → 204; a new code needs a session (401 without); the
11th auth call in a minute → 429. The owner command: a code for a real
name (exit 0) that then resets the password, "No account named …" (exit 1),
usage without a name (exit 2). The Account page did the whole loop in the
browser (create → code shown → sign out → Forgot your password? → new
password and new code → change password), and fits a 375 px screen.
