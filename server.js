const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { testConnection } = require("./config/database");

const { initializeScheduler } = require("./services/scheduler");

const authRoutes = require("./routes/auth");
const usersRouter = require("./routes/users");
const customerRoutes = require("./routes/customers");
const leadRoutes = require("./routes/leads");
const dealRoutes = require("./routes/deals");
const taskRoutes = require("./routes/tasks");
const invoiceRoutes = require("./routes/invoices");
const renewalRoutes = require("./routes/renewals");
const whatsappRoutes = require("./routes/whatsapp");
const reportRoutes = require("./routes/reports");
const projectRoutes = require("./routes/projects");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://crm-frontend-delta-two.vercel.app";


app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,       
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get("/api/health", async (req, res) => {
  try {
    await testConnection();
    res.json({
      status: "OK",
      message: "VasifyTech CRM API is running",
      timestamp: new Date().toISOString(),
      db: "connected",
      version: "1.0.0",
    });
  } catch (error) {
    res.status(503).json({
      status: "DEGRADED",
      message: "VasifyTech CRM API running but DB unavailable",
      timestamp: new Date().toISOString(),
      db: "disconnected",
      error: error.message,
    });
  }
});


app.get("/", (req, res) => {
  res.json({
    message: "Welcome to VasifyTech CRM API",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
    },
  });
});


app.use("/api/auth", authRoutes);
app.use("/api/users", usersRouter);
app.use("/api/customers", customerRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/renewals", renewalRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/projects", projectRoutes);


app.use((err, req, res, next) => {
  console.error("ERROR:", err.stack);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation Error",
      message: err.message,
      details: err.details,
    });
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
  }

  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});


app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});


process.on("SIGTERM", () => {
  console.log(" SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log(" SIGINT received, shutting down gracefully");
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(" Unhandled Rejection at:", promise, "reason:", reason);
});


const startServer = async () => {
  try {
    console.log(" Testing database connection...");
    await testConnection();
    console.log(" Database connected successfully");

    console.log(" Initializing scheduler...");
    await initializeScheduler();
    console.log(" Scheduler initialized");

    app.listen(PORT, () => {
      console.log("\n==================================================");
      console.log(" VasifyTech CRM Server Started Successfully!");
      console.log("==================================================");
      console.log(` Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(` Server URL: http://localhost:${PORT}`);
      console.log(` Frontend URL: ${FRONTEND_URL}`);
      console.log("==================================================\n");
    });
  } catch (error) {
    console.error("\n==================================================");
    console.error(" SERVER STARTUP FAILED!");
    console.error("==================================================");
    console.error("Error:", error.message);
    console.error("==================================================\n");
    process.exit(1);
  }
};

startServer();
