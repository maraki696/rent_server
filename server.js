const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
// const axios = require("axios");
require("dotenv").config();









const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
const db = mysql.createConnection({
  host: process.env.DB_HOST,        
  user: process.env.DB_USER,       
  password: process.env.DB_PASSWORD,  
  database: process.env.DB_NAME,    
  port: process.env.DB_PORT || 53032  
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Connected to the database');
  }
});

db.query("SET time_zone = '+00:00';");




app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.use(express.json());





app.post("/register", (req, res) => {
  const sql =
    "INSERT INTO customers (firstname, lastname, tinnumber, phonenumber,  roomsize_sq_m, housenumber, paymentamountpermonth, paymentamountperyear, rentdate, leaseexpiredate, floornumber) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  const values = [
    req.body.firstname,
    req.body.lastname,
    req.body.tinnumber,
    req.body.phonenumber,
    req.body.roomsize_sq_m,
    req.body.housenumber,
    req.body.paymentamountpermonth,
    req.body.paymentamountperyear,
    req.body.rentdate,
    req.body.leaseexpiredate,
    req.body.floornumber,
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting data:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    return res.status(201).json({ success: "Registered Successfully" });
  });
});

app.get("/customers",async (req, res) => {
 await checkAndUpdatePaymentStatus();
  const sql = "SELECT * FROM customers";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ message: "Server error", error: err });
    return res.json(result);
  });
});


app.get("/get_customer/:customer_id", (req, res) => {
  const customer_id = req.params.customer_id;
  const sql = "SELECT * FROM customers WHERE `customer_id`= ?";
  db.query(sql, [customer_id], (err, result) => {
    if (err) res.json({ message: "Server error" });
    return res.json(result);
  });
});


app.put("/edit_customer/:customer_id", (req, res) => {
  const formatDateForMySQL = (dateString) => {
    return new Date(dateString).toISOString().split("T")[0]; 
  };


  const leaseexpiredate = formatDateForMySQL(req.body.leaseexpiredate);
  const rentdate = formatDateForMySQL(req.body.rentdate);

  const query = `
    UPDATE customers 
    SET firstname=?, lastname=?, tinnumber=?, phonenumber=?,  
        roomsize_sq_m=?, housenumber=?, paymentamountpermonth=?, paymentamountperyear=?, 
        rentdate=?, leaseexpiredate=?, floornumber=? 
    WHERE customer_id=?
  `;

  const values = [
    req.body.firstname, req.body.lastname, req.body.tinnumber, req.body.phonenumber, 
    req.body.roomsize_sq_m, req.body.housenumber, req.body.paymentamountpermonth, req.body.paymentamountperyear,
    rentdate, leaseexpiredate, req.body.floornumber, req.params.customer_id
  ];

  db.query(query, values, (err, result) => {
    if (err) {
      
      return res.status(500).json({ error: "Database update failed" });
    }
    res.json({ message: "Customer updated successfully" });
  });
});




app.delete("/delete/:customer_id", (req, res) => {
  const id = req.params.customer_id; // Fix: Correct parameter reference
  const sql = "DELETE FROM customers WHERE customer_id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error('Error deleting customer:', err.response?.data || err);

    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }
    return res.json({ success: "Customer deleted successfully" });
  });
});


app.post("/approve_payment", async (req, res) => {
  await checkAndUpdatePaymentStatus();
  const { customer_id, start_date, end_date, amount } = req.body;
  const formattedStartDate = new Date(start_date).toISOString().split("T")[0];
        const formattedEndDate = new Date(end_date).toISOString().split("T")[0];

  try {
    const amountQuery = "SELECT paymentamountpermonth FROM customers WHERE customer_id = ?";
    db.query(amountQuery, [customer_id], (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });

      if (result.length === 0) return res.status(404).json({ message: "Customer not found" });

      const monthlyAmount = result[0].paymentamountpermonth;

      // Directly parse start_date and end_date as YYYY-MM-DD format from the request
      const startDate = new Date(start_date); // Automatically handles string -> Date conversion
      const endDate = new Date(end_date); // Automatically handles string -> Date conversion

      // Ensure endDate is at 23:59:59 for accurate calculation
      endDate.setHours(23, 59, 59, 999);

      // Duration calculation in days
      const durationInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const durationInMonths = durationInDays / 30; // Approximate number of months

      const totalAmount = amount || Math.round(monthlyAmount * durationInMonths);

      // Insert payment into the database with formatted dates
      const insertPayment = `
        INSERT INTO payments (customer_id, amount, paymentdate, startdate, enddate, payment_status)
        VALUES (?, ?, NOW(), ?, ?, 'Paid')
      `;
      db.query(insertPayment, [customer_id, totalAmount, formattedStartDate, formattedEndDate], (err) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });

        // Update customer payment status
        const updateCustomerStatus = "UPDATE customers SET payment_status = 'Paid' WHERE customer_id = ?";
        db.query(updateCustomerStatus, [customer_id], (err) => {
          if (err) return res.status(500).json({ message: "Database error", error: err });

          res.json({ success: "Payment approved successfully", totalAmount });
        });
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Unexpected server error", error });
  }
});





    
   
  



app.post("/admin/login", async (req, res) => {
 await checkAndUpdatePaymentStatus();
  const { username, password } = req.body;
  const sql = "SELECT * FROM admins WHERE username = ?";

  db.query(sql, [username], async (err, result) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });

    if (result.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const admin = result[0];

    const isMatch = await bcrypt.compare(password, admin.password);
    if (isMatch) {
      res.json({ success: true, admin });
    } else {
      res.status(401).json({ message: "Invalid username or password" });
    }
  });
});







app.get("/api/payments",async (req, res) => {
 await checkAndUpdatePaymentStatus();
    const query = `
        SELECT p.payment_id, p.amount, p.paymentdate, p.startdate, p.enddate, p.payment_status, p.payment_duration,
               c.firstname, c.lastname
        FROM payments p
        JOIN customers c ON p.customer_id = c.customer_id
        ORDER BY p.paymentdate DESC;
    `;

    db.query(query, (err, results) => {
        if (err) {
            
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json(results); 
    });
});


const checkAndUpdatePaymentStatus = () => {
  const query = `
      SELECT c.customer_id, c.firstname, c.lastname, c.paymentamountpermonth, 
             MAX(p.enddate) AS last_payment_enddate
      FROM customers c
      LEFT JOIN payments p ON c.customer_id = p.customer_id
      WHERE c.payment_status = 'Paid'
      GROUP BY c.customer_id, c.firstname, c.lastname, c.paymentamountpermonth
      HAVING last_payment_enddate IS NULL OR last_payment_enddate < CURDATE();
  `;

  db.query(query, (err, results) => {
      if (err) {
          console.error("Error fetching unpaid customers:", err);
          return;
      }

      if (results.length === 0) {
         
          return;
      }

      results.forEach((customer) => {
          const updateQuery = "UPDATE customers SET payment_status = 'Unpaid' WHERE customer_id = ?";
          db.query(updateQuery, [customer.customer_id], (err) => {
              if (err) {
                  console.error("Error updating payment status:", err);
                  return;
              }
             
          });
      });
  });
};






app.get("/unpaid_customers",async(req, res) => {
 await checkAndUpdatePaymentStatus();
  const query = `
    SELECT 
        c.customer_id, 
        c.firstname, 
        c.lastname, 
        c.paymentamountpermonth,
        IFNULL(DATEDIFF(CURDATE(), MAX(p.enddate)), 0) AS days_unpaid
    FROM customers c
    LEFT JOIN payments p ON c.customer_id = p.customer_id
    WHERE c.payment_status = 'Unpaid'
    GROUP BY c.customer_id, c.firstname, c.lastname, c.paymentamountpermonth
    ORDER BY days_unpaid DESC;
  `;

  db.query(query, (err, results) => {
      if (err) {
          console.error("Error fetching unpaid customers:", err);
          return res.status(500).json({ error: "Internal Server Error" });
      }
    
      res.json(results);
  });
});


app.post("/management/login",async (req, res) =>    {

  await checkAndUpdatePaymentStatus();
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM management_members WHERE username = ?",
    [username],
    async (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
      }

      if (results.length === 0) {
        return res.status(401).json({ success: false, message: "Invalid username or password" });
      }

      const user = results[0];

     
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Invalid username or password" });
      }

      res.json({ success: true, message: "Login successful" });
    }
  );
});





app.post("/management/create_account", async (req, res) => {
  const { username, password } = req.body;


  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO management_members (username, password) VALUES (?, ?)",
    [username, hashedPassword],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
      }
      res.json({ success: true, message: "Account created successfully" });
    }
  );
});


app.post("/management/change-password", async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  db.query(
    "SELECT * FROM management_members WHERE username = ?",
    [username],
    async (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const user = results[0];

   
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Old password is incorrect" });
      }

 
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      db.query(
        "UPDATE management_members SET password = ? WHERE username = ?",
        [hashedNewPassword, username],
        (updateErr) => {
          if (updateErr) {
            console.error(updateErr);
            return res.status(500).json({ success: false, message: "Failed to update password" });
          }
          res.json({ success: true, message: "Password changed successfully" });
        }
      );
    }
  );
});





app.post("/admin/create_account", async (req, res) => {
  const { username, email, phonenumber, password } = req.body;

  if (!username || !email || !phonenumber || !password) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  try {
    // Check if username or email already exists
    db.query("SELECT * FROM admins WHERE username = ? OR email = ?", [username, email], async (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
      }

      if (result.length > 0) {
        return res.status(400).json({ success: false, message: "Username or email already taken" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      db.query(
        "INSERT INTO admins (username, email, phonenumber, password) VALUES (?, ?, ?, ?)",
        [username, email, phonenumber, hashedPassword],
        (err) => {
          if (err) {
            console.error("Insert error:", err);
            return res.status(500).json({ success: false, message: "Failed to create admin" });
          }
          res.status(201).json({ success: true, message: "Admin account created successfully" });
        }
      );
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});



app.post("/admin/change-password", async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;

  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  try {
    db.query("SELECT * FROM admins WHERE username = ?", [username], async (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
      }

      if (result.length === 0) {
        return res.status(404).json({ success: false, message: "Admin not found" });
      }

      const isMatch = await bcrypt.compare(currentPassword, result[0].password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Incorrect current password" });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      db.query("UPDATE admins SET password = ? WHERE username = ?", [hashedNewPassword, username], (err) => {
        if (err) {
          console.error("Update error:", err);
          return res.status(500).json({ success: false, message: "Failed to change password" });
        }
        res.status(200).json({ success: true, message: "Password changed successfully" });
      });
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});




console.log("Current Server Time:", new Date().toLocaleString());


// ✅ Function to check customers due tomorrow
const checkCustomersDueTomorrow = async () => {
  try {
    console.log(`[${new Date().toISOString()}] Checking customers due tomorrow...`);

    const [customers] = await db.promise().query(`
      SELECT c.customer_id, c.firstname, c.lastname, c.paymentamountpermonth, 
             p.enddate AS last_payment_enddate
      FROM customers c
      LEFT JOIN payments p ON c.customer_id = p.customer_id
      WHERE c.payment_status = 'Paid'
        AND DATE(p.enddate) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      ORDER BY p.enddate DESC LIMIT 1;
    `);

    if (customers.length === 0) {
      console.log("✅ No customers due tomorrow.");
      return;
    }

    console.log(` Found ${customers.length} customers due tomorrow.`);

    const customerIds = customers.map((c) => c.customer_id);
    if (customerIds.length === 0) return;

    const [loggedEmails] = await db.promise().query(`
      SELECT customer_id FROM email_logs 
      WHERE email_sent_date = CURDATE() 
      AND customer_id IN (${customerIds.join(",")});
    `);

    const alreadyEmailedIds = loggedEmails.map((row) => row.customer_id);
    const customersToNotify = customers.filter(
      (c) => !alreadyEmailedIds.includes(c.customer_id)
    );

    if (customersToNotify.length === 0) {
      console.log("No new customers to notify today.");
      return;
    }

    const [admins] = await db.promise().query("SELECT email FROM admins");
    if (admins.length === 0) {
      console.log("No admin emails found.");
      return;
    }

    const adminEmails = admins.map((a) => a.email);
    let emailBody = "The following customers have 1 day left before rent is due:\n\n";
    customersToNotify.forEach((c) => {
      emailBody += `- ${c.firstname} ${c.lastname} | Amount Due: ${c.paymentamountpermonth} ETB\n`;
    });

    await sendEmailToAdmins(adminEmails, emailBody, customersToNotify);
  } catch (err) {
    console.error("Error in checkCustomersDueTomorrow:", err);
  }
};


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmailToAdmins = async (adminEmails, emailBody, customers) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmails.join(","),
      subject: "Urgent: Customers with 1 Day Left for Rent Payment",
      text: emailBody,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📩 Email sent to admins: ${info.response}`);

    const values = customers.map((c) => `(${c.customer_id}, CURDATE())`).join(",");
    await db.promise().query(`INSERT INTO email_logs (customer_id, email_sent_date) VALUES ${values}`);

    console.log("Email logs updated successfully.");
  } catch (err) {
    console.error("Error sending admin email:", err);
  }
};


app.get("/api/run-cron-job", async (req, res) => {
  try {
    await checkCustomersDueTomorrow();
    res.status(200).send("Cron job executed successfully!");
  } catch (err) {
    console.error("❌ Cron job execution failed:", err);
    res.status(500).send("Cron job failed.");
  }
});





app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




