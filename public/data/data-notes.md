# data-notes.md

This file describes `orders.json`. Read it fully before you start. Do not edit `orders.json`. All fixes must happen in your code.

## The file

- A JSON array of about 50,000 order records, about 17 MB.
- One record per line, so you can open it in an editor and search it.
- The data was exported from an old system over several years. The format changed along the way, so records are not all the same shape.
- Every record has a `schemaVersion` of `1` (older) or `2` (newer).

## Fields

- `id` (string): Order ID, like `ORD-0001234`.
- `schemaVersion` (number): `1` or `2`.
- `customerName` (string): Customer name. Only in version 2 records.
- `customer_name` (string): Customer name. Only in version 1 records. Same meaning as `customerName`.
- `customerEmail` (string): Customer email.
- `status` (string): One of `pending`, `processing`, `shipped`, `delivered`, `cancelled`.
- `amount` (number or string): Order total. See the rules below for the unit.
- `currency` (string): Always `INR`.
- `createdAt` (string or number): When the order was placed. Comes in several formats. See the rules below.
- `updatedAt` (string, null, or missing): When the order was last changed.
- `region` (string): One of `NORTH`, `SOUTH`, `EAST`, `WEST`, `CENTRAL`, `NORTHEAST`.
- `channel` (string): One of `web`, `app`, `phone`, `store`.
- `priority` (number or missing): `1` is highest, `3` is lowest.
- `paymentMethod` (string): One of `upi`, `card`, `netbanking`, `cod`, `wallet`.
- `itemCount` (number): Number of items in the order.
- `notes` (string, null, or empty): Free text written by staff.

## Known problems in the data, and what to do with each

1. **Two names for the same field.** Version 1 records use `customer_name`. Version 2 records use `customerName`. Treat them as the same field. Show one "Customer" column.

2. **Amount unit depends on the version.** Version 1 records store `amount` in paise (1 rupee = 100 paise). Version 2 records store `amount` in rupees. Convert everything to rupees before showing, sorting, or filtering. Show amounts in Indian format, for example `₹1,23,456.50`.

3. **Amount is sometimes a string.** A few records have `amount` as a string like `"4599.5"`. Treat it as a number.

4. **Dates come in four formats.** Read all four correctly. Show every date in the grid in one single format of your choice. Sorting and date filters must work on the real time, not on the text. `createdAt` can be:
   - ISO with timezone: `"2025-03-14T09:30:00.000Z"`
   - ISO without timezone: `"2025-03-14T09:30:00"` (treat as UTC)
   - Epoch seconds as a number: `1741944600`
   - Day/month/year string: `"14/03/2025"` (no time; treat as midnight UTC)

5. **`updatedAt` is sometimes `null` and sometimes missing.** Treat both the same way. Show an empty value, for example a dash. When sorting by this column, these rows go last.

6. **Status and region have inconsistent casing.** You may see `Shipped`, `SHIPPED`, and `shipped`, or `south` and `SOUTH`. Treat them as the same value. Show them in one consistent style. A filter on status must have exactly five options, not fifteen.

7. **Some IDs appear twice.** About 30 order IDs are present in two records. The grid should show each ID once. Keep only one of each pair:
   - If both records have an `updatedAt`, keep the one with the later `updatedAt`.
   - If only one has an `updatedAt`, keep that one.
   - If neither has one, keep the one that appears later in the file.

8. **Priority is sometimes missing.** Show it as `None`. The priority filter must let the user pick `None` as an option.

9. **Notes can be long or contain HTML-like text.** Some notes are over 1,000 characters. A few contain text like `<b>URGENT</b>` or `<script>`. Never render notes as HTML. Show them as plain text. In the grid, cut long notes short and let the user see the full text some other way.

10. **Currency may have a trailing space.** A few records have `"INR "` instead of `"INR"`. Trim it.

Handle all of these in one place in your code, before the data reaches the grid or the filter. Do not fix them inside the code that draws each cell.
