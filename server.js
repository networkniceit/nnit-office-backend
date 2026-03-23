const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());
app.use("/webhook", express.raw({type: "application/json"}));

// Connect MongoDB
mongoose.connect(process.env.MONGODB_URI).then(() => console.log("MongoDB connected")).catch(console.error);

// ===== SCHEMAS =====
const UserSchema = new mongoose.Schema({email:{type:String,unique:true},password:String,plan:{type:String,default:"free"},createdAt:{type:Date,default:Date.now}});
const ProductSchema = new mongoose.Schema({name:String,description:String,price:Number,oldPrice:Number,category:String,image:String,badge:String,stock:{type:Number,default:0},active:{type:Boolean,default:true},createdAt:{type:Date,default:Date.now}});
const OrderSchema = new mongoose.Schema({customerEmail:String,customerName:String,items:[{productId:String,name:String,price:Number,qty:Number,image:String}],total:Number,status:{type:String,default:"pending"},stripeSessionId:String,address:Object,createdAt:{type:Date,default:Date.now}});

const User = mongoose.model("User", UserSchema);
const Product = mongoose.model("Product", ProductSchema);
const Order = mongoose.model("Order", OrderSchema);

// ===== HEALTH =====
app.get("/", (req, res) => res.json({status:"NNIT Backend running", version:"2.0"}));

// ===== AUTH =====
function hashPw(pw){return crypto.createHash("sha256").update(pw).digest("hex");}
function makeToken(email){return Buffer.from(email+":"+Date.now()).toString("base64");}

app.post("/register", async (req, res) => {
  try {
    const {email, password} = req.body;
    if(!email||!password) return res.status(400).json({error:"Email and password required"});
    const exists = await User.findOne({email});
    if(exists) return res.status(400).json({error:"Email already registered"});
    const user = await User.create({email, password:hashPw(password)});
    res.json({token:makeToken(email), email, plan:user.plan});
  } catch(e) {res.status(500).json({error:e.message});}
});

app.post("/login", async (req, res) => {
  try {
    const {email, password} = req.body;
    const user = await User.findOne({email, password:hashPw(password)});
    if(!user) return res.status(401).json({error:"Invalid email or password"});
    res.json({token:makeToken(email), email, plan:user.plan});
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/plan/:email", async (req, res) => {
  try {
    const user = await User.findOne({email:req.params.email});
    if(!user) return res.status(404).json({error:"User not found"});
    res.json({email:user.email, plan:user.plan});
  } catch(e) {res.status(500).json({error:e.message});}
});

// ===== PRODUCTS =====
app.get("/products", async (req, res) => {
  try {
    const {category, search, limit} = req.query;
    let query = {active:{$ne:false}};
    if(category && category !== "all") query.category = category;
    if(search) query.name = {$regex:search, $options:"i"};
    const products = await Product.find(query).limit(parseInt(limit)||100).sort({createdAt:-1});
    res.json(products);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if(!product) return res.status(404).json({error:"Product not found"});
    res.json(product);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.post("/products", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    const product = await Product.create(req.body);
    res.json(product);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.put("/products/:id", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {new:true});
    res.json(product);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.delete("/products/:id", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    await Product.findByIdAndUpdate(req.params.id, {active:false});
    res.json({success:true});
  } catch(e) {res.status(500).json({error:e.message});}
});

// ===== ORDERS =====
app.post("/orders", async (req, res) => {
  try {
    const order = await Order.create(req.body);
    res.json(order);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/orders/:email", async (req, res) => {
  try {
    const orders = await Order.find({customerEmail:req.params.email}).sort({createdAt:-1});
    res.json(orders);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/admin/orders", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    const orders = await Order.find().sort({createdAt:-1}).limit(100);
    res.json(orders);
  } catch(e) {res.status(500).json({error:e.message});}
});

// ===== STRIPE WEBHOOK =====
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) {return res.status(400).json({error:e.message});}
  if(event.type === "checkout.session.completed"){
    const session = event.data.object;
    const email = session.customer_email;
    const amount = session.amount_total;
    if(email){
      let plan = "pro";
      if(amount >= 4999) plan = "business";
      await User.updateOne({email}, {plan});
    }
  }
  res.json({received:true});
});

// ===== SEED PRODUCTS =====
app.post("/seed-products", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    const count = await Product.countDocuments();
    if(count > 0) return res.json({message:"Products already seeded", count});
    const products = [
      {name:"Wireless Headphones",description:"Premium wireless headphones with active noise cancellation. 30-hour battery life.",price:89.99,oldPrice:129.99,category:"electronics",image:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80",badge:"SALE",stock:15},
      {name:"Smart Watch Pro",description:"Smartwatch with health monitoring, GPS tracking, and 7-day battery life.",price:199.99,oldPrice:249.99,category:"electronics",image:"https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80",badge:"HOT",stock:8},
      {name:"4K Action Camera",description:"Waterproof 4K camera with image stabilization. Perfect for sports.",price:149.99,oldPrice:199.99,category:"electronics",image:"https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600&q=80",badge:"SALE",stock:20},
      {name:"Bluetooth Speaker",description:"360-degree surround sound, waterproof IPX7, 24-hour playtime.",price:59.99,oldPrice:79.99,category:"electronics",image:"https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&q=80",badge:"",stock:30},
      {name:"Premium Leather Jacket",description:"Genuine leather jacket with premium stitching. Classic style.",price:179.99,oldPrice:229.99,category:"fashion",image:"https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80",badge:"NEW",stock:12},
      {name:"Running Shoes Ultra",description:"Lightweight running shoes with responsive cushioning.",price:119.99,oldPrice:159.99,category:"fashion",image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80",badge:"HOT",stock:25},
      {name:"Designer Sunglasses",description:"UV400 protection polarized lenses. Scratch-resistant coating.",price:69.99,oldPrice:99.99,category:"fashion",image:"https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&q=80",badge:"SALE",stock:18},
      {name:"Cotton T-Shirt Pack x3",description:"Pack of 3 premium cotton t-shirts. Soft and breathable.",price:34.99,oldPrice:49.99,category:"fashion",image:"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80",badge:"",stock:50},
      {name:"Coffee Machine Deluxe",description:"Automatic coffee machine with grinder and milk frother.",price:129.99,oldPrice:179.99,category:"home",image:"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80",badge:"HOT",stock:10},
      {name:"Air Purifier HEPA",description:"HEPA filter removes 99.97% of particles. Covers 50m2.",price:89.99,oldPrice:119.99,category:"home",image:"https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&q=80",badge:"NEW",stock:14},
      {name:"Yoga Mat Premium",description:"Extra thick non-slip yoga mat. 6mm joint cushioning.",price:44.99,oldPrice:59.99,category:"sports",image:"https://images.unsplash.com/photo-1601925228897-b7ed5e97c26b?w=600&q=80",badge:"",stock:35},
      {name:"Protein Shaker Bottle",description:"BPA-free shaker bottle. 700ml capacity, leak-proof.",price:19.99,oldPrice:29.99,category:"sports",image:"https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600&q=80",badge:"",stock:100},
      {name:"Skincare Gift Set",description:"Complete skincare set: cleanser, toner, moisturizer and serum.",price:79.99,oldPrice:109.99,category:"beauty",image:"https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&q=80",badge:"NEW",stock:22},
      {name:"Electric Toothbrush",description:"Sonic toothbrush with 5 cleaning modes. 30-day battery.",price:54.99,oldPrice:74.99,category:"beauty",image:"https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&q=80",badge:"SALE",stock:28},
      {name:"Kids Learning Tablet",description:"Educational tablet for kids 3-12. 5000+ learning games.",price:99.99,oldPrice:139.99,category:"kids",image:"https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=600&q=80",badge:"HOT",stock:16},
      {name:"Board Game Collection",description:"10 classic board games. Family fun for ages 4 and above.",price:39.99,oldPrice:54.99,category:"kids",image:"https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&q=80",badge:"NEW",stock:40},
    ];
    await Product.insertMany(products);
    res.json({success:true, message:"Products seeded", count:products.length});
  } catch(e) {res.status(500).json({error:e.message});}
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("NNIT Backend v2 running on port", PORT));