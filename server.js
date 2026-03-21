require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Connect MongoDB
mongoose.connect(process.env.MONGODB_URI);

// User subscription schema
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  plan: { type: String, default: "free" },
  stripeCustomerId: String,
  subscriptionId: String,
  updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.model("OfficeSuiteUser", UserSchema);

// Stripe webhook - raw body needed
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send("Webhook Error: " + err.message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    if (email) {
      const priceId = session.metadata?.priceId || "";
      const plan = priceId === process.env.STRIPE_PRO_PRICE ? "pro" : "business";
      await User.findOneAndUpdate(
        { email },
        { plan, stripeCustomerId: customerId, subscriptionId, updatedAt: new Date() },
        { upsert: true }
      );
      console.log("Plan upgraded:", email, plan);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await User.findOneAndUpdate({ stripeCustomerId: sub.customer }, { plan: "free" });
    console.log("Plan cancelled for customer:", sub.customer);
  }

  res.json({ received: true });
});

app.use(express.json());
app.use(cors({ origin: "*" }));

// Check plan by email
app.get("/plan/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    res.json({ plan: user?.plan || "free", email: req.params.email });
  } catch (err) {
    res.json({ plan: "free" });
  }
});

// Health check
app.get("/", (req, res) => res.json({ status: "NNIT Office Backend running" }));

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => console.log("Server running on port", PORT));
