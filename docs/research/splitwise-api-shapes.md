# Splitwise API Request/Response Shapes Research

**Research Date:** 2026-10-03  
**Primary Sources:**
- Local OpenAPI spec: `openapi-splitwise-api.json`
- Official documentation: https://dev.splitwise.com

## Executive Summary

Splitwise API v3.0 supports two expense creation modes:
1. **Equal group split** (`split_equally=true` + `group_id`) - simplified, equal splits
2. **By shares** (explicit `users__N__*` parameters) - custom shares, exclusions, partial payments

**Critical gotcha:** The API returns `200 OK` even on failure. You MUST check the `errors` field in responses.

---

## Authentication

### API Key (Bearer Token)

**Source:** OpenAPI spec lines 1718-1723

```
Authorization: Bearer YOUR_API_KEY
```

- Personal API keys generated from app details page at https://secure.splitwise.com/apps
- Key acts as an access token for your personal account
- Keep as secure as a password
- Can regenerate/invalidate keys on the app details page

**Alternative:** OAuth 2.0 authorization code flow (for third-party apps)

### Rate Limits

**Source:** https://dev.splitwise.com Terms of Use, line 60, 80

- "Conservative rate and access limits" exist
- Specific limits not documented publicly
- Usage must not "exceed rate limits or constitute excessive or abusive usage"
- Limits "subject to change at any time"
- API not intended for commercial use
- May require active Splitwise Pro subscription

---

## 1. Create Expense: `POST /create_expense`

**Source:** OpenAPI spec lines 1186-1265

### Request Shape: Two Modes

#### Mode A: Equal Group Split

**Source:** OpenAPI spec lines 2488-2517 (schema `equal_group_split`)

```json
{
  "group_id": 321,
  "split_equally": true,
  "cost": "25.00",
  "description": "Grocery run",
  "currency_code": "USD",
  "date": "2012-05-02T13:00:00Z",
  "details": "Notes about the expense",
  "category_id": 15,
  "repeat_interval": "never"
}
```

**Required fields:**
- `group_id` (integer)
- `split_equally` (boolean, must be `true`)
- `description` (string)
- `cost` (string)

**Behavior:**
- Splits expense equally among all group members
- Authenticated user is assumed to be the payer
- **Does NOT support exclusions or custom shares**

#### Mode B: By Shares (Custom Splits, Exclusions, Partial Payments)

**Source:** OpenAPI spec lines 2518-2580 (schema `by_shares`)

```json
{
  "group_id": 321,
  "cost": "25.00",
  "description": "Grocery run",
  "currency_code": "USD",
  "date": "2012-05-02T13:00:00Z",
  "users__0__user_id": 54123,
  "users__0__paid_share": "25.00",
  "users__0__owed_share": "13.55",
  "users__1__first_name": "Neu",
  "users__1__last_name": "Yewzer",
  "users__1__email": "neuyewxyz@example.com",
  "users__1__paid_share": "0.00",
  "users__1__owed_share": "11.45"
}
```

**Required fields:**
- `group_id` (integer, or `0` for expense outside a group)
- `description` (string)
- `cost` (string)
- For each participant:
  - Either: `users__N__user_id` (integer)
  - Or: `users__N__email` + `users__N__first_name` + `users__N__last_name`
  - Plus: `users__N__paid_share` (string) and `users__N__owed_share` (string)

**Identifying Users:**
- **By user_id:** Use if you have Splitwise user ID
- **By email/name:** Use for inviting new users or users not yet in your friend list

**Key Points:**
- Flattened parameter format: `users__{index}__{property}`
- Index is zero-based: `users__0__*`, `users__1__*`, etc.
- **Exclusions:** Simply omit users you want to exclude (don't add them to users list)
- **Custom shares:** Set different `owed_share` values for each user
- **Partial payments:** Any user can have `paid_share` > 0

**Common fields (both modes):**

**Source:** OpenAPI spec lines 2128-2173 (schema `common`)

- `cost` (string, required) - decimal with max 2 decimal places (e.g., "25", "25.00")
- `description` (string, required) - short description
- `details` (string, nullable) - longer notes
- `date` (ISO 8601 datetime, e.g., "2012-05-02T13:00:00Z")
- `currency_code` (string, e.g., "USD") - must be from `get_currencies`
- `category_id` (integer) - must be subcategory from `get_categories`
- `repeat_interval` (enum: "never", "weekly", "fortnightly", "monthly", "yearly")

### Response Shape

**Source:** OpenAPI spec lines 1213-1232, 1240-1259

#### Success (200 OK with empty errors)

```json
{
  "expenses": [
    {
      "id": 51023,
      "group_id": 391,
      "friendship_id": null,
      "description": "Brunch",
      "details": null,
      "cost": "25.00",
      "currency_code": "USD",
      "date": "2012-05-02T13:00:00Z",
      "created_at": "2012-05-02T13:00:00Z",
      "updated_at": "2012-05-02T13:00:00Z",
      "deleted_at": null,
      "category": {
        "id": 5,
        "name": "Electricity"
      },
      "users": [
        {
          "user": {
            "id": 491923,
            "first_name": "Jane",
            "last_name": "Doe",
            "picture": {
              "medium": "image_url"
            }
          },
          "user_id": 491923,
          "paid_share": "8.99",
          "owed_share": "4.50",
          "net_balance": "4.49"
        }
      ]
    }
  ],
  "errors": {}
}
```

#### Failure (200 OK with errors object)

```json
{
  "expenses": [],
  "errors": {
    "base": ["Error message here"]
  }
}
```

**CRITICAL:** The API returns `200 OK` for both success and validation failures. You MUST check:
- Response has `errors` field that is empty (`{}`) for success
- Response has `errors.base` array with messages for failures

#### Validation Errors (400 Bad Request)

```json
{
  "errors": {
    "base": [
      "Unrecognized parameter `bad_parameter`"
    ]
  }
}
```

### Rounding Rules

**Source:** OpenAPI spec lines 2131-2135, 2534-2543

- All amounts are strings with max 2 decimal places
- Examples show both "25" and "25.00" formats
- `paid_share` and `owed_share` use decimal strings: "13.55", "11.45"
- No explicit rounding rules documented - assume standard decimal rounding

### Creating Equal Splits with Exclusions

**To exclude members from an equal split:**

1. Use Mode B ("by shares")
2. Calculate equal shares manually
3. Include only the participating users in `users__N__*` parameters
4. Set `paid_share` for payer(s), "0.00" for others
5. Set equal `owed_share` for all included users

**Example: $30 split equally among 3 of 5 group members:**

```json
{
  "group_id": 321,
  "cost": "30.00",
  "description": "Pizza for 3",
  "users__0__user_id": 100,
  "users__0__paid_share": "30.00",
  "users__0__owed_share": "10.00",
  "users__1__user_id": 101,
  "users__1__paid_share": "0.00",
  "users__1__owed_share": "10.00",
  "users__2__user_id": 102,
  "users__2__paid_share": "0.00",
  "users__2__owed_share": "10.00"
}
```

---

## 2. Update Expense: `POST /update_expense/{id}`

**Source:** OpenAPI spec lines 1267-1324

### Request Shape

```json
{
  "description": "Updated description",
  "cost": "30.00",
  "users__0__user_id": 54123,
  "users__0__paid_share": "30.00",
  "users__0__owed_share": "15.00",
  "users__1__user_id": 54124,
  "users__1__paid_share": "0.00",
  "users__1__owed_share": "15.00"
}
```

**Parameters:**
- Same as `create_expense` (by_shares mode)
- Only include fields you want to change
- **CRITICAL:** If ANY `users__N__*` parameter is provided, ALL shares are overwritten
  - You must provide complete share list, not partial updates
  - Omitting a user removes them from the expense

**Source:** OpenAPI spec line 1272
> "If any value is supplied for `users__{index}__{property}`, _all_ shares for the expense will be overwritten with the provided values."

### Response Shape

**Source:** OpenAPI spec lines 1296-1313

Same as `create_expense`:
```json
{
  "expenses": [{ /* updated expense */ }],
  "errors": {}
}
```

**Same 200 OK gotcha:** Always check `errors` field.

---

## 3. Get Group: `GET /get_group/{id}`

**Source:** OpenAPI spec lines 228-270

### Request

```
GET /get_group/321
```

### Response Shape

**Source:** OpenAPI spec lines 249-255, 1948-2073 (schema `group`)

```json
{
  "group": {
    "id": 321,
    "name": "Housemates 2020",
    "group_type": "home",
    "updated_at": "2020-01-15T10:30:00Z",
    "simplify_by_default": true,
    "members": [
      {
        "id": 18523,
        "first_name": "Ada",
        "last_name": "Lovelace",
        "email": "ada@example.com",
        "registration_status": "confirmed",
        "picture": {
          "small": "url",
          "medium": "url",
          "large": "url"
        },
        "balance": [
          {
            "currency_code": "USD",
            "amount": "-5.02"
          }
        ]
      }
    ],
    "original_debts": [
      {
        "from": 18523,
        "to": 90261,
        "amount": "414.5",
        "currency_code": "USD"
      }
    ],
    "simplified_debts": [
      {
        "from": 18523,
        "to": 90261,
        "amount": "414.5",
        "currency_code": "USD"
      }
    ]
  }
}
```

### Member Fields for Participant Mapping

**Source:** OpenAPI spec lines 1790-1836 (schema `user`)

Each member has:
- `id` (integer) - Splitwise user ID
- `first_name` (string)
- `last_name` (string, nullable)
- `email` (string) - **YES, emails are included**
- `registration_status` (enum: "confirmed", "dummy", "invited")
- `picture` (object with small/medium/large URLs)
- `balance` (array of {currency_code, amount} objects)

**Per-Member Balance:**
- `balance` array shows what this member owes/is owed in each currency
- Negative amount (e.g., "-5.02") = member owes money
- Positive amount (e.g., "10.00") = member is owed money

### Debts Arrays

**Source:** OpenAPI spec lines 1925-1946 (schema `debt`), lines 2010-2020

- `original_debts`: All pairwise debts before simplification
- `simplified_debts`: Minimized debts after Splitwise's debt simplification
- Each debt: `{from: user_id, to: user_id, amount: string, currency_code: string}`

---

## 4. Balance Readback

### Option A: Get Group (Per-Member Balances)

**Best for:** "What does each member owe in this group?"

**Source:** Lines 1989-2004

Use `GET /get_group/{id}` and read `members[i].balance`:

```javascript
const group = await get_group(groupId);
group.members.forEach(member => {
  member.balance.forEach(bal => {
    console.log(`${member.first_name}: ${bal.amount} ${bal.currency_code}`);
  });
});
```

### Option B: Get Group (Simplified Debts)

**Best for:** "Who needs to pay whom?"

**Source:** Lines 2016-2020

Use `GET /get_group/{id}` and read `simplified_debts`:

```javascript
const group = await get_group(groupId);
group.simplified_debts.forEach(debt => {
  console.log(`User ${debt.from} pays ${debt.amount} ${debt.currency_code} to user ${debt.to}`);
});
```

### Option C: Get Friend (Cross-Group Balance)

**Best for:** "What do I owe this friend across all groups?"

**Source:** Lines 708-727, 2088-2126 (schema `friend`)

```
GET /get_friend/{user_id}
```

Response includes:
```json
{
  "friend": {
    "id": 491923,
    "first_name": "Jane",
    "email": "jane@example.com",
    "balance": [
      {
        "currency_code": "USD",
        "amount": "25.50"
      }
    ],
    "groups": [
      {
        "group_id": 571,
        "balance": [
          {
            "currency_code": "USD",
            "amount": "10.00"
          }
        ]
      }
    ]
  }
}
```

- `balance`: Total balance with this friend across all contexts
- `groups[i].balance`: Per-group balance with this friend

### Recommended Approach for iMessage MVP

**Use `GET /get_group/{id}` for all balance needs:**

1. **Participant mapping:** `members` array has `email` field
   - Match iMessage handles (emails/phones) to `members[i].email`
   - Store `members[i].id` for creating expenses by user_id

2. **Individual balances:** `members[i].balance` array
   - Show each member's net position in the group

3. **Payment instructions:** `simplified_debts` array
   - "Alice pays Bob $25.50"

---

## Data Type Gotchas

### Amounts as Strings

**Source:** Lines 2131-2135, 2082-2085

All monetary amounts are **strings**, not numbers:
- `cost`: `"25"` or `"25.00"`
- `paid_share`, `owed_share`: `"13.55"`
- `amount` in balances/debts: `"414.5"`

**Why:** Avoids floating-point precision issues

**Implication:** Parse as Decimal/BigDecimal in your code, not float/double

### Dates as ISO 8601 Strings

**Source:** Lines 2146-2151

- Format: `"2012-05-02T13:00:00Z"`
- Include timezone (Z for UTC or offset like +00:00)
- Defaults to current time if omitted

### Currency Codes

**Source:** Lines 998-1004, 2162-2165

- Must use codes from `GET /get_currencies`
- Mostly ISO 4217 (e.g., "USD", "EUR")
- Some unofficial codes (e.g., "BTC" for Bitcoin)
- Required when creating expenses

---

## Error Handling Patterns

### 1. Check 200 OK Responses for errors Field

```javascript
const response = await createExpense(data);
if (response.errors && Object.keys(response.errors).length > 0) {
  // Handle error
  console.error(response.errors.base);
} else {
  // Success
  const expense = response.expenses[0];
}
```

### 2. Common Validation Errors

**Source:** Lines 1240-1259 (400 Bad Request)

- "Unrecognized parameter `bad_parameter`"
- Invalid currency code
- Missing required fields
- Invalid category_id
- Sum of shares doesn't match cost

### 3. Permission Errors

**401 Unauthorized:**
- Invalid API key
- Expired OAuth token

**403 Forbidden:**
- User doesn't have permission for this group
- Can't modify another user's expense

**404 Not Found:**
- Group/expense doesn't exist
- User doesn't have access

---

## Summary: MVP Implementation Guide

### Creating Expenses

**Equal split (all members):**
```json
POST /create_expense
{
  "group_id": 321,
  "split_equally": true,
  "cost": "25.00",
  "description": "Dinner"
}
```

**Equal split with exclusions:**
```json
POST /create_expense
{
  "group_id": 321,
  "cost": "30.00",
  "description": "Pizza",
  "users__0__user_id": 100,
  "users__0__paid_share": "30.00",
  "users__0__owed_share": "10.00",
  "users__1__user_id": 101,
  "users__1__paid_share": "0.00",
  "users__1__owed_share": "10.00",
  "users__2__user_id": 102,
  "users__2__paid_share": "0.00",
  "users__2__owed_share": "10.00"
}
```

**Custom shares:**
```json
POST /create_expense
{
  "group_id": 321,
  "cost": "100.00",
  "description": "Road trip gas",
  "users__0__user_id": 100,
  "users__0__paid_share": "100.00",
  "users__0__owed_share": "50.00",
  "users__1__user_id": 101,
  "users__1__paid_share": "0.00",
  "users__1__owed_share": "30.00",
  "users__2__user_id": 102,
  "users__2__paid_share": "0.00",
  "users__2__owed_share": "20.00"
}
```

### Updating Expenses

**Change description only:**
```json
POST /update_expense/51023
{
  "description": "Updated description"
}
```

**Change shares (must include all users):**
```json
POST /update_expense/51023
{
  "users__0__user_id": 100,
  "users__0__paid_share": "30.00",
  "users__0__owed_share": "15.00",
  "users__1__user_id": 101,
  "users__1__paid_share": "0.00",
  "users__1__owed_share": "15.00"
}
```

### Reading Balances

**Get all group info (members, balances, debts):**
```
GET /get_group/321
```

**Map iMessage handles to Splitwise users:**
```javascript
const group = await get_group(321);
const handleMap = {};
group.members.forEach(m => {
  handleMap[m.email.toLowerCase()] = m.id;
});
```

**Show balances:**
```javascript
group.members.forEach(m => {
  const balance = m.balance[0]; // assuming single currency
  console.log(`${m.first_name}: ${balance.amount} ${balance.currency_code}`);
});
```

### Response Validation

**Always check errors:**
```javascript
if (response.errors && Object.keys(response.errors).length > 0) {
  throw new Error(response.errors.base.join(", "));
}
```

---

## Additional Notes

- Phone numbers are NOT exposed in the API (only email)
- You may need to ask users to map iMessage phone numbers to Splitwise accounts manually
- Consider caching group member lists to minimize API calls
- Personal API key acts on behalf of authenticated user (they become the creator of all expenses)
- No documented rate limits - implement exponential backoff for safety
