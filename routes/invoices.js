// const { v4: uuidv4 } = require("uuid");

// const express = require("express");
// const { body, validationResult, query } = require("express-validator");
// const { pool } = require("../config/database");
// const { authenticateToken } = require("../middleware/auth");
// const { generateInvoiceNumber } = require("../utils/helpers");

// const router = express.Router();

// // Helper: convert undefined to null for MySQL compatibility
// const sanitizeParams = (...params) => {
//   return params.map((param) => (param === undefined ? null : param));
// };

// // Helper: normalize Date/ISO string to MySQL DATE (YYYY-MM-DD)
// const toSqlDate = (value) => {
//   if (!value) return null;
//   const d = value instanceof Date ? value : new Date(value);
//   if (Number.isNaN(d.getTime())) return null;
//   const y = d.getFullYear();
//   const m = String(d.getMonth() + 1).padStart(2, "0");
//   const day = String(d.getDate()).padStart(2, "0");
//   return `${y}-${m}-${day}`;
// };

// // Helpers
// const handleValidation = (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     res.status(400).json({
//       error: "Validation failed",
//       details: errors.array(),
//     });
//     return true;
//   }
//   return false;
// };

// const invoiceFieldMap = {
//   customerId: "customer_id",
//   amount: "amount",
//   tax: "tax",
//   total: "total",
//   status: "status",
//   dueDate: "due_date",
//   paidDate: "paid_date",
//   notes: "notes",
// };

// // Build invoice values from customer + request body
// // Assumes customers table has optional fields like default_tax_rate, default_due_days, default_invoice_notes, etc.
// const buildInvoiceFromCustomer = (customer, body) => {
//   const { amount, tax, total, status, dueDate, notes, items } = body;

//   // If amount/total not provided, derive from items
//   let derivedAmount = amount;
//   if (derivedAmount === undefined && Array.isArray(items)) {
//     derivedAmount = items.reduce(
//       (sum, item) => sum + Number(item.amount || 0),
//       0
//     );
//   }

//   const defaultTaxRate = customer.default_tax_rate ?? 0;
//   const finalAmount = Number(derivedAmount || 0);

//   // If caller already supplied `tax`, treat as numeric final value
//   const finalTax =
//     tax !== undefined ? Number(tax) : Math.round(finalAmount * (defaultTaxRate / 100));

//   const finalTotal =
//     total !== undefined ? Number(total) : finalAmount + finalTax;

//   // Due date: use body.dueDate if provided, else today + customer.default_due_days (fallback 7)
//   let finalDueDate;
//   if (dueDate) {
//     finalDueDate = toSqlDate(dueDate);
//   } else {
//     const dueDays = customer.default_due_days ?? 7;
//     const d = new Date();
//     d.setDate(d.getDate() + Number(dueDays));
//     finalDueDate = toSqlDate(d);
//   }

//   const finalStatus = status || "draft";
//   const finalNotes = notes ?? customer.default_invoice_notes ?? null;

//   return {
//     amount: finalAmount,
//     tax: finalTax,
//     total: finalTotal,
//     status: finalStatus,
//     dueDate: finalDueDate,
//     notes: finalNotes,
//   };
// };

// // helper: ensure current user can access invoice (via customer.assigned_to)
// const ensureCanAccessInvoice = async (req, res, invoiceId) => {
//   if (req.user.role === "admin") return { ok: true };

//   const [rows] = await pool.execute(
//     `
//     SELECT i.id
//     FROM invoices i
//     INNER JOIN customers c ON i.customer_id = c.id
//     WHERE i.id = ? AND c.assigned_to = ?
//   `,
//     sanitizeParams(invoiceId, req.user.userId)
//   );

//   if (rows.length === 0) {
//     return {
//       ok: false,
//       response: res
//         .status(403)
//         .json({ error: "You do not have permission to access this invoice" }),
//     };
//   }

//   return { ok: true };
// };

// // Get all invoices with filtering and pagination
// router.get(
//   "/",
//   authenticateToken,
//   [
//     query("page")
//       .optional()
//       .isInt({ min: 1 })
//       .withMessage("Page must be a positive integer"),
//     query("limit")
//       .optional()
//       .isInt({ min: 1, max: 100 })
//       .withMessage("Limit must be between 1 and 100"),
//     query("search").optional().isString().withMessage("Search must be a string"),
//     query("status")
//       .optional()
//       .isIn(["draft", "sent", "paid", "overdue", "cancelled"])
//       .withMessage("Invalid status"),
//     query("customerId").optional().isString().withMessage("Customer ID must be a string"),
//     query("dueDateFrom")
//       .optional()
//       .isISO8601()
//       .withMessage("Due date from must be a valid date"),
//     query("dueDateTo")
//       .optional()
//       .isISO8601()
//       .withMessage("Due date to must be a valid date"),
//   ],
//   async (req, res) => {
//     try {
//       if (handleValidation(req, res)) return;

//       const pageRaw = Number.parseInt(req.query.page, 10);
//       const limitRaw = Number.parseInt(req.query.limit, 10);

//       const page = !Number.isNaN(pageRaw) && pageRaw > 0 ? pageRaw : 1;
//       const limit =
//         !Number.isNaN(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 10;
//       const offset = (page - 1) * limit;

//       if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
//         return res.status(400).json({ error: "Invalid pagination parameters" });
//       }

//       const { search, status, customerId, dueDateFrom, dueDateTo } = req.query;

//       let whereClause = "WHERE 1=1";
//       const queryParams = [];

//       if (req.user.role !== "admin") {
//         whereClause += " AND c.assigned_to = ?";
//         queryParams.push(req.user.userId);
//       }

//       if (search) {
//         whereClause +=
//           " AND (i.invoice_number LIKE ? OR c.name LIKE ? OR c.company LIKE ?)";
//         const searchTerm = `%${search}%`;
//         queryParams.push(searchTerm, searchTerm, searchTerm);
//       }

//       if (status) {
//         whereClause += " AND i.status = ?";
//         queryParams.push(status);
//       }

//       if (customerId) {
//         whereClause += " AND i.customer_id = ?";
//         queryParams.push(customerId);
//       }

//       if (dueDateFrom) {
//         whereClause += " AND i.due_date >= ?";
//         queryParams.push(dueDateFrom);
//       }

//       if (dueDateTo) {
//         whereClause += " AND i.due_date <= ?";
//         queryParams.push(dueDateTo);
//       }

//       // FIX: interpolate LIMIT/OFFSET as integers instead of placeholders
//       const invoicesSql = `
//         SELECT 
//           i.*,
//           c.name AS customer_name,
//           c.company AS customer_company,
//           c.email AS customer_email
//         FROM invoices i
//         LEFT JOIN customers c ON i.customer_id = c.id
//         ${whereClause}
//         ORDER BY i.created_at DESC
//         LIMIT ${Number(limit)} OFFSET ${Number(offset)}
//       `;

//       const [invoices] = await pool.execute(invoicesSql, queryParams);

//       const countSql = `
//         SELECT COUNT(*) AS total 
//         FROM invoices i
//         LEFT JOIN customers c ON i.customer_id = c.id
//         ${whereClause}
//       `;
//       const [countResult] = await pool.execute(countSql, queryParams);

//       const total = countResult[0]?.total || 0;
//       const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

//       res.json({
//         invoices,
//         pagination: {
//           page,
//           limit,
//           total,
//           totalPages,
//           hasNext: page < totalPages,
//           hasPrev: page > 1,
//         },
//       });
//     } catch (error) {
//       console.error("Invoices fetch error:", error);
//       res.status(500).json({ error: "Failed to fetch invoices" });
//     }
//   }
// );

// // Get invoice by ID with items
// router.get("/:id", authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params;

//     const access = await ensureCanAccessInvoice(req, res, id);
//     if (!access.ok) return;

//     const [invoices] = await pool.execute(
//       `
//       SELECT 
//         i.*,
//         c.name AS customer_name,
//         c.company AS customer_company,
//         c.email AS customer_email,
//         c.phone AS customer_phone,
//         c.address AS customer_address,
//         c.city AS customer_city,
//         c.state AS customer_state,
//         c.zip_code AS customer_zip_code,
//         c.country AS customer_country
//       FROM invoices i
//       LEFT JOIN customers c ON i.customer_id = c.id
//       WHERE i.id = ?
//     `,
//       [id]
//     );

//     if (invoices.length === 0) {
//       return res.status(404).json({ error: "Invoice not found" });
//     }

//     const [items] = await pool.execute(
//       "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at",
//       [id]
//     );

//     const invoice = invoices[0];
//     invoice.items = items;

//     res.json({ invoice });
//   } catch (error) {
//     console.error("Invoice fetch error:", error);
//     res.status(500).json({ error: "Failed to fetch invoice" });
//   }
// });

// // Create new invoice
// router.post(
//   "/",
//   authenticateToken,
//   [
//     body("customerId").notEmpty().withMessage("Customer ID is required"),
//     body("amount").optional().isNumeric().withMessage("Amount must be numeric"),
//     body("tax").optional().isNumeric().withMessage("Tax must be numeric"),
//     body("total").optional().isNumeric().withMessage("Total must be numeric"),
//     body("status")
//       .optional()
//       .isIn(["draft", "sent", "paid", "overdue", "cancelled"])
//       .withMessage("Invalid status"),
//     body("dueDate")
//       .optional()
//       .isISO8601()
//       .withMessage("Due date must be a valid date"),
//     body("items")
//       .isArray({ min: 1 })
//       .withMessage("Items array is required with at least one item"),
//     body("items.*.description")
//       .notEmpty()
//       .withMessage("Item description is required"),
//     body("items.*.quantity")
//       .isInt({ min: 1 })
//       .withMessage("Item quantity must be a positive integer"),
//     body("items.*.rate").isNumeric().withMessage("Item rate must be numeric"),
//     body("items.*.amount")
//       .isNumeric()
//       .withMessage("Item amount must be numeric"),
//     body("notes").optional().isString().withMessage("Notes must be a string"),
//   ],
//   async (req, res) => {
//     try {
//       if (handleValidation(req, res)) return;

//       const { customerId, items } = req.body;

//       // Load customer with defaults used for invoice generation
//       const [customers] = await pool.execute(
//         `
//         SELECT 
//           id,
//           assigned_to,
//           default_tax_rate,
//           default_due_days,
//           default_invoice_notes
//         FROM customers
//         WHERE id = ?
//       `,
//         [customerId]
//       );

//       if (customers.length === 0) {
//         return res.status(400).json({ error: "Customer not found" });
//       }

//       const customer = customers[0];

//       if (
//         req.user.role !== "admin" &&
//         customer.assigned_to !== req.user.userId
//       ) {
//         return res
//           .status(403)
//           .json({ error: "You do not have permission to invoice this customer" });
//       }

//       // Merge body with customer defaults (also normalizes dueDate to DATE)
//       const built = buildInvoiceFromCustomer(customer, req.body);

//       const invoiceNumber = generateInvoiceNumber();
//       const invoiceId = uuidv4();

//       const connection = await pool.getConnection();
//       await connection.beginTransaction();

//       try {
//         await connection.execute(
//           `
//           INSERT INTO invoices (
//             id, customer_id, invoice_number, amount, tax, total, status, due_date, notes
//           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//         `,
//           sanitizeParams(
//             invoiceId,
//             customerId,
//             invoiceNumber,
//             built.amount,
//             built.tax,
//             built.total,
//             built.status,
//             built.dueDate, // already YYYY-MM-DD
//             built.notes
//           )
//         );

//         for (const item of items) {
//           const itemId = uuidv4(); // use this if invoice_items.id is NOT auto_increment
//           await connection.execute(
//             `
//             INSERT INTO invoice_items (id, invoice_id, description, quantity, rate, amount)
//             VALUES (?, ?, ?, ?, ?, ?)
//           `,
//             sanitizeParams(
//               itemId,
//               invoiceId,
//               item.description,
//               item.quantity,
//               item.rate,
//               item.amount
//             )
//           );
//         }

//         await connection.commit();

//         const [createdInvoices] = await connection.execute(
//           `
//           SELECT 
//             i.*,
//             c.name AS customer_name,
//             c.company AS customer_company,
//             c.email AS customer_email
//           FROM invoices i
//           LEFT JOIN customers c ON i.customer_id = c.id
//           WHERE i.id = ?
//         `,
//           [invoiceId]
//         );

//         const [invoiceItems] = await connection.execute(
//           "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at",
//           [invoiceId]
//         );

//         const invoice = createdInvoices[0];
//         invoice.items = invoiceItems;

//         res.status(201).json({
//           message: "Invoice created successfully",
//           invoice,
//         });
//       } catch (err) {
//         await connection.rollback();
//         throw err;
//       } finally {
//         connection.release();
//       }
//     } catch (error) {
//       console.error("Invoice creation error:", error);
//       res.status(500).json({ error: "Failed to create invoice" });
//     }
//   }
// );

// // Update invoice
// router.put(
//   "/:id",
//   authenticateToken,
//   [
//     body("customerId").optional().notEmpty().withMessage("Customer ID cannot be empty"),
//     body("amount").optional().isNumeric().withMessage("Amount must be numeric"),
//     body("tax").optional().isNumeric().withMessage("Tax must be numeric"),
//     body("total").optional().isNumeric().withMessage("Total must be numeric"),
//     body("status")
//       .optional()
//       .isIn(["draft", "sent", "paid", "overdue", "cancelled"])
//       .withMessage("Invalid status"),
//     body("dueDate")
//       .optional()
//       .isISO8601()
//       .withMessage("Due date must be a valid date"),
//     body("paidDate")
//       .optional()
//       .isISO8601()
//       .withMessage("Paid date must be a valid date"),
//     body("items").optional().isArray().withMessage("Items must be an array"),
//     body("items.*.description")
//       .optional()
//       .notEmpty()
//       .withMessage("Item description cannot be empty"),
//     body("items.*.quantity")
//       .optional()
//       .isInt({ min: 1 })
//       .withMessage("Item quantity must be a positive integer"),
//     body("items.*.rate")
//       .optional()
//       .isNumeric()
//       .withMessage("Item rate must be numeric"),
//     body("items.*.amount")
//       .optional()
//       .isNumeric()
//       .withMessage("Item amount must be numeric"),
//     body("notes").optional().isString().withMessage("Notes must be a string"),
//   ],
//   async (req, res) => {
//     try {
//       if (handleValidation(req, res)) return;

//       const { id } = req.params;
//       const updateData = { ...req.body };

//       const access = await ensureCanAccessInvoice(req, res, id);
//       if (!access.ok) return;

//       const [existingInvoices] = await pool.execute(
//         "SELECT id, status, customer_id FROM invoices WHERE id = ?",
//         [id]
//       );

//       if (existingInvoices.length === 0) {
//         return res.status(404).json({ error: "Invoice not found" });
//       }

//       if (updateData.customerId) {
//         const [customers] = await pool.execute(
//           "SELECT id, assigned_to FROM customers WHERE id = ?",
//           [updateData.customerId]
//         );

//         if (customers.length === 0) {
//           return res.status(400).json({ error: "Customer not found" });
//         }

//         if (
//           req.user.role !== "admin" &&
//           customers[0].assigned_to !== req.user.userId
//         ) {
//           return res.status(403).json({
//             error: "You do not have permission to set this customer on invoice",
//           });
//         }
//       }

//       // normalize date fields before building query
//       if (updateData.dueDate) {
//         updateData.dueDate = toSqlDate(updateData.dueDate);
//       }
//       if (updateData.paidDate) {
//         updateData.paidDate = toSqlDate(updateData.paidDate);
//       }

//       const connection = await pool.getConnection();
//       await connection.beginTransaction();

//       try {
//         const updateFields = [];
//         const updateValues = [];

//         Object.entries(updateData).forEach(([key, value]) => {
//           if (key === "items" || value === undefined) return;
//           const dbField = invoiceFieldMap[key];
//           if (!dbField) return;

//           updateFields.push(`${dbField} = ?`);
//           updateValues.push(value);
//         });

//         const currentInvoice = existingInvoices[0];
//         if (
//           updateData.status === "paid" &&
//           currentInvoice.status !== "paid" &&
//           !updateData.paidDate
//         ) {
//           updateFields.push("paid_date = CURRENT_DATE");
//         }

//         if (updateFields.length > 0) {
//           updateValues.push(id);
//           await connection.execute(
//             `UPDATE invoices SET ${updateFields.join(
//               ", "
//             )}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
//             sanitizeParams(...updateValues)
//           );
//         }

//         if (Array.isArray(updateData.items)) {
//           await connection.execute(
//             "DELETE FROM invoice_items WHERE invoice_id = ?",
//             [id]
//           );

//           for (const item of updateData.items) {
//             const itemId = uuidv4(); // again, only needed if invoice_items.id is not AUTO_INCREMENT
//             await connection.execute(
//               `
//               INSERT INTO invoice_items (id, invoice_id, description, quantity, rate, amount)
//               VALUES (?, ?, ?, ?, ?, ?)
//             `,
//               sanitizeParams(
//                 itemId,
//                 id,
//                 item.description,
//                 item.quantity,
//                 item.rate,
//                 item.amount
//               )
//             );
//           }
//         }

//         await connection.commit();

//         const [invoices] = await connection.execute(
//           `
//           SELECT 
//             i.*,
//             c.name AS customer_name,
//             c.company AS customer_company,
//             c.email AS customer_email
//           FROM invoices i
//           LEFT JOIN customers c ON i.customer_id = c.id
//           WHERE i.id = ?
//         `,
//           [id]
//         );

//         const [invoiceItems] = await connection.execute(
//           "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at",
//           [id]
//         );

//         const invoice = invoices[0];
//         invoice.items = invoiceItems;

//         res.json({
//           message: "Invoice updated successfully",
//           invoice,
//         });
//       } catch (err) {
//         await connection.rollback();
//         throw err;
//       } finally {
//         connection.release();
//       }
//     } catch (error) {
//       console.error("Invoice update error:", error);
//       res.status(500).json({ error: "Failed to update invoice" });
//     }
//   }
// );

// // Delete invoice
// router.delete("/:id", authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params;

//     const access = await ensureCanAccessInvoice(req, res, id);
//     if (!access.ok) return;

//     const [existingInvoices] = await pool.execute(
//       "SELECT id FROM invoices WHERE id = ?",
//       [id]
//     );

//     if (existingInvoices.length === 0) {
//       return res.status(404).json({ error: "Invoice not found" });
//     }

//     await pool.execute("DELETE FROM invoices WHERE id = ?", [id]);

//     res.json({ message: "Invoice deleted successfully" });
//   } catch (error) {
//     console.error("Invoice deletion error:", error);
//     res.status(500).json({ error: "Failed to delete invoice" });
//   }
// });

// // Get invoice statistics
// router.get("/stats/overview", authenticateToken, async (req, res) => {
//   try {
//     let whereClause = "WHERE 1=1";
//     const params = [];

//     if (req.user.role !== "admin") {
//       whereClause += " AND c.assigned_to = ?";
//       params.push(req.user.userId);
//     }

//     const [stats] = await pool.execute(
//       `
//       SELECT 
//         i.status,
//         COUNT(*) AS count,
//         SUM(i.total) AS total_amount
//       FROM invoices i
//       LEFT JOIN customers c ON i.customer_id = c.id
//       ${whereClause}
//       GROUP BY i.status
//     `,
//       sanitizeParams(...params)
//     );

//     const [monthlyStats] = await pool.execute(
//       `
//       SELECT 
//         DATE_FORMAT(i.created_at, '%Y-%m') AS month,
//         COUNT(*) AS count,
//         SUM(i.total) AS total_amount
//       FROM invoices i
//       LEFT JOIN customers c ON i.customer_id = c.id
//       ${whereClause}
//       AND i.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
//       GROUP BY DATE_FORMAT(i.created_at, '%Y-%m')
//       ORDER BY month
//     `,
//       sanitizeParams(...params)
//     );

//     const [overdueInvoices] = await pool.execute(
//       `
//       SELECT COUNT(*) AS count, SUM(i.total) AS total_amount
//       FROM invoices i
//       LEFT JOIN customers c ON i.customer_id = c.id
//       ${whereClause}
//       AND i.status IN ('sent', 'overdue') AND i.due_date < CURDATE()
//     `,
//       sanitizeParams(...params)
//     );

//     res.json({
//       statusBreakdown: stats,
//       monthlyTrend: monthlyStats,
//       overdue: overdueInvoices[0],
//     });
//   } catch (error) {
//     console.error("Invoice stats error:", error);
//     res.status(500).json({ error: "Failed to fetch invoice statistics" });
//   }
// });

// module.exports = router;


//testing for new changes (16-12-2025)
const { v4: uuidv4 } = require("uuid")
const PDFDocument = require("pdfkit")

const express = require("express")
const { body, validationResult, query } = require("express-validator")
const { pool } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const { generateInvoiceNumber } = require("../utils/helpers")

const router = express.Router()

// Helper: convert undefined to null for MySQL compatibility
const sanitizeParams = (...params) => {
  return params.map((param) => (param === undefined ? null : param))
}

// Helper: normalize Date/ISO string to MySQL DATE (YYYY-MM-DD)
const toSqlDate = (value) => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Helpers
const handleValidation = (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    })
    return true
  }
  return false
}

const invoiceFieldMap = {
  customerId: "customer_id",
  amount: "amount",
  tax: "tax",
  total: "total",
  status: "status",
  dueDate: "due_date",
  paidDate: "paid_date",
  notes: "notes",
}

// Build invoice values from customer + request body
// With new semantics:
// - amount = total amount before GST
// - tax   = GST rate (e.g. 18)
// - total = total payable with GST
const buildInvoiceFromCustomer = (customer, body) => {
  const { amount, tax, total, status, dueDate, notes, items } = body

  // If amount not provided, derive from items
  let derivedAmount = amount
  if (derivedAmount === undefined && Array.isArray(items)) {
    derivedAmount = items.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    )
  }

  const defaultTaxRate = customer.default_tax_rate ?? 0
  const finalAmount = Number(derivedAmount || 0)

  // If caller supplied tax (GST rate), use it; else fall back to default_tax_rate
  const finalTax =
    tax !== undefined
      ? Number(tax)
      : defaultTaxRate || 0

  // If caller supplied total, use it; else compute using finalTax as rate
  const finalTotal =
    total !== undefined
      ? Number(total)
      : finalAmount + (finalAmount * finalTax) / 100

  // Due date: use body.dueDate if provided, else today + customer.default_due_days (fallback 7)
  let finalDueDate
  if (dueDate) {
    finalDueDate = toSqlDate(dueDate)
  } else {
    const dueDays = customer.default_due_days ?? 7
    const d = new Date()
    d.setDate(d.getDate() + Number(dueDays))
    finalDueDate = toSqlDate(d)
  }

  const finalStatus = status || "draft"
  const finalNotes = notes ?? customer.default_invoice_notes ?? null

  return {
    amount: finalAmount,
    tax: finalTax,
    total: finalTotal,
    status: finalStatus,
    dueDate: finalDueDate,
    notes: finalNotes,
  }
}

// helper: ensure current user can access invoice (via customer.assigned_to)
const ensureCanAccessInvoice = async (req, res, invoiceId) => {
  if (req.user.role === "admin") return { ok: true }

  const [rows] = await pool.execute(
    `
      SELECT i.id
      FROM invoices i
      INNER JOIN customers c ON i.customer_id = c.id
      WHERE i.id = ? AND c.assigned_to = ?
    `,
    sanitizeParams(invoiceId, req.user.userId),
  )

  if (rows.length === 0) {
    return {
      ok: false,
      response: res
        .status(403)
        .json({ error: "You do not have permission to access this invoice" }),
    }
  }

  return { ok: true }
}

// Get all invoices with filtering and pagination
router.get(
  "/",
  authenticateToken,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("search").optional().isString().withMessage("Search must be a string"),
    query("status")
      .optional()
      .isIn(["draft", "sent", "paid", "overdue", "cancelled"])
      .withMessage("Invalid status"),
    query("customerId").optional().isString().withMessage("Customer ID must be a string"),
    query("dueDateFrom")
      .optional()
      .isISO8601()
      .withMessage("Due date from must be a valid date"),
    query("dueDateTo")
      .optional()
      .isISO8601()
      .withMessage("Due date to must be a valid date"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return

      const pageRaw = Number.parseInt(req.query.page, 10)
      const limitRaw = Number.parseInt(req.query.limit, 10)

      const page = !Number.isNaN(pageRaw) && pageRaw > 0 ? pageRaw : 1
      const limit =
        !Number.isNaN(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 10
      const offset = (page - 1) * limit

      if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
        return res.status(400).json({ error: "Invalid pagination parameters" })
      }

      const { search, status, customerId, dueDateFrom, dueDateTo } = req.query

      let whereClause = "WHERE 1=1"
      const queryParams = []

      if (req.user.role !== "admin") {
        whereClause += " AND c.assigned_to = ?"
        queryParams.push(req.user.userId)
      }

      if (search) {
        whereClause +=
          " AND (i.invoice_number LIKE ? OR c.name LIKE ? OR c.company LIKE ?)"
        const searchTerm = `%${search}%`
        queryParams.push(searchTerm, searchTerm, searchTerm)
      }

      if (status) {
        whereClause += " AND i.status = ?"
        queryParams.push(status)
      }

      if (customerId) {
        whereClause += " AND i.customer_id = ?"
        queryParams.push(customerId)
      }

      if (dueDateFrom) {
        whereClause += " AND i.due_date >= ?"
        queryParams.push(dueDateFrom)
      }

      if (dueDateTo) {
        whereClause += " AND i.due_date <= ?"
        queryParams.push(dueDateTo)
      }

      // LIMIT/OFFSET as literal ints
      const invoicesSql = `
        SELECT 
          i.*,
          c.name AS customer_name,
          c.company AS customer_company,
          c.email AS customer_email
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        ${whereClause}
        ORDER BY i.created_at DESC
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}
      `

      const [invoices] = await pool.execute(invoicesSql, queryParams)

      const countSql = `
        SELECT COUNT(*) AS total 
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        ${whereClause}
      `
      const [countResult] = await pool.execute(countSql, queryParams)

      const total = countResult[0]?.total || 0
      const totalPages = total > 0 ? Math.ceil(total / limit) : 1

      res.json({
        invoices,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      })
    } catch (error) {
      console.error("Invoices fetch error:", error)
      res.status(500).json({ error: "Failed to fetch invoices" })
    }
  },
)

// Get invoice by ID with items
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const access = await ensureCanAccessInvoice(req, res, id)
    if (!access.ok) return

    const [invoices] = await pool.execute(
      `
        SELECT 
          i.*,
          c.name AS customer_name,
          c.company AS customer_company,
          c.email AS customer_email,
          c.phone AS customer_phone,
          c.address AS customer_address,
          c.city AS customer_city,
          c.state AS customer_state,
          c.zip_code AS customer_zip_code,
          c.country AS customer_country
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.id = ?
      `,
      [id],
    )

    if (invoices.length === 0) {
      return res.status(404).json({ error: "Invoice not found" })
    }

    const [items] = await pool.execute(
      "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at",
      [id],
    )

    const invoice = invoices[0]
    invoice.items = items

    res.json({ invoice })
  } catch (error) {
    console.error("Invoice fetch error:", error)
    res.status(500).json({ error: "Failed to fetch invoice" })
  }
})

// Download invoice as PDF
// router.get("/:id/download", authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params

//     const access = await ensureCanAccessInvoice(req, res, id)
//     if (!access.ok) return

//     // Load invoice + customer
//     const [invoices] = await pool.execute(
//       `
//         SELECT 
//           i.*,
//           c.name AS customer_name,
//           c.address AS customer_address,
//           c.city AS customer_city,
//           c.state AS customer_state,
//           c.zip_code AS customer_zip_code,
//           c.country AS customer_country
//         FROM invoices i
//         LEFT JOIN customers c ON i.customer_id = c.id
//         WHERE i.id = ?
//       `,
//       [id],
//     )

//     if (invoices.length === 0) {
//       return res.status(404).json({ error: "Invoice not found" })
//     }

//     const [items] = await pool.execute(
//       "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at",
//       [id],
//     )

//     const invoice = invoices[0]
//     const serviceItem = items[0] || null

//     const subtotal =
//       items.reduce((sum, item) => sum + Number(item.amount || 0), 0) ||
//       Number(invoice.amount || 0)
//     const gstRate = Number(invoice.tax || 18)
//     const gstAmount = (subtotal * gstRate) / 100
//     const totalWithGst = subtotal + gstAmount

//     const customerName = invoice.customer_name || ""
//     const customerAddress = [
//       invoice.customer_address,
//       invoice.customer_city,
//       invoice.customer_state,
//       invoice.customer_zip_code,
//       invoice.customer_country,
//     ]
//       .filter(Boolean)
//       .join(", ")

//     const issueDate = invoice.issue_date
//       ? new Date(invoice.issue_date).toLocaleDateString("en-IN")
//       : ""
//     const dueDate = invoice.due_date
//       ? new Date(invoice.due_date).toLocaleDateString("en-IN")
//       : ""

//     // Generate PDF
//     const doc = new PDFDocument({ margin: 50 })

//     res.setHeader("Content-Type", "application/pdf")
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
//     )

//     doc.pipe(res)

//     // Header: Invoice title
//     doc.fontSize(18).text("INVOICE", { align: "right" }).moveDown()

//     // Customer details
//     doc
//       .fontSize(12)
//       .text(`Customer name: ${customerName}`)
//       .text(`Customer address: ${customerAddress}`)
//       .moveDown()

//     // Date + invoice number
//     doc.text(`Date: ${dueDate || issueDate}`).text(`Invoice number: ${invoice.invoice_number}`).moveDown()

//     // Service table header
//     doc
//       .fontSize(12)
//       .text("Sr. No", 50, doc.y, { continued: true })
//       .text("Service", 120, doc.y, { continued: true })
//       .text("Charges (₹)", 400, doc.y)
//     doc.moveTo(50, doc.y + 2).lineTo(550, doc.y + 2).stroke()
//     doc.moveDown(0.5)

//     // Single service row
//     if (serviceItem) {
//       doc
//         .text("1", 50, doc.y, { continued: true })
//         .text(serviceItem.description || "Service", 120, doc.y, {
//           continued: true,
//         })
//         .text(subtotal.toFixed(2), 400, doc.y)
//       doc.moveDown()
//     }

//     doc.moveDown()

//     // Totals
//     doc
//       .text(`Total amount: ₹${subtotal.toFixed(2)}`)
//       .text(`GST: ${gstRate}% (₹${gstAmount.toFixed(2)})`)
//       .text(
//         `Total payable amount with GST: ₹${totalWithGst.toFixed(2)}`,
//       )

//     if (invoice.notes) {
//       doc.moveDown().text("Notes:", { underline: true }).text(invoice.notes)
//     }

//     doc.end()
//   } catch (error) {
//     console.error("Invoice PDF error:", error)
//     res.status(500).json({ error: "Failed to generate invoice PDF" })
//   }
// })

//test 
// Download invoice as PDF (no auth, for testing)
// Download invoice as PDF (no auth, for testing)
router.get("/:id/download", async (req, res) => {
  try {
    const { id } = req.params

    // Load invoice + customer
    const [invoices] = await pool.execute(
      `
        SELECT 
          i.*,
          c.name AS customer_name,
          c.address AS customer_address,
          c.city AS customer_city,
          c.state AS customer_state,
          c.zip_code AS customer_zip_code,
          c.country AS customer_country
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.id = ?
      `,
      [id],
    )

    if (invoices.length === 0) {
      return res.status(404).json({ error: "Invoice not found" })
    }

    const [items] = await pool.execute(
      "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at",
      [id],
    )

    const invoice = invoices[0]
    const serviceItem = items[0] || null

    const subtotal =
      items.reduce((sum, item) => sum + Number(item.amount || 0), 0) ||
      Number(invoice.amount || 0)
    const gstRate = Number(invoice.tax || 18)
    const gstAmount = (subtotal * gstRate) / 100
    const totalWithGst = subtotal + gstAmount

    const customerName = invoice.customer_name || ""
    const customerAddress = [
      invoice.customer_address,
      invoice.customer_city,
      invoice.customer_state,
      invoice.customer_zip_code,
      invoice.customer_country,
    ]
      .filter(Boolean)
      .join(", ")

    const formatPdfDate = (value) => {
      if (!value) return ""
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return ""
      const dd = String(d.getDate()).padStart(2, "0")
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const yyyy = d.getFullYear()
      return `${dd}/${mm}/${yyyy}`
    }

    const issueDate = formatPdfDate(invoice.issue_date)
    const dueDate = formatPdfDate(invoice.due_date)

    const doc = new PDFDocument({ margin: 50 })

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
    )

    doc.pipe(res)

    // Title
    doc.fontSize(20).text("INVOICE", { align: "right" }).moveDown(1.5)

    // Customer + invoice info in two columns
    const leftX = 50
    const rightX = 320

    doc
      .fontSize(12)
      .text(`Customer name: ${customerName}`, leftX)
      .text(`Customer address: ${customerAddress}`, leftX)
      .moveDown()

    doc
      .text(`Issue date: ${issueDate}`, rightX)
      .text(`Due date: ${dueDate}`, rightX)
      .text(`Invoice number: ${invoice.invoice_number}`, rightX)
      .moveDown(2)

    // Service table header
    const tableTop = doc.y
    const colSrNoX = 50
    const colServiceX = 100
    const colChargesX = 420

    doc
      .fontSize(12)
      .text("Sr. No", colSrNoX, tableTop)
      .text("Service", colServiceX, tableTop)
      .text("Charges (₹)", colChargesX, tableTop, { align: "right" })

    const headerBottomY = tableTop + 18
    doc
      .moveTo(colSrNoX, headerBottomY)
      .lineTo(550, headerBottomY)
      .stroke()

    // Single service row
    let rowY = headerBottomY + 8

    if (serviceItem) {
      doc
        .text("1", colSrNoX, rowY)
        .text(serviceItem.description || "Service", colServiceX, rowY, {
          width: colChargesX - colServiceX - 10,
        })
        .text(subtotal.toFixed(2), colChargesX, rowY, {
          align: "right",
        })

      rowY += 20
    }

    doc.moveTo(colSrNoX, rowY).lineTo(550, rowY).stroke()
    doc.moveDown(2)

    // Totals section, right aligned
    const totalsX = 320

    doc
      .fontSize(12)
      .text(`Total amount (before GST):`, totalsX, rowY + 10)
      .text(`₹${subtotal.toFixed(2)}`, 480, rowY + 10, { align: "right" })

    doc
      .text(
        `GST: ${gstRate}% (on total amount)`,
        totalsX,
        doc.y + 5,
      )
      .text(`₹${gstAmount.toFixed(2)}`, 480, doc.y - 12, {
        align: "right",
      })

    doc
      .moveTo(totalsX, doc.y + 8)
      .lineTo(550, doc.y + 8)
      .stroke()

    doc
      .fontSize(13)
      .text(
        `Total payable amount with GST:`,
        totalsX,
        doc.y + 12,
      )
      .text(`₹${totalWithGst.toFixed(2)}`, 480, doc.y - 14, {
        align: "right",
      })

    // Notes
    if (invoice.notes) {
      doc.moveDown(3)
      doc.fontSize(12).text("Notes:", { underline: true })
      doc.moveDown(0.5)
      doc.text(invoice.notes, {
        width: 500,
      })
    }

    doc.end()
  } catch (error) {
    console.error("Invoice PDF error:", error)
    res.status(500).json({ error: "Failed to generate invoice PDF" })
  }
})


// Create new invoice
router.post(
  "/",
  authenticateToken,
  [
    body("customerId").notEmpty().withMessage("Customer ID is required"),
    body("amount").optional().isNumeric().withMessage("Amount must be numeric"),
    body("tax").optional().isNumeric().withMessage("Tax must be numeric"),
    body("total").optional().isNumeric().withMessage("Total must be numeric"),
    body("status")
      .optional()
      .isIn(["draft", "sent", "paid", "overdue", "cancelled"])
      .withMessage("Invalid status"),
    body("dueDate")
      .optional()
      .isISO8601()
      .withMessage("Due date must be a valid date"),
    body("items")
      .isArray({ min: 1 })
      .withMessage("Items array is required with at least one item"),
    body("items.*.description")
      .notEmpty()
      .withMessage("Item description is required"),
    body("items.*.quantity")
      .isInt({ min: 1 })
      .withMessage("Item quantity must be a positive integer"),
    body("items.*.rate").isNumeric().withMessage("Item rate must be numeric"),
    body("items.*.amount")
      .isNumeric()
      .withMessage("Item amount must be numeric"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return

      const { customerId, items } = req.body

      // Load customer with defaults used for invoice generation
      const [customers] = await pool.execute(
        `
          SELECT 
            id,
            assigned_to,
            default_tax_rate,
            default_due_days,
            default_invoice_notes
          FROM customers
          WHERE id = ?
        `,
        [customerId],
      )

      if (customers.length === 0) {
        return res.status(400).json({ error: "Customer not found" })
      }

      const customer = customers[0]

      if (
        req.user.role !== "admin" &&
        customer.assigned_to !== req.user.userId
      ) {
        return res
          .status(403)
          .json({ error: "You do not have permission to invoice this customer" })
      }

      // Merge body with customer defaults (also normalizes dueDate to DATE)
      const built = buildInvoiceFromCustomer(customer, req.body)

      const invoiceNumber = generateInvoiceNumber()
      const invoiceId = uuidv4()

      const connection = await pool.getConnection()
      await connection.beginTransaction()

      try {
        await connection.execute(
          `
            INSERT INTO invoices (
              id, customer_id, invoice_number, amount, tax, total, status, due_date, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          sanitizeParams(
            invoiceId,
            customerId,
            invoiceNumber,
            built.amount,
            built.tax,
            built.total,
            built.status,
            built.dueDate, // already YYYY-MM-DD
            built.notes,
          ),
        )

        for (const item of items) {
          const itemId = uuidv4()
          await connection.execute(
            `
              INSERT INTO invoice_items (id, invoice_id, description, quantity, rate, amount)
              VALUES (?, ?, ?, ?, ?, ?)
            `,
            sanitizeParams(
              itemId,
              invoiceId,
              item.description,
              item.quantity,
              item.rate,
              item.amount,
            ),
          )
        }

        await connection.commit()

        const [createdInvoices] = await connection.execute(
          `
            SELECT 
              i.*,
              c.name AS customer_name,
              c.company AS customer_company,
              c.email AS customer_email
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            WHERE i.id = ?
          `,
          [invoiceId],
        )

        const [invoiceItems] = await connection.execute(
          "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at",
          [invoiceId],
        )

        const invoice = createdInvoices[0]
        invoice.items = invoiceItems

        res.status(201).json({
          message: "Invoice created successfully",
          invoice,
        })
      } catch (err) {
        await connection.rollback()
        throw err
      } finally {
        connection.release()
      }
    } catch (error) {
      console.error("Invoice creation error:", error)
      res.status(500).json({ error: "Failed to create invoice" })
    }
  },
)

// Update invoice
router.put(
  "/:id",
  authenticateToken,
  [
    body("customerId").optional().notEmpty().withMessage("Customer ID cannot be empty"),
    body("amount").optional().isNumeric().withMessage("Amount must be numeric"),
    body("tax").optional().isNumeric().withMessage("Tax must be numeric"),
    body("total").optional().isNumeric().withMessage("Total must be numeric"),
    body("status")
      .optional()
      .isIn(["draft", "sent", "paid", "overdue", "cancelled"])
      .withMessage("Invalid status"),
    body("dueDate")
      .optional()
      .isISO8601()
      .withMessage("Due date must be a valid date"),
    body("paidDate")
      .optional()
      .isISO8601()
      .withMessage("Paid date must be a valid date"),
    body("items").optional().isArray().withMessage("Items must be an array"),
    body("items.*.description")
      .optional()
      .notEmpty()
      .withMessage("Item description cannot be empty"),
    body("items.*.quantity")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Item quantity must be a positive integer"),
    body("items.*.rate")
      .optional()
      .isNumeric()
      .withMessage("Item rate must be numeric"),
    body("items.*.amount")
      .optional()
      .isNumeric()
      .withMessage("Item amount must be numeric"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return

      const { id } = req.params
      const updateData = { ...req.body }

      const access = await ensureCanAccessInvoice(req, res, id)
      if (!access.ok) return

      const [existingInvoices] = await pool.execute(
        "SELECT id, status, customer_id FROM invoices WHERE id = ?",
        [id],
      )

      if (existingInvoices.length === 0) {
        return res.status(404).json({ error: "Invoice not found" })
      }

      if (updateData.customerId) {
        const [customers] = await pool.execute(
          "SELECT id, assigned_to FROM customers WHERE id = ?",
          [updateData.customerId],
        )

        if (customers.length === 0) {
          return res.status(400).json({ error: "Customer not found" })
        }

        if (
          req.user.role !== "admin" &&
          customers[0].assigned_to !== req.user.userId
        ) {
          return res.status(403).json({
            error: "You do not have permission to set this customer on invoice",
          })
        }
      }

      // normalize date fields before building query
      if (updateData.dueDate) {
        updateData.dueDate = toSqlDate(updateData.dueDate)
      }
      if (updateData.paidDate) {
        updateData.paidDate = toSqlDate(updateData.paidDate)
      }

      const connection = await pool.getConnection()
      await connection.beginTransaction()

      try {
        const updateFields = []
        const updateValues = []

        Object.entries(updateData).forEach(([key, value]) => {
          if (key === "items" || value === undefined) return
          const dbField = invoiceFieldMap[key]
          if (!dbField) return

          updateFields.push(`${dbField} = ?`)
          updateValues.push(value)
        })

        const currentInvoice = existingInvoices[0]
        if (
          updateData.status === "paid" &&
          currentInvoice.status !== "paid" &&
          !updateData.paidDate
        ) {
          updateFields.push("paid_date = CURRENT_DATE")
        }

        if (updateFields.length > 0) {
          updateValues.push(id)
          await connection.execute(
            `UPDATE invoices SET ${updateFields.join(
              ", ",
            )}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            sanitizeParams(...updateValues),
          )
        }

        if (Array.isArray(updateData.items)) {
          await connection.execute(
            "DELETE FROM invoice_items WHERE invoice_id = ?",
            [id],
          )

          for (const item of updateData.items) {
            const itemId = uuidv4()
            await connection.execute(
              `
                INSERT INTO invoice_items (id, invoice_id, description, quantity, rate, amount)
                VALUES (?, ?, ?, ?, ?, ?)
              `,
              sanitizeParams(
                itemId,
                id,
                item.description,
                item.quantity,
                item.rate,
                item.amount,
              ),
            )
          }
        }

        await connection.commit()

        const [invoices] = await connection.execute(
          `
            SELECT 
              i.*,
              c.name AS customer_name,
              c.company AS customer_company,
              c.email AS customer_email
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            WHERE i.id = ?
          `,
          [id],
        )

        const [invoiceItems] = await connection.execute(
          "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at",
          [id],
        )

        const invoice = invoices[0]
        invoice.items = invoiceItems

        res.json({
          message: "Invoice updated successfully",
          invoice,
        })
      } catch (err) {
        await connection.rollback()
        throw err
      } finally {
        connection.release()
      }
    } catch (error) {
      console.error("Invoice update error:", error)
      res.status(500).json({ error: "Failed to update invoice" })
    }
  },
)

// Delete invoice
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const access = await ensureCanAccessInvoice(req, res, id)
    if (!access.ok) return

    const [existingInvoices] = await pool.execute(
      "SELECT id FROM invoices WHERE id = ?",
      [id],
    )

    if (existingInvoices.length === 0) {
      return res.status(404).json({ error: "Invoice not found" })
    }

    await pool.execute("DELETE FROM invoices WHERE id = ?", [id])

    res.json({ message: "Invoice deleted successfully" })
  } catch (error) {
    console.error("Invoice deletion error:", error)
    res.status(500).json({ error: "Failed to delete invoice" })
  }
})

// Get invoice statistics
router.get("/stats/overview", authenticateToken, async (req, res) => {
  try {
    let whereClause = "WHERE 1=1"
    const params = []

    if (req.user.role !== "admin") {
      whereClause += " AND c.assigned_to = ?"
      params.push(req.user.userId)
    }

    const [stats] = await pool.execute(
      `
        SELECT 
          i.status,
          COUNT(*) AS count,
          SUM(i.total) AS total_amount
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        ${whereClause}
        GROUP BY i.status
      `,
      sanitizeParams(...params),
    )

    const [monthlyStats] = await pool.execute(
      `
        SELECT 
          DATE_FORMAT(i.created_at, '%Y-%m') AS month,
          COUNT(*) AS count,
          SUM(i.total) AS total_amount
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        ${whereClause}
        AND i.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(i.created_at, '%Y-%m')
        ORDER BY month
      `,
      sanitizeParams(...params),
    )

    const [overdueInvoices] = await pool.execute(
      `
        SELECT COUNT(*) AS count, SUM(i.total) AS total_amount
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        ${whereClause}
        AND i.status IN ('sent', 'overdue') AND i.due_date < CURDATE()
      `,
      sanitizeParams(...params),
    )

    res.json({
      statusBreakdown: stats,
      monthlyTrend: monthlyStats,
      overdue: overdueInvoices[0],
    })
  } catch (error) {
    console.error("Invoice stats error:", error)
    res.status(500).json({ error: "Failed to fetch invoice statistics" })
  }
})

module.exports = router
