-- Create database
CREATE DATABASE IF NOT EXISTS vasifytech_crm;
USE vasifytech_crm;

-- Users table
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'sales', 'support') DEFAULT 'sales',
  avatar VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE customers (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  company VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  zip_code VARCHAR(20),
  country VARCHAR(100),
  status ENUM('active', 'inactive', 'prospect') DEFAULT 'prospect',
  source VARCHAR(100),
  assigned_to VARCHAR(36),
  tags JSON,
  notes TEXT,
  last_contact_date DATE,
  total_value DECIMAL(10,2) DEFAULT 0,
  whatsapp_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- Leads table
CREATE TABLE leads (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  company VARCHAR(255),
  source ENUM('website', 'referral', 'social', 'advertisement', 'cold-call', 'other') DEFAULT 'website',
  status ENUM('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost') DEFAULT 'new',
  priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
  assigned_to VARCHAR(36),
  estimated_value DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  expected_close_date DATE,
  whatsapp_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- Deals table
CREATE TABLE deals (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title VARCHAR(255) NOT NULL,
  customer_id VARCHAR(36),
  value DECIMAL(10,2) NOT NULL,
  stage ENUM('prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost') DEFAULT 'prospecting',
  probability INT DEFAULT 0,
  expected_close_date DATE,
  actual_close_date DATE,
  assigned_to VARCHAR(36),
  products JSON,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- Tasks table
CREATE TABLE tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type ENUM('call', 'email', 'meeting', 'follow-up', 'demo', 'other') DEFAULT 'other',
  priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
  status ENUM('pending', 'in-progress', 'completed', 'cancelled') DEFAULT 'pending',
  assigned_to VARCHAR(36),
  related_type ENUM('customer', 'lead', 'deal'),
  related_id VARCHAR(36),
  due_date DATETIME,
  completed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- Invoices table
CREATE TABLE invoices (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  customer_id VARCHAR(36) NOT NULL,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Invoice items table
CREATE TABLE invoice_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  invoice_id VARCHAR(36) NOT NULL,
  description VARCHAR(500) NOT NULL,
  quantity INT NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- Renewal reminders table
CREATE TABLE renewal_reminders (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  customer_id VARCHAR(36) NOT NULL,
  service_type ENUM('whatsapp-panel', 'website', 'hosting', 'domain', 'other') NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  expiry_date DATE NOT NULL,
  reminder_days JSON NOT NULL,
  last_reminder_sent DATE,
  status ENUM('active', 'renewed', 'expired', 'cancelled') DEFAULT 'active',
  whatsapp_template TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Renewals table
CREATE TABLE renewals (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  customer_id VARCHAR(36) NOT NULL,
  service VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expiry_date DATE NOT NULL,
  status ENUM('active', 'expiring', 'expired', 'renewed') DEFAULT 'active',
  reminder_days INT DEFAULT 30,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- WhatsApp campaigns table (for automation)
CREATE TABLE whatsapp_campaigns (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  template TEXT NOT NULL,
  status ENUM('draft', 'active', 'paused', 'completed') DEFAULT 'draft',
  target_audience JSON,
  scheduled_at DATETIME,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  read_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- WhatsApp messages log table
CREATE TABLE whatsapp_messages (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  campaign_id VARCHAR(36),
  customer_id VARCHAR(36),
  phone_number VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
  sent_at DATETIME,
  delivered_at DATETIME,
  read_at DATETIME,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- Insert default admin user
INSERT INTO users (name, email, password, role) VALUES 
('Admin User', 'admin@vasifytech.com', 'admin123', 'admin');
-- ('Admin User', 'admin@vasifytech.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');
