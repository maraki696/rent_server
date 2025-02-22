const mysql = require("mysql2");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const axios = require("axios");

require("dotenv").config(); // Load environment variables

// Create a MySQL connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 53032,
  waitForConnections: true,
  connectionLimit: 10, 
  queueLimit: 0,
});

console.log(`[${new Date().toISOString()}] Cron Job::::: Connected to Database.`);


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
      GROUP BY c.customer_id, c.firstname, c.lastname, c.paymentamountpermonth, p.enddate;
    `);

    if (customers.length === 0) {
      console.log("✅ No customers due tomorrow.");
      return;
    }

    console.log(`📌 Found ${customers.length} customers due tomorrow.`);

    const customerIds = customers.map((c) => c.customer_id);
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
      console.log("✅ No new customers to notify today.");
      return;
    }

    const [admins] = await db.promise().query("SELECT email FROM admins");
    if (admins.length === 0) {
      console.log("⚠️ No admin emails found.");
      return;
    }

    const adminEmails = admins.map((a) => a.email);
    let emailBody = "🚨 The following customers have 1 day left before rent is due:\n\n";
    customersToNotify.forEach((c) => {
      emailBody += `- ${c.firstname} ${c.lastname} | Amount Due: ${c.paymentamountpermonth} ETB\n`;
    });

    await sendEmailToAdmins(adminEmails, emailBody, customersToNotify);
  } catch (err) {
    console.error("❌ Error in checkCustomersDueTomorrow:", err);
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
      subject: "⚠️ Urgent: Customers with 1 Day Left for Rent Payment",
      text: emailBody,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📩 Email sent to admins: ${info.response}`);

    const values = customers.map((c) => `(${c.customer_id}, CURDATE())`).join(",");
    await db.promise().query(`INSERT INTO email_logs (customer_id, email_sent_date) VALUES ${values}`);

    console.log("✅ Email logs updated successfully.");
  } catch (err) {
    console.error("❌ Error sending admin email:", err);
  }
};
cron.schedule("0 2 * * *", () => {
  console.log(`[${new Date().toISOString()}] Running cron job...`);
  checkCustomersDueTomorrow();
});

// Run the job immediately on startup
// checkCustomersDueTomorrow();
// console.log(`[${new Date().toISOString()}] Cron job initialized.`);

// Schedule the cron job to run daily at 2 AM

// Keep the server alive on Render to prevent shutdown
// const keepServerAlive = () => {
//   setInterval(async () => {
//     try {
//       console.log(`[${new Date().toISOString()}] Keeping server alive...`);
//       await axios.get(`${process.env.SERVER_URL}/health-check`);
//     } catch (err) {
//       console.log("⚠️ Server keep-alive request failed.");
//     }
//   }, 1000 * 60 * 15); // Ping every 15 minutes
// };

keepServerAlive();
