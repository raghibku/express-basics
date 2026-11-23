# How Authentication Works in This Project

This document explains, step by step, how login, JWT tokens, protected routes, role-based access, and refresh tokens work in this Express + PostgreSQL app. Every section points to the file where the code lives.

---

## 1. The big picture

Authentication answers two questions:

1. **Who are you?** (authentication): the user proves it once with email and password.
2. **What are you allowed to do?** (authorization): checked on every request, using the user's **role**.

HTTP is *stateless*: the server forgets you after each request. So after you log in once, the server gives you a **token** (a signed note that says "this is user #5, role admin"). You send that token with every later request instead of sending your password again.

```
 Client                                   Server
   |  POST /api/v1/auth/login                |
   |  { email, password }  ----------------> |  1. find user by email
   |                                         |  2. bcrypt.compare(password, hash)
   |                                         |  3. check is_active
   |                                         |  4. sign accessToken  (1h,  JWT_SECRET_KEY)
   |                                         |  5. sign refreshToken (10d, JWT_REFRESH_SECRET)
   |  <---- body: { accessToken, user }      |
   |  <---- cookie: refreshToken (httpOnly)  |
   |                                         |
   |  GET /api/v1/users                      |
   |  Authorization: <accessToken> --------> |  auth() middleware verifies token + role
   |  <---- users list                       |
   |                                         |
   |  (1 hour later, access token expired)   |
   |  POST /api/v1/auth/refresh-token        |
   |  cookie: refreshToken  ---------------> |  verify refresh token, sign new accessToken
   |  <---- { accessToken }                  |
```

---

## 2. Step 0: Storing passwords safely (registration)

**File:** [src/modules/users/user.service.ts](../src/modules/users/user.service.ts)

We never store the real password. When a user is created (`POST /api/v1/users`), the password is **hashed** with `bcryptjs`:

```ts
const hashPassword = await bcrypt.hash(password, 10);
```

- A hash is a one-way scramble: you can't turn it back into the password.
- `10` is the *salt rounds* (cost factor). Higher = slower = harder to brute force. 10 is a common default.
- bcrypt adds a random **salt** automatically, so two users with the same password still get different hashes.

After inserting, `delete result.rows[0].password` removes the hash from the response so it never goes back to the client.

The same hashing happens in `updateUserByIdInDB` if a new password is sent.

The `users` table ([src/db/index.ts](../src/db/index.ts)) has the two columns auth relies on:

| Column      | Purpose                                           |
|-------------|---------------------------------------------------|
| `is_Active` | `false` = account disabled, can't log in or use tokens |
| `role`      | `'user'` (default), `'agent'`, or `'admin'`        |

> Postgres lowercases unquoted column names, so `is_Active` is actually stored as `is_active`. That's why the code reads `user.rows[0].is_active`.

---

## 3. What is a JWT?

A **JSON Web Token** is a string with three parts separated by dots:

```
header.payload.signature
eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZW1haWwiOiJhQGIuY29tIiwicm9sZSI6ImFkbWluIn0.k3x...
```

| Part      | Contains                                         |
|-----------|--------------------------------------------------|
| header    | the algorithm, e.g. `HS256`                      |
| payload   | our data: `id`, `name`, `email`, `role`, plus `iat` (issued at) and `exp` (expires) |
| signature | `HMAC(header + payload, SECRET_KEY)`              |

Important points:

- The payload is **encoded, not encrypted**. Anyone can decode it (try pasting a token into jwt.io). **Never put passwords or secrets in it.**
- The **signature** is what makes it trustworthy. Only the server knows the secret key, so only the server can create a valid signature. If someone edits the payload (e.g. changes `role` to `admin`), the signature no longer matches and `jwt.verify` throws an error.
- The token carries its own expiry (`exp`), so the server doesn't need to store sessions.

The secrets come from `.env` through [src/config/index.ts](../src/config/index.ts):

```ts
jwt_secret_key : process.env.JWT_SECRET_KEY,   // signs access tokens
refresh_secret : process.env.JWT_REFRESH_SECRET // signs refresh tokens
```

Two **different** secrets are used on purpose, so a refresh token can't be used as an access token and vice versa.

---

## 4. Step 1: Login

**Route:** `POST /api/v1/auth/login` in [src/modules/auth/auth.route.ts](../src/modules/auth/auth.route.ts)

### 4.1 Service: checking credentials and creating tokens

**File:** [src/modules/auth/auth.service.ts](../src/modules/auth/auth.service.ts), function `loginUserIntoDB`

1. **Find the user by email**
   ```ts
   const user = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
   if (user.rowCount === 0) throw new Error("Invalid credentials")
   ```
2. **Compare the password with the stored hash**
   ```ts
   const matchPassword = await bcrypt.compare(password, user.rows[0].password)
   if (!matchPassword) throw new Error("Invalid credentials")
   ```
   `bcrypt.compare` hashes the typed password with the same salt and checks whether it matches.
   Both failures say *"Invalid credentials"* on purpose, so an attacker can't tell whether the email exists.
3. **Check the account is active**
   ```ts
   if (!user.rows[0].is_active) throw new Error("User Not Active")
   ```
4. **Build the payload**: only non-sensitive info.
   ```ts
   const jwtPayload = { id, name, email, role }
   ```
5. **Sign two tokens**
   ```ts
   const accessToken  = jwt.sign(jwtPayload, config.jwt_secret_key, { expiresIn: "1h" })
   const refreshToken = jwt.sign(jwtPayload, config.refresh_secret, { expiresIn: "10d" })
   ```
6. Remove the password hash and return `{ accessToken, refreshToken, user }`.

### 4.2 Controller: sending the tokens

**File:** [src/modules/auth/auth.controller.ts](../src/modules/auth/auth.controller.ts), function `loginUser`

The refresh token is put in a **cookie**:

```ts
res.cookie("refreshToken", refreshToken, {
    secure  : false,     // true = only sent over HTTPS (set true in production)
    httpOnly: true,      // JavaScript in the browser can't read it → protects against XSS
    sameSite: "lax",     // limits cross-site sending → helps against CSRF
    path    : "/",
    domain  : "localhost",
})
```

Then the result is sent in the response body using the `sendResponse` helper ([src/utils/sendResponse.ts](../src/utils/sendResponse.ts)).

**Why two tokens?**

| | Access token | Refresh token |
|---|---|---|
| Lifetime | short (1 hour) | long (10 days) |
| Sent how | `Authorization` header on every API call | cookie, only to `/auth/refresh-token` |
| If stolen | attacker has at most 1 hour | stored in an `httpOnly` cookie, so harder to steal |
| Used for | accessing protected routes | getting a new access token |

A short-lived access token limits damage if it leaks. The refresh token means the user doesn't have to log in again every hour.

---

## 5. Step 2: Protecting routes with the `auth` middleware

**File:** [src/middleware/auth.ts](../src/middleware/auth.ts)

### 5.1 Why it's a "higher-order function"

```ts
const auth = (...roles: Role[]) => {
    return async (req, res, next) => { ... }
}
```

`auth` is not the middleware itself: it's a function that **returns** a middleware. This lets us pass in which roles are allowed for each route:

```ts
auth(USER_ROLE.admin, USER_ROLE.agent)   // returns a middleware that only lets admin/agent through
```

Inside, the returned function still has access to `roles` (a *closure*).

### 5.2 What the middleware checks, in order

```ts
// 1. Is there a token?
const token = req.headers.authorization;
if (!token) return res.status(401) ... "Unauthorized Access!"

// 2. Is the token valid and not expired?
const decode = jwt.verify(token, config.jwt_secret_key) as JwtPayload;
//    → throws if the signature is wrong or the token expired

// 3. Does the user still exist?
const user = await pool.query(`SELECT * FROM users WHERE email=$1`, [decode.email])
if (user.rowCount === 0) return res.status(404) ... "User not found!!"

// 4. Is the user still active?
if (!user.rows[0].is_active) return res.status(403) ... "Forbidden access!!"

// 5. Does the user have an allowed role?
if (roles.length && !roles.includes(user.rows[0].role)) return res.status(401) ...

// 6. All good: attach the user to the request and continue
req.user = decode
next()
```

Why check the database (steps 3–4) if the token is already valid? A token stays valid until it expires, even if the admin deletes or deactivates the user in the meantime. Checking the DB makes such changes take effect immediately.

Note that step 5 uses the role **from the database**, not from the token, so a role change also applies immediately.

`roles.length &&` means: if `auth()` is called with no roles, any logged-in active user is allowed.

### 5.3 Making `req.user` type-safe

**File:** [src/middleware/index.d.ts](../src/middleware/index.d.ts)

Express's `Request` type doesn't have a `user` field, so TypeScript would complain about `req.user = decode`. This file adds it globally:

```ts
declare global {
    namespace Express {
        interface Request { user?: JwtPayload }
    }
}
```

Now any controller after `auth()` can read `req.user.id`, `req.user.role`, etc. (see `console.log("From Controller", req.user)` in `getAllUsers`).

---

## 6. Step 3: Role-based access control (RBAC)

**Roles:** [src/types/index.ts](../src/types/index.ts)

```ts
export type Role = "admin" | "agent" | "user";
export const USER_ROLE = { admin: "admin", agent: "agent", user: "user" } as const
```

`as const` makes the values literal types (`"admin"`, not just `string`), so they fit the `Role` type.

**Applying it:** [src/modules/users/user.route.ts](../src/modules/users/user.route.ts)

| Route | Middleware | Who can access |
|---|---|---|
| `GET /api/v1/users` | `auth(admin, agent)` | admin, agent |
| `GET /api/v1/users/:id` | `auth(admin, agent, user)` | any role |
| `POST /api/v1/users` | none | public (registration) |
| `PUT /api/v1/users/:id` | `auth(admin, user)` | admin, user |
| `DELETE /api/v1/users/:id` | none | public ⚠️ (see section 9) |

Express runs middleware left to right: `auth(...)` runs first, and `userController.getAllUsers` only runs if `auth` calls `next()`.

---

## 7. Step 4: Refreshing the access token

**Route:** `POST /api/v1/auth/refresh-token`

To read the cookie, `cookie-parser` is registered in [src/app.ts](../src/app.ts):

```ts
app.use(cookieParser())   // fills req.cookies
```

**Controller** (`generateToken` in [auth.controller.ts](../src/modules/auth/auth.controller.ts)):

```ts
const result = await authService.generateAccessToken(req.cookies.refreshToken)
```

**Service** (`generateAccessToken` in [auth.service.ts](../src/modules/auth/auth.service.ts)) follows the same pattern as the middleware:

1. No refresh token → `"Unauthorized access"`.
2. `jwt.verify(token, config.refresh_secret)`: note the **refresh** secret.
3. Check the user still exists and is active.
4. Sign and return a **new access token** (1h) with the same payload shape.

The client then uses that new access token in the `Authorization` header.

---

## 8. Trying it out (Postman / Thunder Client)

1. **Register:** `POST http://localhost:<PORT>/api/v1/users`
   ```json
   { "name": "Admin", "email": "admin@test.com", "password": "123456", "role": "admin" }
   ```
2. **Login:** `POST /api/v1/auth/login`
   ```json
   { "email": "admin@test.com", "password": "123456" }
   ```
   Copy `data.accessToken` from the response. Postman also stores the `refreshToken` cookie.
3. **Call a protected route:** `GET /api/v1/users`
   Header: `Authorization: <paste accessToken here>`
   (No `Bearer ` prefix: this project reads the header as-is.)
4. **Refresh:** `POST /api/v1/auth/refresh-token` (no body; the cookie is sent automatically) → new access token.

Required `.env` values:

```
PORT=5000
DATABASE_URL=postgres://...
JWT_SECRET_KEY=some-long-random-string
JWT_REFRESH_SECRET=another-different-long-random-string
```

---

## 9. Things to know and possible improvements

The code works for learning purposes. These are good next steps, and worth understanding:

1. **Anyone can register as admin.** `POST /api/v1/users` accepts `role` from the body. In a real app, only an admin should be able to set roles.
2. **`DELETE /api/v1/users/:id` has no `auth()`.** Anyone can delete any user. Add `auth(USER_ROLE.admin)`.
3. **No ownership check on `PUT /:id`.** A `user` can update *another* user's account by changing the id. Fix: in the controller, allow it only if `req.user.role === "admin"` or `req.user.id == req.params.id`.
4. **Refresh token is also in the response body.** `loginUserIntoDB` returns `refreshToken` and the controller sends the whole `result`. That cancels out the `httpOnly` cookie protection, since JavaScript can read the body. Send only `{ accessToken, user }`.
5. **Expired/invalid tokens return 500.** `jwt.verify` throws (`TokenExpiredError`, `JsonWebTokenError`), which goes to `globalErrorHandler` and becomes a 500. It should be 401. You can catch these errors in `auth.ts` or handle them by name in the global error handler.
6. **Wrong role returns 401.** 401 means "not logged in"; 403 means "logged in but not allowed". A role mismatch should be **403**.
7. **`Bearer` convention.** Most clients send `Authorization: Bearer <token>`. To support that: `const token = req.headers.authorization?.split(" ")[1]`.
8. **Cookie has no `maxAge`.** It becomes a session cookie (deleted when the browser closes) even though the token lasts 10 days. Add `maxAge: 10 * 24 * 60 * 60 * 1000`.
9. **CORS and cookies from a frontend.** For a browser app on `localhost:3000` to send/receive the cookie, CORS needs `credentials: true` and the frontend must use `credentials: "include"` (fetch) or `withCredentials: true` (axios).
10. **No logout.** Add a `POST /auth/logout` that calls `res.clearCookie("refreshToken", { path: "/", domain: "localhost" })`.
11. **Remove `console.log(req)`** in `auth.ts`: it prints the entire request (including the token) on every call.
12. **`secure: false`** is fine for local HTTP, but must be `true` in production (HTTPS).

---

## 10. Quick summary

| Concept | Where | One-line idea |
|---|---|---|
| Password hashing | `user.service.ts` | `bcrypt.hash` on save, `bcrypt.compare` on login |
| Login | `auth.service.ts` → `loginUserIntoDB` | verify credentials, sign access + refresh tokens |
| Refresh cookie | `auth.controller.ts` → `loginUser` | `httpOnly` cookie holds the long-lived token |
| Protect a route | `middleware/auth.ts` | verify token → user exists → active → role allowed |
| Role list | `types/index.ts` | `admin`, `agent`, `user` |
| Typed `req.user` | `middleware/index.d.ts` | extends Express `Request` |
| New access token | `auth.service.ts` → `generateAccessToken` | verify refresh token, issue a fresh 1h token |
